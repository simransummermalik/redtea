import {
  type AnyRoundGameState,
  type BlackGameState,
  type MixGameState,
  createBlackGame,
  createMixGame,
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
  stepMix,
} from "@redtea/engine";
import {
  type ClientMessage,
  clientMessageSchema,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  type ServerMessage,
  serverMessageSchema,
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
  ip: string;
  messageWindowAt: number;
  messageCount: number;
  violations: number;
}

interface RoomPlayer {
  id: string;
  name: string;
  kind: "human" | "bot";
  ready: boolean;
  connected: boolean;
  skill: number;
  sessionToken: string | null;
  joinRequestId: string;
  disconnectedAt: number | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

type Mode = "black" | "mix" | RoundModeName;
type EngineState = BlackGameState | AnyRoundGameState | MixGameState;

interface Room {
  code: string;
  phase: "lobby" | "countdown" | "playing" | "finished";
  hostId: string;
  mode: Mode;
  config: Record<string, number | boolean>;
  botCount: number;
  players: RoomPlayer[];
  peers: Set<string>;
  game: EngineState | null;
  timer: ReturnType<typeof setTimeout> | null;
  lifecycleTimer: ReturnType<typeof setTimeout> | null;
  countdownTimer: ReturnType<typeof setTimeout> | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  countdownEndsAt: number | null;
  lastActivityAt: number;
  creatorIp: string;
}

export interface RoomServiceOptions {
  catalog: WordCatalog;
  clock?: Clock;
  send?: (peerId: string, message: ServerMessage) => void;
  publish?: (roomCode: string, message: ServerMessage) => void;
  onRoomChange?: (peerId: string, roomCode: string | null) => void;
  codeFactory?: () => string;
  idFactory?: () => string;
  sessionTokenFactory?: () => string;
  reconnectGraceMs?: number;
  countdownMs?: number;
  emptyRoomTimeoutMs?: number;
  idleRoomTimeoutMs?: number;
  maxRooms?: number;
  maxRoomsPerIp?: number;
  maxPlayersPerRoom?: number;
  log?: (event: string, fields: Record<string, string | number>) => void;
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
  private readonly sessionTokenFactory: () => string;

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
    this.sessionTokenFactory =
      options.sessionTokenFactory ?? (() => crypto.randomUUID().replaceAll("-", ""));
  }

  connect(id: string, send?: (message: ServerMessage) => void, ip = "unknown"): void {
    this.peers.set(id, {
      id,
      send: send ?? ((message) => this.sendDefault(id, message)),
      roomCode: null,
      playerId: null,
      lastSubmitAt: 0,
      submitCount: 0,
      submitWindowAt: this.clock.now(),
      greeted: false,
      ip,
      messageWindowAt: this.clock.now(),
      messageCount: 0,
      violations: 0,
    });
  }

  receive(peerId: string, input: string | Uint8Array): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    const now = this.clock.now();
    if (now - peer.messageWindowAt >= 1_000) {
      peer.messageWindowAt = now;
      peer.messageCount = 0;
    }
    peer.messageCount += 1;
    if (peer.messageCount > 30) {
      this.violation(peer, "rate_limited", "Too many messages");
      return;
    }
    const byteLength =
      typeof input === "string" ? new TextEncoder().encode(input).byteLength : input.byteLength;
    if (byteLength > MAX_MESSAGE_BYTES) {
      this.violation(peer, "message_too_large", "Message is too large");
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(typeof input === "string" ? input : new TextDecoder().decode(input));
    } catch {
      this.violation(peer, "malformed_message", "Malformed message");
      return;
    }
    const parsed = clientMessageSchema.safeParse(raw);
    if (!parsed.success) {
      this.violation(peer, "malformed_message", "Malformed message");
      return;
    }
    try {
      this.handle(peer, parsed.data);
    } catch (error) {
      this.log("client_message_error", { peerId: peer.id, error: this.errorText(error) });
      this.violation(peer, "invalid_action", "Could not process that action");
    }
  }

  disconnect(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (peer.roomCode && peer.playerId) {
      const room = this.rooms.get(peer.roomCode);
      if (room) {
        room.peers.delete(peerId);
        this.changeRoom(peerId, null);
        const player = room.players.find(({ id }) => id === peer.playerId);
        if (player) {
          player.connected = false;
          player.disconnectedAt = this.clock.now();
          player.graceTimer = this.clock.setTimeout(
            () => this.expireGrace(room, player),
            this.options.reconnectGraceMs ?? 30_000,
          );
        }
        room.lastActivityAt = this.clock.now();
        if (room.players.every((entry) => entry.kind !== "human" || !entry.connected))
          this.scheduleEmptyCleanup(room);
        this.broadcast(room);
        this.log("player_disconnected", { roomCode: room.code, playerId: peer.playerId });
      }
    }
    this.peers.delete(peerId);
  }

  private violation(peer: Peer, code: string, message: string): void {
    peer.violations += 1;
    if (peer.violations === 2) this.error(peer, code, message);
    if (peer.violations >= 3) {
      this.error(peer, "disconnected", "Connection closed for repeated invalid traffic");
      this.disconnect(peer.id);
    }
  }

  private errorText(error: unknown): string {
    return error instanceof Error ? error.name.slice(0, 80) : "unknown";
  }

  private log(event: string, fields: Record<string, string | number>): void {
    this.options.log?.(event, fields);
  }

  private changeRoom(peerId: string, roomCode: string | null): void {
    try {
      this.options.onRoomChange?.(peerId, roomCode);
    } catch (error) {
      this.log("room_subscription_error", { peerId, error: this.errorText(error) });
    }
  }

  private cleanName(value: string): string {
    const cleaned = Array.from(
      value
        .replace(/\p{Cc}/gu, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
      .slice(0, 24)
      .join("");
    return cleaned || "Player";
  }

  private rejoin(peer: Peer, token: string): void {
    for (const room of this.rooms.values()) {
      const player = room.players.find((entry) => entry.sessionToken === token);
      if (!player || player.connected || player.disconnectedAt === null) continue;
      if (this.clock.now() - player.disconnectedAt > (this.options.reconnectGraceMs ?? 30_000))
        continue;
      if (player.graceTimer) this.clock.clearTimeout(player.graceTimer);
      player.graceTimer = null;
      player.sessionToken = this.sessionTokenFactory();
      player.disconnectedAt = null;
      player.connected = true;
      this.attach(peer, room, player.id);
      return;
    }
    this.error(peer, "session_expired", "That reconnect session has expired");
  }

  private resumeJoinRequest(peer: Peer, requestId: string): boolean {
    if (peer.roomCode) {
      this.error(peer, "already_in_room", "Leave your current room first");
      return true;
    }
    for (const room of this.rooms.values()) {
      const player = room.players.find((entry) => entry.joinRequestId === requestId);
      if (!player) continue;
      if (!player.connected && player.disconnectedAt !== null && player.sessionToken) {
        if (this.clock.now() - player.disconnectedAt <= (this.options.reconnectGraceMs ?? 30_000)) {
          if (player.graceTimer) this.clock.clearTimeout(player.graceTimer);
          player.graceTimer = null;
          player.sessionToken = this.sessionTokenFactory();
          player.disconnectedAt = null;
          player.connected = true;
          this.attach(peer, room, player.id);
          return true;
        }
      }
      this.error(peer, "session_expired", "That room request can no longer be resumed");
      return true;
    }
    return false;
  }

  private expireGrace(room: Room, player: RoomPlayer): void {
    player.graceTimer = null;
    if (player.connected || player.disconnectedAt === null) return;
    player.sessionToken = null;
    if (room.hostId === player.id) {
      const nextHost = room.players.find(({ connected, kind }) => connected && kind === "human");
      if (nextHost) {
        room.hostId = nextHost.id;
        this.log("host_migrated", { roomCode: room.code, playerId: nextHost.id });
      }
    }
    this.broadcast(room);
  }

  private leave(peer: Peer, room: Room): void {
    const player = room.players.find(({ id }) => id === peer.playerId);
    if (player) {
      player.connected = false;
      player.disconnectedAt = this.clock.now();
      player.sessionToken = null;
      if (player.graceTimer) this.clock.clearTimeout(player.graceTimer);
      player.graceTimer = null;
    }
    room.peers.delete(peer.id);
    peer.roomCode = null;
    peer.playerId = null;
    this.changeRoom(peer.id, null);
    if (room.hostId === player?.id) {
      const nextHost = room.players.find(({ connected, kind }) => connected && kind === "human");
      if (nextHost) room.hostId = nextHost.id;
    }
    if (room.players.every((entry) => entry.kind !== "human" || !entry.connected))
      this.scheduleEmptyCleanup(room);
    this.broadcast(room);
  }

  private scheduleEmptyCleanup(room: Room): void {
    if (room.lifecycleTimer) this.clock.clearTimeout(room.lifecycleTimer);
    room.lifecycleTimer = this.clock.setTimeout(() => {
      room.lifecycleTimer = null;
      if (room.players.some((entry) => entry.kind === "human" && entry.connected)) return;
      this.closeRoom(room, "empty");
    }, this.options.emptyRoomTimeoutMs ?? 120_000);
  }

  private scheduleIdleCleanup(room: Room): void {
    if (room.idleTimer) this.clock.clearTimeout(room.idleTimer);
    room.idleTimer = this.clock.setTimeout(
      () => {
        room.idleTimer = null;
        const idleFor = this.clock.now() - room.lastActivityAt;
        const timeout = this.options.idleRoomTimeoutMs ?? 30 * 60_000;
        if (idleFor >= timeout) this.closeRoom(room, "idle");
        else this.scheduleIdleCleanup(room);
      },
      this.options.idleRoomTimeoutMs ?? 30 * 60_000,
    );
  }

  private closeRoom(room: Room, reason: string): void {
    if (room.timer) this.clock.clearTimeout(room.timer);
    if (room.lifecycleTimer) this.clock.clearTimeout(room.lifecycleTimer);
    if (room.countdownTimer) this.clock.clearTimeout(room.countdownTimer);
    if (room.idleTimer) this.clock.clearTimeout(room.idleTimer);
    for (const player of room.players)
      if (player.graceTimer) this.clock.clearTimeout(player.graceTimer);
    for (const peerId of room.peers) {
      const peer = this.peers.get(peerId);
      if (peer) this.error(peer, "room_closed", "This room has closed");
      this.changeRoom(peerId, null);
      if (peer) {
        peer.roomCode = null;
        peer.playerId = null;
      }
    }
    room.peers.clear();
    this.rooms.delete(room.code);
    this.log("room_closed", { roomCode: room.code, reason });
  }

  shutdown(): void {
    for (const peer of this.peers.values())
      this.send(peer.id, { type: "shutdown", retryAfterMs: 1_000 });
    for (const room of this.rooms.values()) this.closeRoom(room, "shutdown");
    for (const peerId of this.peers.keys()) this.disconnect(peerId);
  }

  private handle(peer: Peer, message: ClientMessage): void {
    if (message.type === "hello") {
      if (message.version !== PROTOCOL_VERSION) {
        this.error(peer, "version_mismatch", "Unsupported protocol version");
        return;
      }
      peer.greeted = true;
      this.send(peer.id, {
        type: "hello",
        version: PROTOCOL_VERSION,
        clientSentAt: message.clientSentAt,
        serverReceivedAt: this.clock.now(),
      });
      if (message.sessionToken) this.rejoin(peer, message.sessionToken);
      return;
    }
    if (!peer.greeted) return;
    if (message.type === "create_room") {
      if (!this.resumeJoinRequest(peer, message.requestId))
        this.createRoom(peer, message.name, message.requestId);
      return;
    }
    if (message.type === "join_room") {
      if (!this.resumeJoinRequest(peer, message.requestId))
        this.joinRoom(peer, message.code, message.name, message.requestId);
      return;
    }
    const room = peer.roomCode ? this.rooms.get(peer.roomCode) : undefined;
    if (!room || !peer.playerId) {
      this.error(peer, "not_in_room", "Join a room first");
      return;
    }
    if (message.type === "leave_room") {
      this.leave(peer, room);
      return;
    }
    const player = room.players.find(({ id }) => id === peer.playerId);
    if (!player) return;
    room.lastActivityAt = this.clock.now();
    this.scheduleIdleCleanup(room);
    if (message.type === "set_ready" && room.phase === "lobby") {
      player.ready = message.ready;
      this.broadcast(room);
    } else if (message.type === "configure_room" && room.phase === "lobby") {
      if (room.hostId !== player.id) {
        this.error(peer, "host_only", "Only the host can change room settings");
        return;
      }
      if (room.players.length + message.botCount > (this.options.maxPlayersPerRoom ?? 8)) {
        this.error(peer, "room_full", "Room size limit exceeded");
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
    if (peer.submitCount >= 8 || now - peer.lastSubmitAt < 100) {
      this.violation(peer, "rate_limited", "Please slow down");
      return false;
    }
    peer.submitCount += 1;
    peer.lastSubmitAt = now;
    return true;
  }

  private createRoom(peer: Peer, playerName: string, requestId: string): void {
    if (peer.roomCode) {
      this.error(peer, "already_in_room", "Leave your current room first");
      return;
    }
    const ownedRooms = [...this.rooms.values()].filter((room) => room.creatorIp === peer.ip).length;
    if (
      this.rooms.size >= (this.options.maxRooms ?? 500) ||
      ownedRooms >= (this.options.maxRoomsPerIp ?? 3)
    ) {
      this.error(peer, "room_limit", "Room creation limit reached");
      return;
    }
    let code = this.codeFactory();
    let attempts = 0;
    while (this.rooms.has(code) && attempts < 10) {
      code = this.codeFactory();
      attempts += 1;
    }
    if (this.rooms.has(code)) {
      this.error(peer, "room_limit", "Could not allocate a room code");
      return;
    }
    const playerId = this.idFactory();
    const room: Room = {
      code,
      phase: "lobby",
      hostId: playerId,
      mode: "green",
      config: { ...defaultGreenConfig, botCount: 0 },
      botCount: 0,
      players: [
        {
          id: playerId,
          name: this.cleanName(playerName),
          kind: "human",
          ready: true,
          connected: true,
          skill: 1,
          sessionToken: this.sessionTokenFactory(),
          joinRequestId: requestId,
          disconnectedAt: null,
          graceTimer: null,
        },
      ],
      peers: new Set([peer.id]),
      game: null,
      timer: null,
      lifecycleTimer: null,
      countdownTimer: null,
      idleTimer: null,
      countdownEndsAt: null,
      lastActivityAt: this.clock.now(),
      creatorIp: peer.ip,
    };
    this.rooms.set(code, room);
    this.scheduleIdleCleanup(room);
    this.log("room_created", { roomCode: code });
    this.attach(peer, room, playerId);
  }

  private joinRoom(peer: Peer, code: string, playerName: string, requestId: string): void {
    if (peer.roomCode) {
      this.error(peer, "already_in_room", "Leave your current room first");
      return;
    }
    const room = this.rooms.get(code);
    if (!room || (room.phase !== "lobby" && room.phase !== "countdown")) {
      this.error(peer, "room_unavailable", "That room is unavailable");
      return;
    }
    if (room.players.length + room.botCount >= (this.options.maxPlayersPerRoom ?? 8)) {
      this.error(peer, "room_full", "That room is full");
      return;
    }
    const playerId = this.idFactory();
    room.players.push({
      id: playerId,
      name: this.cleanName(playerName),
      kind: "human",
      ready: room.phase === "countdown",
      connected: true,
      skill: 1,
      sessionToken: this.sessionTokenFactory(),
      joinRequestId: requestId,
      disconnectedAt: null,
      graceTimer: null,
    });
    this.attach(peer, room, playerId);
  }

  private attach(peer: Peer, room: Room, playerId: string): void {
    peer.roomCode = room.code;
    peer.playerId = playerId;
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) return;
    room.peers.add(peer.id);
    room.lastActivityAt = this.clock.now();
    this.scheduleIdleCleanup(room);
    if (room.lifecycleTimer) {
      this.clock.clearTimeout(room.lifecycleTimer);
      room.lifecycleTimer = null;
    }
    this.changeRoom(peer.id, room.code);
    this.send(peer.id, {
      type: "welcome",
      playerId,
      roomCode: room.code,
      sessionToken: player.sessionToken ?? this.sessionTokenFactory(),
    });
    this.broadcast(room);
    this.log("player_joined", { roomCode: room.code, playerId });
  }

  private start(room: Room): void {
    if (room.players.some(({ connected, ready }) => !connected || !ready)) {
      const hostPeerId = [...room.peers].find(
        (peerId) => this.peers.get(peerId)?.playerId === room.hostId,
      );
      const hostPeer = hostPeerId ? this.peers.get(hostPeerId) : undefined;
      if (hostPeer)
        this.error(
          hostPeer,
          "not_ready",
          "Every connected player must be ready before opening the join window",
        );
      return;
    }
    room.phase = "countdown";
    room.countdownEndsAt = this.clock.now() + (this.options.countdownMs ?? 10_000);
    room.countdownTimer = this.clock.setTimeout(
      () => this.finishCountdown(room),
      this.options.countdownMs ?? 10_000,
    );
    this.broadcast(room);
  }

  private finishCountdown(room: Room): void {
    room.countdownTimer = null;
    room.countdownEndsAt = null;
    if (room.phase !== "countdown") return;
    const connectedHumans = room.players.filter(
      ({ connected, kind }) => connected && kind === "human",
    ).length;
    if (connectedHumans === 0 || connectedHumans + room.botCount < 2) {
      room.phase = "lobby";
      this.broadcast(room);
      this.sendHostError(
        room,
        "not_enough_players",
        "No one made it to the table in time. Invite a friend, then brew another round.",
      );
      return;
    }
    if (room.players.some(({ connected, ready }) => !connected || !ready)) {
      room.phase = "lobby";
      this.broadcast(room);
      this.sendHostError(
        room,
        "not_ready",
        "A player is no longer ready. The countdown has ended.",
      );
      return;
    }
    this.beginGame(room);
  }

  private sendHostError(room: Room, code: string, message: string): void {
    const peer = [...room.peers]
      .map((id) => this.peers.get(id))
      .find((value) => value?.playerId === room.hostId);
    if (peer) this.error(peer, code, message);
  }

  private beginGame(room: Room): void {
    const humans = room.players.filter(({ kind }) => kind === "human");
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
      else if (room.mode === "yellow")
        room.game = createYellowGame({
          players,
          catalog: this.options.catalog,
          seed,
          config: { ...room.config, botCount: room.botCount },
        });
      else
        room.game = createMixGame({
          players,
          catalog: this.options.catalog,
          seed,
          config: room.config,
        });
      const now = this.clock.now();
      room.game =
        room.game.mode === "black"
          ? step(room.game, { type: "START" }, now).state
          : room.game.mode === "mix"
            ? stepMix(room.game, { type: "START" }, now).state
            : stepRoundGame(room.game, { type: "START" }, now).state;
      room.phase = "playing";
      room.lastActivityAt = this.clock.now();
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
      room.phase = "lobby";
      this.broadcast(room);
    }
  }

  private submit(
    room: Room,
    playerId: string,
    message: Extract<ClientMessage, { type: "submit_word" | "submit_message" }>,
  ): void {
    if (!room.game) return;
    const now = this.clock.now();
    try {
      if (room.game.mode === "black") {
        if (message.type !== "submit_word") return;
        room.game = step(
          room.game,
          { type: "SUBMIT_WORD", playerId, word: message.word },
          now,
        ).state;
      } else if (room.game.mode === "mix") {
        room.game = stepMix(
          room.game,
          message.type === "submit_message"
            ? { type: "SUBMIT_MESSAGE", playerId, message: message.message }
            : { type: "SUBMIT_WORD", playerId, word: message.word },
          now,
        ).state;
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
      room.lastActivityAt = now;
      this.schedule(room);
      this.broadcast(room);
    } catch (error) {
      this.failRoom(room, error);
    }
  }

  private schedule(room: Room): void {
    if (room.timer) this.clock.clearTimeout(room.timer);
    room.timer = null;
    if (
      room.game?.status !== "playing" &&
      !(room.game?.mode === "mix" && room.game.status === "intermission")
    )
      return;
    const deadlines =
      room.game.mode === "black"
        ? [room.game.turnEndsAt, room.game.botAction?.dueAt]
        : room.game.mode === "mix"
          ? room.game.status === "intermission"
            ? [room.game.intermissionEndsAt]
            : room.game.activeGame?.mode === "black"
              ? [room.game.activeGame.turnEndsAt, room.game.activeGame.botAction?.dueAt]
              : [
                  room.game.activeGame?.roundEndsAt,
                  ...(room.game.activeGame?.botActions.map(({ dueAt }) => dueAt) ?? []),
                ]
          : [room.game.roundEndsAt, ...room.game.botActions.map(({ dueAt }) => dueAt)];
    const next = deadlines
      .filter((value): value is number => value !== null && value !== undefined)
      .reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(next)) return;
    room.timer = this.clock.setTimeout(
      () => {
        room.timer = null;
        if (!room.game) return;
        try {
          const now = this.clock.now();
          room.game =
            room.game.mode === "black"
              ? step(room.game, { type: "TICK" }, now).state
              : room.game.mode === "mix"
                ? stepMix(room.game, { type: "TICK" }, now).state
                : stepRoundGame(room.game, { type: "TICK" }, now).state;
          if (room.game.status === "finished") room.phase = "finished";
          room.lastActivityAt = now;
          this.scheduleIdleCleanup(room);
          this.schedule(room);
          this.broadcast(room);
        } catch (error) {
          this.failRoom(room, error);
        }
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
    if (game.mode === "mix") {
      const { catalog: _catalog, rngState: _rng, activeGame, ...visible } = game;
      let publicActive: unknown = activeGame;
      if (activeGame?.mode === "black") {
        const {
          catalog: _childCatalog,
          rngState: _childRng,
          botAction: _bot,
          ...child
        } = activeGame;
        publicActive = child;
      } else if (activeGame) {
        const {
          catalog: _childCatalog,
          rngState: _childRng,
          botActions: _bots,
          ...child
        } = activeGame;
        publicActive = child;
        if (activeGame.mode === "yellow" && activeGame.status === "playing") {
          publicActive = {
            ...child,
            roundSubmissions: activeGame.roundSubmissions.map((submission) => ({
              ...submission,
              text: "",
              validWords: [],
              invalidWords: [],
              score: 0,
            })),
          };
        }
      }
      return {
        ...visible,
        ...(game.currentTea === "yellow" && game.status === "playing"
          ? { players: game.players.map((player) => ({ ...player, points: 0 })) }
          : {}),
        activeGame: publicActive,
      };
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
    try {
      const message: ServerMessage = {
        type: "snapshot",
        room: {
          code: room.code,
          phase: room.phase,
          hostId: room.hostId,
          mode: room.mode,
          botCount: room.botCount,
          countdownEndsAt: room.countdownEndsAt,
        },
        players: room.players.map(({ id, name, kind, ready, connected }) => ({
          id,
          name,
          kind,
          ready,
          connected,
        })),
        game: this.publicGame(room),
      };
      const parsed = serverMessageSchema.safeParse(message);
      if (!parsed.success) throw new Error("Generated snapshot failed protocol validation");
      this.publishDefault(room.code, parsed.data);
    } catch (error) {
      this.log("broadcast_error", { roomCode: room.code, error: this.errorText(error) });
    }
  }

  private send(peerId: string, message: ServerMessage): void {
    const peer = this.peers.get(peerId);
    const parsed = serverMessageSchema.safeParse(message);
    if (!parsed.success) {
      this.log("invalid_server_message", { peerId });
      return;
    }
    try {
      peer?.send(parsed.data);
    } catch (error) {
      this.log("send_error", { peerId, error: this.errorText(error) });
    }
  }

  private error(peer: Peer, code: string, message: string): void {
    this.send(peer.id, { type: "error", code, message });
  }

  private failRoom(room: Room, error: unknown): void {
    if (room.timer) this.clock.clearTimeout(room.timer);
    room.timer = null;
    room.phase = "finished";
    this.log("room_step_error", { roomCode: room.code, error: this.errorText(error) });
    for (const peerId of room.peers) {
      const peer = this.peers.get(peerId);
      if (peer) this.error(peer, "room_error", "This game stopped after an internal error");
    }
    this.broadcast(room);
  }
}

export function catalogFromData(
  wordsText: string,
  fragmentEntries: readonly { fragment: string; solutionCount: number }[],
): WordCatalog {
  return createWordCatalog(wordsText.trim().split(/\r?\n/), fragmentEntries);
}
