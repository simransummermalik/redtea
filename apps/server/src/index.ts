import { extname, relative, resolve } from "node:path";
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, type ServerMessage } from "@redtea/protocol";
import { catalogFromData, RoomService } from "./rooms";

interface SocketData {
  id: string;
  roomCode: string | null;
  ip: string;
}

async function loadCatalog() {
  const wordsPath = new URL("../../../packages/words/data/generated/words.txt", import.meta.url);
  const fragmentsPath = new URL(
    "../../../packages/words/data/generated/fragments.json",
    import.meta.url,
  );
  const [wordsText, fragmentsText] = await Promise.all([
    Bun.file(wordsPath).text(),
    Bun.file(fragmentsPath).text(),
  ]);
  return catalogFromData(
    wordsText,
    JSON.parse(fragmentsText) as { fragment: string; solutionCount: number }[],
  );
}

export async function startServer(port = Number(Bun.env.PORT ?? 3001)) {
  const catalog = await loadCatalog();
  let server: ReturnType<typeof Bun.serve<SocketData>>;
  const sockets = new Map<string, import("bun").ServerWebSocket<SocketData>>();
  const service = new RoomService({
    catalog,
    reconnectGraceMs: Number(Bun.env.RECONNECT_GRACE_MS ?? 30_000),
    countdownMs: Number(Bun.env.LOBBY_COUNTDOWN_MS ?? 10_000),
    emptyRoomTimeoutMs: Number(Bun.env.EMPTY_ROOM_TIMEOUT_MS ?? 120_000),
    idleRoomTimeoutMs: Number(Bun.env.IDLE_ROOM_TIMEOUT_MS ?? 30 * 60_000),
    maxRooms: Number(Bun.env.MAX_ROOMS ?? 500),
    maxRoomsPerIp: Number(Bun.env.MAX_ROOMS_PER_IP ?? 3),
    maxPlayersPerRoom: Number(Bun.env.MAX_PLAYERS_PER_ROOM ?? 8),
    log: (event, fields) =>
      console.info(JSON.stringify({ at: new Date().toISOString(), event, ...fields })),
    publish: (roomCode, message) => server.publish(roomCode, JSON.stringify(message)),
    onRoomChange: (peerId, roomCode) => {
      const socket = sockets.get(peerId);
      if (!socket) return;
      const previous = socket.data.roomCode;
      if (previous) socket.unsubscribe(previous);
      socket.data.roomCode = roomCode;
      if (roomCode) socket.subscribe(roomCode);
    },
  });

  const webRoot = resolve(import.meta.dir, "../../web/dist");

  server = Bun.serve<SocketData>({
    port,
    hostname: "0.0.0.0",
    async fetch(request, serverInstance) {
      const url = new URL(request.url);
      if (url.pathname === "/health")
        return Response.json({ ok: true, protocolVersion: PROTOCOL_VERSION });
      const forwardedIp =
        request.headers.get("fly-client-ip") ??
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const ip = forwardedIp ?? serverInstance.requestIP(request)?.address ?? "unknown";
      if (
        url.pathname === "/ws" &&
        serverInstance.upgrade(request, { data: { id: crypto.randomUUID(), roomCode: null, ip } })
      )
        return undefined;
      if (request.method === "GET" || request.method === "HEAD") {
        let pathname: string;
        try {
          pathname = decodeURIComponent(url.pathname);
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const requestedPath = pathname === "/" ? "/index.html" : pathname;
        const filePath = resolve(webRoot, `.${requestedPath}`);
        const relativePath = relative(webRoot, filePath);
        if (relativePath.startsWith("..") || relativePath.startsWith("/"))
          return new Response("Not found", { status: 404 });
        const file = Bun.file(filePath);
        if (extname(filePath) && (await file.exists())) return new Response(file);
        const index = Bun.file(resolve(webRoot, "index.html"));
        if (await index.exists()) return new Response(index);
      }
      return new Response("Not found", { status: 404 });
    },
    websocket: {
      maxPayloadLength: MAX_MESSAGE_BYTES,
      open(socket) {
        sockets.set(socket.data.id, socket);
        service.connect(
          socket.data.id,
          (message: ServerMessage) => socket.send(JSON.stringify(message)),
          socket.data.ip,
        );
      },
      message(socket, message) {
        service.receive(
          socket.data.id,
          typeof message === "string" ? message : new Uint8Array(message),
        );
      },
      close(socket) {
        service.disconnect(socket.data.id);
        sockets.delete(socket.data.id);
      },
    },
  });
  Object.assign(server, { shutdown: () => service.shutdown() });
  return server;
}

if (import.meta.main) {
  const server = await startServer();
  console.info(
    JSON.stringify({ at: new Date().toISOString(), event: "server_started", port: server.port }),
  );
  const shutdown = () => {
    const extended = server as typeof server & { shutdown?: () => void };
    extended.shutdown?.();
    server.stop(true);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
