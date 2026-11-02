import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, type ServerMessage } from "@redtea/protocol";
import { catalogFromData, RoomService } from "./rooms";

interface SocketData {
  id: string;
  roomCode: string | null;
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

  server = Bun.serve<SocketData>({
    port,
    fetch(request, serverInstance) {
      const url = new URL(request.url);
      if (url.pathname === "/health")
        return Response.json({ ok: true, protocolVersion: PROTOCOL_VERSION });
      if (
        url.pathname === "/ws" &&
        serverInstance.upgrade(request, { data: { id: crypto.randomUUID(), roomCode: null } })
      )
        return undefined;
      return new Response("Not found", { status: 404 });
    },
    websocket: {
      maxPayloadLength: MAX_MESSAGE_BYTES,
      open(socket) {
        sockets.set(socket.data.id, socket);
        service.connect(socket.data.id, (message: ServerMessage) =>
          socket.send(JSON.stringify(message)),
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
  return server;
}

if (import.meta.main) {
  const server = await startServer();
  console.log(`Redtea server listening on http://localhost:${server.port}`);
}
