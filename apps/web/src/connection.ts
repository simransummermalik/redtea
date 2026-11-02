import {
  type AnyRoundGameState,
  type BlackGameState,
  createBlackGame,
  createGreenGame,
  createRedGame,
  createYellowGame,
  type GamePlayer,
  type GreenConfig,
  type RedConfig,
  type RoundModeEffect,
  type RoundModeName,
  step,
  stepRoundGame,
  type WordCatalog,
  type YellowConfig,
} from "@redtea/engine";
import { PROTOCOL_VERSION, serverMessageSchema } from "@redtea/protocol";

export type GameMode = "black" | RoundModeName;
export type AnyGameState = BlackGameState | AnyRoundGameState;
export interface RoomView {
  type: "snapshot";
  room: {
    code: string;
    phase: "lobby" | "countdown" | "playing" | "finished";
    hostId: string;
    mode: GameMode;
    botCount: number;
    countdownEndsAt: number | null;
  };
  players: {
    id: string;
    name: string;
    kind: "human" | "bot";
    ready: boolean;
    connected: boolean;
  }[];
  game: unknown;
}
export interface ConnectionUpdate {
  game: AnyGameState | null;
  now: number;
  effects: readonly (RoundModeEffect | { type: string; [key: string]: unknown })[];
  room?: RoomView;
  error?: string;
  connectionState: "connected" | "reconnecting" | "disconnected";
}

export interface StartOptions {
  mode: GameMode;
  players: readonly GamePlayer[];
  catalog: WordCatalog;
  seed: number;
  config: Record<string, number | boolean>;
}

export interface GameConnection {
  playerId(): string;
  subscribe(listener: (update: ConnectionUpdate) => void): () => void;
  start(options: StartOptions): void;
  submit(mode: GameMode, text: string): void;
  tick(): void;
  createRoom(name: string): void;
  joinRoom(code: string, name: string): void;
  setReady(ready: boolean): void;
  configureRoom(mode: GameMode, config: Record<string, number | boolean>, botCount: number): void;
  startRoom(): void;
  close(): void;
  connected(): boolean;
}

type PendingRoomAction =
  | { type: "create_room"; requestId: string; name: string }
  | { type: "join_room"; requestId: string; code: string; name: string };

abstract class BaseConnection implements GameConnection {
  protected game: AnyGameState | null = null;
  protected listeners = new Set<(update: ConnectionUpdate) => void>();
  protected myId = "you";
  protected room: RoomView | undefined;
  protected error: string | undefined;
  protected state: "connected" | "reconnecting" | "disconnected" = "connected";

  playerId(): string {
    return this.myId;
  }

  connected(): boolean {
    return this.state === "connected";
  }

  subscribe(listener: (update: ConnectionUpdate) => void): () => void {
    this.listeners.add(listener);
    listener({
      game: this.game,
      now: this.now(),
      effects: [],
      connectionState: this.state,
      ...(this.room ? { room: this.room } : {}),
      ...(this.error ? { error: this.error } : {}),
    });
    return () => this.listeners.delete(listener);
  }

  protected now(): number {
    return performance.now();
  }

  protected emit(effects: ConnectionUpdate["effects"] = []): void {
    const update = {
      game: this.game,
      now: this.now(),
      effects,
      connectionState: this.state,
      ...(this.room ? { room: this.room } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
    for (const listener of this.listeners) listener(update);
  }

  abstract start(options: StartOptions): void;
  abstract submit(mode: GameMode, text: string): void;
  abstract tick(): void;
  abstract createRoom(name: string): void;
  abstract joinRoom(code: string, name: string): void;
  abstract setReady(ready: boolean): void;
  abstract configureRoom(
    mode: GameMode,
    config: Record<string, number | boolean>,
    botCount: number,
  ): void;
  abstract startRoom(): void;
  abstract close(): void;
}

export class LocalConnection extends BaseConnection {
  start(options: StartOptions): void {
    if (options.mode === "black") {
      this.game = createBlackGame({
        players: options.players,
        catalog: options.catalog,
        seed: options.seed,
        config: options.config,
      });
      const result = step(this.game, { type: "START" }, this.now());
      this.game = result.state;
      this.emit(result.effects);
    } else if (options.mode === "green") {
      this.game = createGreenGame({
        players: options.players,
        catalog: options.catalog,
        seed: options.seed,
        config: options.config as Partial<GreenConfig>,
      });
      const result = stepRoundGame(this.game, { type: "START" }, this.now());
      this.game = result.state;
      this.emit(result.effects);
    } else if (options.mode === "red") {
      this.game = createRedGame({
        players: options.players,
        catalog: options.catalog,
        seed: options.seed,
        config: options.config as Partial<RedConfig>,
      });
      const result = stepRoundGame(this.game, { type: "START" }, this.now());
      this.game = result.state;
      this.emit(result.effects);
    } else {
      this.game = createYellowGame({
        players: options.players,
        catalog: options.catalog,
        seed: options.seed,
        config: options.config as Partial<YellowConfig>,
      });
      const result = stepRoundGame(this.game, { type: "START" }, this.now());
      this.game = result.state;
      this.emit(result.effects);
    }
  }

  submit(mode: GameMode, text: string): void {
    if (this.game?.status !== "playing") return;
    const now = this.now();
    if (this.game.mode === "black") {
      const result = step(this.game, { type: "SUBMIT_WORD", playerId: this.myId, word: text }, now);
      this.game = result.state;
      this.emit(result.effects);
    } else {
      const result = stepRoundGame(
        this.game,
        mode === "yellow"
          ? { type: "SUBMIT_MESSAGE", playerId: this.myId, message: text }
          : { type: "SUBMIT_WORD", playerId: this.myId, word: text },
        now,
      );
      this.game = result.state;
      this.emit(result.effects);
    }
  }

  tick(): void {
    if (!this.game) return;
    const now = this.now();
    const result =
      this.game.mode === "black"
        ? step(this.game, { type: "TICK" }, now)
        : stepRoundGame(this.game, { type: "TICK" }, now);
    if (result.effects.length) {
      this.game = result.state;
      this.emit(result.effects);
    } else this.emit();
  }

  createRoom(_name: string): void {}
  joinRoom(_code: string, _name: string): void {}
  setReady(_ready: boolean): void {}
  configureRoom(
    _mode: GameMode,
    _config: Record<string, number | boolean>,
    _botCount: number,
  ): void {}
  startRoom(): void {}
  close(): void {
    this.listeners.clear();
  }
}

export class RemoteConnection extends BaseConnection {
  private socket: WebSocket | undefined;
  private readonly pending: unknown[] = [];
  private sessionToken: string | undefined;
  private roomCode: string | undefined;
  private pendingRoomAction: PendingRoomAction | undefined;
  private manuallyClosed = false;
  private reconnectDelay = 500;
  private reconnectTimer: number | undefined;
  private offsetMs = 0;
  private clientSentAt = 0;

  constructor(resume?: {
    token?: string;
    roomCode?: string;
    pendingRoomAction?: PendingRoomAction;
  }) {
    super();
    this.sessionToken = resume?.token;
    this.roomCode = resume?.roomCode;
    this.pendingRoomAction = resume?.pendingRoomAction;
    this.openSocket();
  }

  private openSocket(): void {
    this.state = "reconnecting";
    const socket = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
    );
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket !== socket || this.manuallyClosed) return;
      this.clientSentAt = Date.now();
      this.send({
        type: "hello",
        version: PROTOCOL_VERSION,
        clientSentAt: this.clientSentAt,
        ...(this.sessionToken ? { sessionToken: this.sessionToken } : {}),
      });
      for (const message of this.pending.splice(0)) socket.send(JSON.stringify(message));
      if (!this.sessionToken && this.pendingRoomAction)
        socket.send(JSON.stringify(this.pendingRoomAction));
      this.emit();
    });
    socket.addEventListener("message", (event) => {
      if (this.socket === socket) this.onMessage(event.data);
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket || this.manuallyClosed) return;
      this.state = "reconnecting";
      this.emit();
      this.reconnectTimer = window.setTimeout(() => this.openSocket(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10_000);
    });
  }

  protected override now(): number {
    return Date.now() + this.offsetMs;
  }

  private send(message: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
    else if (this.socket?.readyState === WebSocket.CONNECTING && !this.sessionToken)
      this.pending.push(message);
  }

  private onMessage(data: unknown): void {
    if (typeof data !== "string") return;
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      return;
    }
    const parsed = serverMessageSchema.safeParse(raw);
    if (!parsed.success) return;
    const message = parsed.data;
    if (message.type === "hello") {
      this.reconnectDelay = 500;
      const receivedAt = Date.now();
      this.offsetMs = message.serverReceivedAt - (message.clientSentAt + receivedAt) / 2;
      if (!this.sessionToken) this.state = "connected";
    } else if (message.type === "welcome") {
      this.state = "connected";
      this.myId = message.playerId;
      this.sessionToken = message.sessionToken;
      this.roomCode = message.roomCode;
      this.saveSession(message.sessionToken, message.roomCode);
      this.pendingRoomAction = undefined;
      this.clearPendingRoomAction();
    } else if (message.type === "snapshot") {
      this.room = message;
      this.game = message.game as AnyGameState | null;
      this.error = undefined;
    } else if (message.type === "error") {
      this.error = message.message;
      if (this.pendingRoomAction) {
        this.pendingRoomAction = undefined;
        this.clearPendingRoomAction();
      }
      if (message.code === "session_expired") {
        this.state = "connected";
        this.sessionToken = undefined;
        this.roomCode = undefined;
        this.room = undefined;
        this.game = null;
        this.clearSession();
      } else if (message.code === "room_closed") {
        this.sessionToken = undefined;
        this.roomCode = undefined;
        this.room = undefined;
        this.game = null;
        this.clearSession();
      }
    } else if (message.type === "shutdown") {
      this.state = "reconnecting";
      this.reconnectDelay = Math.max(this.reconnectDelay, message.retryAfterMs);
    }
    this.emit();
  }

  private saveSession(token: string, roomCode: string): void {
    try {
      sessionStorage.setItem("redtea.session", JSON.stringify({ token, roomCode }));
    } catch {
      // Storage can be unavailable in private browsing; live reconnect still works.
    }
  }

  private clearSession(): void {
    try {
      sessionStorage.removeItem("redtea.session");
    } catch {}
  }

  private savePendingRoomAction(action: PendingRoomAction): void {
    try {
      sessionStorage.setItem("redtea.pendingRoomAction", JSON.stringify(action));
    } catch {
      // Storage can be unavailable; this request can still be retried within this page.
    }
  }

  private clearPendingRoomAction(): void {
    try {
      sessionStorage.removeItem("redtea.pendingRoomAction");
    } catch {}
  }

  start(_options: StartOptions): void {}
  submit(mode: GameMode, text: string): void {
    if (mode === "yellow") this.send({ type: "submit_message", message: text });
    else this.send({ type: "submit_word", word: text });
  }
  tick(): void {
    this.emit();
  }
  createRoom(name: string): void {
    this.pendingRoomAction = { type: "create_room", requestId: crypto.randomUUID(), name };
    this.savePendingRoomAction(this.pendingRoomAction);
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(this.pendingRoomAction));
  }
  joinRoom(code: string, name: string): void {
    this.pendingRoomAction = {
      type: "join_room",
      requestId: crypto.randomUUID(),
      code: code.toUpperCase(),
      name,
    };
    this.savePendingRoomAction(this.pendingRoomAction);
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(this.pendingRoomAction));
  }
  setReady(ready: boolean): void {
    this.send({ type: "set_ready", ready });
  }
  configureRoom(mode: GameMode, config: Record<string, number | boolean>, botCount: number): void {
    this.send({ type: "configure_room", mode, config, botCount });
  }
  startRoom(): void {
    this.send({ type: "start_game" });
  }
  close(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.send({ type: "leave_room" });
    this.clearSession();
    this.clearPendingRoomAction();
    this.socket?.close();
    this.state = "disconnected";
    this.listeners.clear();
  }
}
