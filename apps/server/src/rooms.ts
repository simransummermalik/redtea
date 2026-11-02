import {
  type AnyRoundGameState,
  type BlackGameState,
  createBlackGame,
  createGreenGame,
  createRedGame,
  createWordCatalog,
  createYellowGame,
  defaultGreenConfig,
  type GamePlayer,
  type RoundModeName,
  step,
  stepRoundGame,
  type WordCatalog,
} from "@redtea/engine";
import {
  type ClientMessage,
  clientMessageSchema,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  type ServerMessage,
} from "@redtea/protocol";

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timer) => clearTimeout(timer),
};

export interface RoomTransport {
  send(peerId: string, message: ServerMessage): void;
  publish(roomCode: string, message: ServerMessage): void;
}

interface Peer {
  id: string;
  send: (message: ServerMessage) => void;
  roomCode: string | null;
  playerId: string | null;
  lastSubmitAt: number;
  submitCount: number;
  submitWindowAt: number;
  greeted: boolean;
}

interface RoomPlayer {
  id: string;
  name: string;
  kind: "human" | "bot";
  ready: boolean;
  connected: boolean;
  skill: number;
}

type Mode = "black" | RoundModeName;
type EngineState = BlackGameState | AnyRoundGameState;

interface Room {
  code: string;
  phase: "lobby" | "playing" | "finished";
  hostId: string;
  mode: Mode;
  config: Record<string, number | boolean>;
  botCount: number;
  players: RoomPlayer[];
  peers: Set<string>;
  game: EngineState | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface RoomServiceOptions {
  catalog: WordCatalog;
  clock?: Clock;
  send?: (peerId: string, message: ServerMessage) => void;
  publish?: (roomCode: string, message: ServerMessage) => void;
  onRoomChange?: (peerId: string, roomCode: string | null) => void;
  codeFactory?: () => string;
  idFactory?: () => string;
}

const codeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return [...bytes].map((byte) => codeChars[byte % codeChars.length]).join("");
}

export class RoomService {
  private readonly rooms = new Map<string, Room>();
  private readonly peers = new Map<string, Peer>();
  private readonly clock: Clock;
  private readonly sendDefault: (peerId: string, message: ServerMessage) => void;
  private readonly publishDefault: (roomCode: string, message: ServerMessage) => void;
  private readonly codeFactory: () => string;
  private readonly idFactory: () => string;

  constructor(private readonly options: RoomServiceOptions) {
    this.clock = options.clock ?? systemClock;
    this.sendDefault = options.send ?? (() => {});
    this.publishDefault =
      options.publish ??
      ((code, message) => {
        const room = this.rooms.get(code);
        if (room) for (const peerId of room.peers) this.send(peerId, message);
      });
    this.codeFactory = options.codeFactory ?? randomCode;
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  connect(id: string, send?: (message: ServerMessage) => void): void {
    this.peers.set(id, {
      id,
      send: send ?? ((message) => this.sendDefault(id, message)),
      roomCode: null,
      playerId: null,
      lastSubmitAt: 0,
      submitCount: 0,
      submitWindowAt: this.clock.now(),
      greeted: false,
    });
  }

  receive(peerId: string, input: string | Uint8Array): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    const byteLength =
      typeof input === "string" ? new TextEncoder().encode(input).byteLength : input.byteLength;
    if (byteLength > MAX_MESSAGE_BYTES) return;
    let raw: unknown;
    try {
      raw = JSON.parse(typeof input === "string" ? input : new TextDecoder().decode(input));
    } catch {
      return;
    }
    const parsed = clientMessageSchema.safeParse(raw);
    if (!parsed.success) return;
    this.handle(peer, parsed.data);
  }

  disconnect(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (peer.roomCode && peer.playerId) {
      const room = this.rooms.get(peer.roomCode);
      if (room) {
        room.peers.delete(peerId);
        this.options.onRoomChange?.(peerId, null);
        const player = room.players.find(({ id }) => id === peer.playerId);
        if (player) player.connected = false;
        if (room.hostId === peer.playerId) {
          room.hostId =
            room.players.find(({ connected, kind }) => connected && kind === "human")?.id ??
            room.hostId;
        }
        this.broadcast(room);
      }
    }
    this.peers.delete(peerId);
  }

  private handle(peer: Peer, message: ClientMessage): void {
    if (message.type === "hello") {
      if (message.version !== PROTOCOL_VERSION) {
        this.error(peer, "version_mismatch", "Unsupported protocol version");
        return;
      }
      peer.greeted = true;
      peer.send({
        type: "hello",
        version: PROTOCOL_VERSION,
        clientSentAt: message.clientSentAt,
        serverReceivedAt: this.clock.now(),
      });
      return;
    }
    if (!peer.greeted) return;
    if (message.type === "create_room") {
      this.createRoom(peer, message.name);
      return;
    }
    if (message.type === "join_room") {
      this.joinRoom(peer, message.code, message.name);
      return;
    }
    const room = peer.roomCode ? this.rooms.get(peer.roomCode) : undefined;
    if (!room || !peer.playerId) {
      this.error(peer, "not_in_room", "Join a room first");
      return;
    }
    if (message.type === "leave_room") {
      this.disconnect(peer.id);
      return;
    }
    const player = room.players.find(({ id }) => id === peer.playerId);
    if (!player) return;
    if (message.type === "set_ready" && room.phase === "lobby") {
      player.ready = message.ready;
      this.broadcast(room);
    } else if (message.type === "configure_room" && room.phase === "lobby") {
      if (room.hostId !== player.id) {
        this.error(peer, "host_only", "Only the host can change room settings");
        return;
      }
      room.mode = message.mode;
      room.config = message.config;
      room.botCount = message.botCount;
      this.broadcast(room);
    } else if (message.type === "start_game" && room.phase === "lobby") {
      if (room.hostId !== player.id) {
        this.error(peer, "host_only", "Only the host can start the game");
        return;
      }
      this.start(room);
    } else if (
      (message.type === "submit_word" || message.type === "submit_message") &&
      room.phase === "playing"
    ) {
      if (!this.allowSubmission(peer)) {
        this.error(peer, "rate_limited", "Please slow down");
        return;
      }
      this.submit(room, player.id, message);
    }
  }

  private allowSubmission(peer: Peer): boolean {
    const now = this.clock.now();
    if (now - peer.submitWindowAt >= 1_000) {
      peer.submitWindowAt = now;
      peer.submitCount = 0;
    }
    if (peer.submitCount >= 8 || now - peer.lastSubmitAt < 100) return false;
    peer.submitCount += 1;
    peer.lastSubmitAt = now;
    return true;
  }

  private createRoom(peer: Peer, playerName: string): void {
    if (peer.roomCode) {
      this.error(peer, "already_in_room", "Leave your current room first");
      return;
    }
    let code = this.codeFactory();
    while (this.rooms.has(code)) code = this.codeFactory();
    const playerId = this.idFactory();
    const room: Room = {
      code,
      phase: "lobby",
      hostId: playerId,
      mode: "green",
      config: { ...defaultGreenConfig, botCount: 0 },
      botCount: 0,
      players: [
        { id: playerId, name: playerName, kind: "human", ready: true, connected: true, skill: 1 },
      ],
      peers: new Set([peer.id]),
      game: null,
      timer: null,
    };
    this.rooms.set(code, room);
    this.attach(peer, room, playerId);
  }

  private joinRoom(peer: Peer, code: string, playerName: string): void {
    if (peer.roomCode) {
      this.error(peer, "already_in_room", "Leave your current room first");
      return;
    }
    const room = this.rooms.get(code);
    if (room?.phase !== "lobby") {
      this.error(peer, "room_unavailable", "That room is unavailable");
      return;
    }
    if (room.players.filter(({ kind }) => kind === "human").length >= 4) {
      this.error(peer, "room_full", "That room is full");
      return;
    }
    const playerId = this.idFactory();
    room.players.push({
      id: playerId,
      name: playerName,
      kind: "human",
      ready: false,
      connected: true,
      skill: 1,
    });
    this.attach(peer, room, playerId);
  }

  private attach(peer: Peer, room: Room, playerId: string): void {
    peer.roomCode = room.code;
    peer.playerId = playerId;
    room.peers.add(peer.id);
    this.options.onRoomChange?.(peer.id, room.code);
    peer.send({ type: "welcome", playerId, roomCode: room.code });
    this.broadcast(room);
  }

  private start(room: Room): void {
    const humans = room.players.filter(({ kind }) => kind === "human");
    if (
      humans.length + room.botCount < 2 ||
      room.players.some(({ connected, ready }) => !connected || !ready)
    ) {
      const hostPeerId = [...room.peers].find(
        (peerId) => this.peers.get(peerId)?.playerId === room.hostId,
      );
      const hostPeer = hostPeerId ? this.peers.get(hostPeerId) : undefined;
      if (hostPeer)
        this.error(
          hostPeer,
          "not_ready",
          "Every connected player must be ready and at least two seats are required",
        );
      return;
    }
    const players: GamePlayer[] = [
      ...humans.map(({ id, name, skill }) => ({ id, name, kind: "human" as const, skill })),
      ...Array.from({ length: room.botCount }, (_, index) => ({
        id: `bot-${index + 1}`,
        name: `Tea bot ${index + 1}`,
        kind: "bot" as const,
        skill: 0.65,
      })),
    ];
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
    try {
      if (room.mode === "black")
        room.game = createBlackGame({
          players,
          catalog: this.options.catalog,
          seed,
          config: room.config,
        });
      else if (room.mode === "green")
        room.game = createGreenGame({
          players,
          catalog: this.options.catalog,
          seed,
          config: { ...room.config, botCount: room.botCount },
        });
      else if (room.mode === "red")
        room.game = createRedGame({
          players,
          catalog: this.options.catalog,
          seed,
          config: { ...room.config, botCount: room.botCount },
        });
      else
        room.game = createYellowGame({
          players,
          catalog: this.options.catalog,
          seed,
          config: { ...room.config, botCount: room.botCount },
        });
      const now = this.clock.now();
      room.game =
        room.game.mode === "black"
          ? step(room.game, { type: "START" }, now).state
          : stepRoundGame(room.game, { type: "START" }, now).state;
      room.phase = "playing";
      this.schedule(room);
      this.broadcast(room);
    } catch (error) {
      const peer = [...room.peers]
        .map((id) => this.peers.get(id))
        .find((value) => value?.playerId === room.hostId);
      if (peer)
        this.error(
          peer,
          "invalid_config",
          error instanceof Error ? error.message : "Invalid room configuration",
        );
      room.game = null;
    }
  }

  private submit(
    room: Room,
    playerId: string,
    message: Extract<ClientMessage, { type: "submit_word" | "submit_message" }>,
  ): void {
    if (!room.game) return;
    const now = this.clock.now();
    if (room.game.mode === "black") {
      if (message.type !== "submit_word") return;
      room.game = step(room.game, { type: "SUBMIT_WORD", playerId, word: message.word }, now).state;
    } else {
      if (message.type === "submit_message" && room.game.mode === "yellow") {
        room.game = stepRoundGame(
          room.game,
          { type: "SUBMIT_MESSAGE", playerId, message: message.message },
          now,
        ).state;
      } else if (message.type === "submit_word" && room.game.mode !== "yellow") {
        room.game = stepRoundGame(
          room.game,
          { type: "SUBMIT_WORD", playerId, word: message.word },
          now,
        ).state;
      }
    }
    if (room.game.status === "finished") room.phase = "finished";
    this.schedule(room);
    this.broadcast(room);
  }

  private schedule(room: Room): void {
    if (room.timer) this.clock.clearTimeout(room.timer);
    room.timer = null;
    if (room.game?.status !== "playing") return;
    const deadlines =
      room.game.mode === "black"
        ? [room.game.turnEndsAt, room.game.botAction?.dueAt]
        : [room.game.roundEndsAt, ...room.game.botActions.map(({ dueAt }) => dueAt)];
    const next = deadlines
      .filter((value): value is number => value !== null && value !== undefined)
      .reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(next)) return;
    room.timer = this.clock.setTimeout(
      () => {
        room.timer = null;
        if (!room.game) return;
        const now = this.clock.now();
        room.game =
          room.game.mode === "black"
            ? step(room.game, { type: "TICK" }, now).state
            : stepRoundGame(room.game, { type: "TICK" }, now).state;
        if (room.game.status === "finished") room.phase = "finished";
        this.schedule(room);
        this.broadcast(room);
      },
      Math.max(0, next - this.clock.now()),
    );
  }

  private publicGame(room: Room): unknown {
    const game = room.game;
    if (!game) return null;
    if (game.mode === "black") {
      const { catalog: _catalog, rngState: _rng, botAction: _bot, ...visible } = game;
      return visible;
    }
    const { catalog: _catalog, rngState: _rng, botActions: _bots, ...visible } = game;
    if (game.mode === "yellow" && game.status === "playing") {
      return {
        ...visible,
        roundSubmissions: game.roundSubmissions.map((submission) => ({
          ...submission,
          text: "",
          validWords: [],
          invalidWords: [],
          score: 0,
        })),
      };
    }
    return visible;
  }

  private broadcast(room: Room): void {
    this.publishDefault(room.code, {
      type: "snapshot",
      room: {
        code: room.code,
        phase: room.phase,
        hostId: room.hostId,
        mode: room.mode,
        botCount: room.botCount,
      },
      players: room.players.map(({ id, name, kind, ready, connected }) => ({
        id,
        name,
        kind,
        ready,
        connected,
      })),
      game: this.publicGame(room),
    });
  }

  private send(peerId: string, message: ServerMessage): void {
    const peer = this.peers.get(peerId);
    peer?.send(message);
  }

  private error(peer: Peer, code: string, message: string): void {
    peer.send({ type: "error", code, message });
  }
}

export function catalogFromData(
  wordsText: string,
  fragmentEntries: readonly { fragment: string; solutionCount: number }[],
): WordCatalog {
  return createWordCatalog(wordsText.trim().split(/\r?\n/), fragmentEntries);
}
