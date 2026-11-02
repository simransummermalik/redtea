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
    phase: "lobby" | "playing" | "finished";
    hostId: string;
    mode: GameMode;
    botCount: number;
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
}

abstract class BaseConnection implements GameConnection {
  protected game: AnyGameState | null = null;
  protected listeners = new Set<(update: ConnectionUpdate) => void>();
  protected myId = "you";
  protected room: RoomView | undefined;
  protected error: string | undefined;

  playerId(): string {
    return this.myId;
  }

  subscribe(listener: (update: ConnectionUpdate) => void): () => void {
    this.listeners.add(listener);
    listener({
      game: this.game,
      now: this.now(),
      effects: [],
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
  private readonly socket: WebSocket;
  private readonly pending: unknown[] = [];
  private offsetMs = 0;
  private clientSentAt = 0;

  constructor() {
    super();
    this.socket = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
    );
    this.socket.addEventListener("open", () => {
      this.clientSentAt = Date.now();
      this.send({ type: "hello", version: PROTOCOL_VERSION, clientSentAt: this.clientSentAt });
      for (const message of this.pending.splice(0)) this.socket.send(JSON.stringify(message));
    });
    this.socket.addEventListener("message", (event) => this.onMessage(event.data));
  }

  protected override now(): number {
    return Date.now() + this.offsetMs;
  }

  private send(message: unknown): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
    else if (this.socket.readyState === WebSocket.CONNECTING) this.pending.push(message);
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
      const receivedAt = Date.now();
      this.offsetMs = message.serverReceivedAt - (message.clientSentAt + receivedAt) / 2;
    } else if (message.type === "welcome") {
      this.myId = message.playerId;
    } else if (message.type === "snapshot") {
      this.room = message;
      this.game = message.game as AnyGameState | null;
      this.error = undefined;
    } else if (message.type === "error") {
      this.error = message.message;
    }
    this.emit();
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
    this.send({ type: "create_room", name });
  }
  joinRoom(code: string, name: string): void {
    this.send({ type: "join_room", code: code.toUpperCase(), name });
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
    this.send({ type: "leave_room" });
    this.socket.close();
    this.listeners.clear();
  }
}
