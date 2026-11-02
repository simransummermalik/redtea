import { randomIndex } from "../random";
import type { PlayerDelta, PlayerId } from "../types";
import {
  blackTeaMode,
  createBlackGame,
  type BlackEvent,
  type BlackEffect,
  type BlackGameState,
  type BlackPlayerState,
  type GamePlayer,
  type WordCatalog,
} from "./black";
import {
  createGreenGame,
  createRedGame,
  createYellowGame,
  greenTeaMode,
  redTeaMode,
  yellowTeaMode,
  type AnyRoundGameState,
  type RoundModeEvent,
  type RoundModeEffect,
  type RoundModeName,
  type RoundResult,
  type GreenEvent,
  type RedEvent,
  type YellowEvent,
} from "./round-based";

export type MixTea = "black" | RoundModeName;
export type MixRoundState = BlackGameState | AnyRoundGameState;

export interface MixConfig {
  pointsToWin: number;
  baseHp: number;
  roundTimeMs: number;
  intermissionMs: number;
  avoidImmediateRepeat: boolean;
  reuseWordsPerTea: boolean;
  blackEnabled: boolean;
  greenEnabled: boolean;
  redEnabled: boolean;
  yellowEnabled: boolean;
  blackTimeMs: number;
  greenTimeMs: number;
  redTimeMs: number;
  yellowTimeMs: number;
  blackPoints: number;
  greenPoints: number;
  redPoints: number;
  yellowPoints: number;
  ignoreInvalidWords: boolean;
}

export const defaultMixConfig: MixConfig = {
  pointsToWin: 4,
  baseHp: 2,
  roundTimeMs: 10_000,
  intermissionMs: 1_200,
  avoidImmediateRepeat: true,
  reuseWordsPerTea: false,
  blackEnabled: true,
  greenEnabled: true,
  redEnabled: true,
  yellowEnabled: true,
  blackTimeMs: 0,
  greenTimeMs: 0,
  redTimeMs: 0,
  yellowTimeMs: 0,
  blackPoints: 1,
  greenPoints: 1,
  redPoints: 1,
  yellowPoints: 1,
  ignoreInvalidWords: true,
};

export interface MixPlayer extends GamePlayer {
  points: number;
  hp: number;
  alive: boolean;
}

export interface MixRoundResult {
  round: number;
  tea: MixTea;
  winnerId: PlayerId | null;
  deltas: Readonly<Record<PlayerId, PlayerDelta>>;
  reason: "submission" | "timeout" | "unavailable";
}

export interface MixGameState {
  mode: "mix";
  status: "ready" | "playing" | "intermission" | "finished";
  config: MixConfig;
  catalog: WordCatalog;
  players: MixPlayer[];
  roundNumber: number;
  currentTea: MixTea | null;
  blackNextPlayerId: PlayerId | null;
  upcomingTea: MixTea | null;
  intermissionEndsAt: number | null;
  activeGame: MixRoundState | null;
  roundResults: MixRoundResult[];
  roundStartingPoints: Readonly<Record<PlayerId, number>>;
  roundStartingHp: Readonly<Record<PlayerId, number>>;
  usedWords: string[];
  usedWordsByTea: Partial<Record<MixTea, string[]>>;
  rngState: number;
  winnerId: PlayerId | null;
}

export type MixEvent =
  | { type: "START" }
  | { type: "TICK" }
  | { type: "SUBMIT_WORD"; playerId: PlayerId; word: string }
  | { type: "SUBMIT_MESSAGE"; playerId: PlayerId; message: string };

export type MixEffect =
  | BlackEffect
  | RoundModeEffect
  | { type: "mix-round-started"; round: number; tea: MixTea; endsAt: number }
  | { type: "mix-round-resolved"; result: MixRoundResult }
  | { type: "mix-game-finished"; winnerId: PlayerId };

export interface MixTransition {
  state: MixGameState;
  effects: MixEffect[];
}

export interface CreateMixGameOptions {
  players: readonly GamePlayer[];
  catalog: WordCatalog;
  seed: number;
  config?: Partial<MixConfig>;
}

function enabledTeas(config: MixConfig): MixTea[] {
  return (["black", "green", "red", "yellow"] as const).filter((tea) => config[`${tea}Enabled`]);
}

export function createMixGame(options: CreateMixGameOptions): MixGameState {
  if (options.players.length < 2) throw new RangeError("Mix requires at least two players");
  if (new Set(options.players.map(({ id }) => id)).size !== options.players.length)
    throw new RangeError("Player IDs must be unique");
  if (options.catalog.fragments.length === 0)
    throw new RangeError("The word catalog has no fragments");
  const config = { ...defaultMixConfig, ...options.config };
  if (!enabledTeas(config).length) throw new RangeError("At least one tea must be enabled");
  if (!Number.isInteger(config.pointsToWin) || config.pointsToWin < 1)
    throw new RangeError("Points to win must be a positive integer");
  if (!Number.isInteger(config.baseHp) || config.baseHp < 1)
    throw new RangeError("Base HP must be a positive integer");
  if (!Number.isFinite(config.roundTimeMs) || config.roundTimeMs <= 0)
    throw new RangeError("Default round time must be positive");
  for (const tea of ["black", "green", "red", "yellow"] as const) {
    if (!Number.isFinite(config[`${tea}TimeMs`]) || config[`${tea}TimeMs`] < 0)
      throw new RangeError(`${tea} time override cannot be negative`);
    if (!Number.isInteger(config[`${tea}Points`]) || config[`${tea}Points`] < 0)
      throw new RangeError(`${tea} points must be a non-negative integer`);
  }
  return {
    mode: "mix",
    status: "ready",
    config,
    catalog: options.catalog,
    players: options.players.map((player) => ({
      ...player,
      skill: Math.max(0, Math.min(1, player.skill)),
      points: 0,
      hp: config.baseHp,
      alive: true,
    })),
    roundNumber: 0,
    currentTea: null,
    blackNextPlayerId: null,
    upcomingTea: null,
    intermissionEndsAt: null,
    activeGame: null,
    roundResults: [],
    roundStartingPoints: Object.fromEntries(options.players.map(({ id }) => [id, 0])),
    roundStartingHp: Object.fromEntries(options.players.map(({ id }) => [id, config.baseHp])),
    usedWords: [],
    usedWordsByTea: {},
    rngState: options.seed >>> 0,
    winnerId: null,
  };
}

function pickTeaFrom(
  state: MixGameState,
  previous: MixTea | null,
  candidates: MixTea[],
): { tea: MixTea; rngState: number } | null {
  let teas = candidates;
  if (state.config.avoidImmediateRepeat && teas.length > 1 && previous)
    teas = teas.filter((tea) => tea !== previous);
  if (teas.length === 0) return null;
  const draw = randomIndex({ rngState: state.rngState }, teas.length);
  const tea = teas[draw.index] ?? teas[0];
  if (!tea) return null;
  return { tea, rngState: draw.rngState };
}

function pickTea(state: MixGameState, previous: MixTea | null) {
  const picked = pickTeaFrom(state, previous, enabledTeas(state.config));
  if (!picked) throw new Error("Mix has no enabled teas");
  return picked;
}

function gamePlayers(state: MixGameState): GamePlayer[] {
  return state.players
    .filter(({ alive }) => alive)
    .map(({ id, name, kind, skill }) => ({ id, name, kind, skill }));
}

function usedForTea(state: MixGameState, tea: MixTea): string[] {
  return state.config.reuseWordsPerTea
    ? [...(state.usedWordsByTea[tea] ?? [])]
    : [...state.usedWords];
}

function teaTime(state: MixGameState, tea: MixTea): number {
  const override = state.config[`${tea}TimeMs`];
  const selected = override > 0 ? override : state.config.roundTimeMs;
  return tea === "black" ? Math.max(5_000, selected) : selected;
}

function createRound(state: MixGameState, tea: MixTea, seed: number): MixRoundState {
  let players = gamePlayers(state);
  if (tea === "black" && state.blackNextPlayerId) {
    const index = players.findIndex(({ id }) => id === state.blackNextPlayerId);
    if (index > 0) players = [...players.slice(index), ...players.slice(0, index)];
  }
  const botCount = players.filter(({ kind }) => kind === "bot").length;
  const pointValue = state.config[`${tea}Points`];
  if (tea === "black") {
    const child = createBlackGame({
      players,
      catalog: state.catalog,
      seed,
      config: {
        initialHp: state.config.baseHp,
        initialTurnMs: teaTime(state, "black"),
        stopAfterTimeout: true,
        pointsPerWord: pointValue,
      },
    });
    return {
      ...child,
      players: child.players.map((player) => {
        const mixPlayer = state.players.find(({ id }) => id === player.id);
        return {
          ...player,
          hp: mixPlayer?.hp ?? player.hp,
          alive: mixPlayer?.alive ?? player.alive,
          points: mixPlayer?.points ?? player.points,
        } satisfies BlackPlayerState;
      }),
      usedWords: usedForTea(state, tea),
    };
  }
  const common = {
    players,
    catalog: state.catalog,
    seed,
    config: {
      pointsToWin: Number.MAX_SAFE_INTEGER,
      roundTimeMs: teaTime(state, tea),
      botCount,
      manualRoundBoundary: true,
      pointValue,
      allowWordReuse: state.config.reuseWordsPerTea && tea !== "green",
      ignoreInvalidWords: state.config.ignoreInvalidWords,
    },
  };
  const child =
    tea === "green"
      ? createGreenGame(common)
      : tea === "red"
        ? createRedGame(common)
        : createYellowGame(common);
  return {
    ...child,
    players: child.players.map((player) => ({
      ...player,
      points: state.players.find(({ id }) => id === player.id)?.points ?? 0,
    })),
    usedWords: usedForTea(state, tea),
  } as AnyRoundGameState;
}

function syncChild(state: MixGameState, child: MixRoundState, tea: MixTea): MixGameState {
  let blackNextPlayerId = state.blackNextPlayerId;
  if (
    tea === "black" &&
    child.mode === "black" &&
    child.status === "between-rounds" &&
    child.currentPlayerId
  ) {
    const timedOutIndex = state.players.findIndex(({ id }) => id === child.currentPlayerId);
    for (let offset = 1; offset <= state.players.length; offset += 1) {
      const candidate = state.players[(timedOutIndex + offset) % state.players.length];
      if (candidate?.alive && candidate.id !== child.currentPlayerId) {
        blackNextPlayerId = candidate.id;
        break;
      }
    }
  }
  const players = state.players.map((player) => {
    const blackPlayer =
      child.mode === "black" ? child.players.find(({ id }) => id === player.id) : undefined;
    const childPlayer = child.players.find(({ id }) => id === player.id);
    if (!childPlayer) return player;
    return {
      ...player,
      points: childPlayer.points,
      ...(tea === "black" && blackPlayer ? { hp: blackPlayer.hp, alive: blackPlayer.alive } : {}),
    };
  });
  const childUsed = child.usedWords;
  if (state.config.reuseWordsPerTea) {
    const union = new Set([...(state.usedWordsByTea[tea] ?? []), ...childUsed]);
    return {
      ...state,
      players,
      blackNextPlayerId,
      usedWordsByTea: { ...state.usedWordsByTea, [tea]: [...union] },
    };
  }
  return {
    ...state,
    players,
    blackNextPlayerId,
    usedWords: [...new Set([...state.usedWords, ...childUsed])],
  };
}

function finish(state: MixGameState, winnerId: PlayerId, effects: MixEffect[]): MixGameState {
  effects.push({ type: "mix-game-finished", winnerId });
  return { ...state, status: "finished", winnerId, upcomingTea: null, intermissionEndsAt: null };
}

function completeMixRound(
  state: MixGameState,
  tea: MixTea,
  now: number,
  effects: MixEffect[],
  reason: MixRoundResult["reason"],
): MixGameState {
  const nextChildRound = state.roundNumber;
  const deltas: Record<string, PlayerDelta> = {};
  for (const player of state.players) {
    deltas[player.id] = {
      points: player.points - (state.roundStartingPoints[player.id] ?? 0),
      hp: player.hp - (state.roundStartingHp[player.id] ?? player.hp),
    };
  }
  const rankedPoints = Object.entries(deltas)
    .filter(([, delta]) => delta.points > 0)
    .sort((a, b) => b[1].points - a[1].points);
  const winnerId =
    rankedPoints.length > 0 && rankedPoints[0]?.[1].points !== rankedPoints[1]?.[1].points
      ? (rankedPoints[0]?.[0] ?? null)
      : null;
  const result: MixRoundResult = { round: nextChildRound, tea, winnerId, deltas, reason };
  const roundResults = [...state.roundResults, result];
  effects.push({ type: "mix-round-resolved", result });
  const targetWinner = state.players.find(
    ({ alive, points }) => alive && points >= state.config.pointsToWin,
  );
  if (targetWinner) return finish({ ...state, roundResults }, targetWinner.id, effects);
  const survivors = state.players.filter(({ alive }) => alive);
  if (survivors.length <= 1)
    return finish(
      { ...state, roundResults },
      survivors[0]?.id ?? state.players[0]?.id ?? "",
      effects,
    );
  const pickingState = { ...state, roundResults };
  const picked =
    reason === "unavailable"
      ? pickTeaFrom(
          pickingState,
          tea,
          enabledTeas(state.config).filter((candidate) => candidate !== tea),
        )
      : pickTea(pickingState, tea);
  if (!picked) {
    const leader = survivors.reduce((best, player) =>
      player.points > best.points ? player : best,
    );
    return finish({ ...state, roundResults }, leader.id, effects);
  }
  return {
    ...state,
    status: "intermission",
    roundResults,
    currentTea: tea,
    upcomingTea: picked.tea,
    intermissionEndsAt: now + state.config.intermissionMs,
    activeGame: null,
    roundStartingPoints: Object.fromEntries(state.players.map(({ id, points }) => [id, points])),
    roundStartingHp: Object.fromEntries(state.players.map(({ id, hp }) => [id, hp])),
    rngState: picked.rngState,
  };
}

function startNextRound(state: MixGameState, now: number, effects: MixEffect[]): MixGameState {
  const picked = state.upcomingTea
    ? { tea: state.upcomingTea, rngState: state.rngState }
    : pickTea(state, state.currentTea);
  const childSeed = randomIndex({ rngState: picked.rngState }, 0x7fffffff);
  let child = createRound(state, picked.tea, childSeed.index + 1);
  if (picked.tea === "black") {
    const started = blackTeaMode.start(child as BlackGameState, now);
    child = started.state;
    effects.push(...started.effects);
  } else if (picked.tea === "green") {
    const started = greenTeaMode.start(child as Extract<AnyRoundGameState, { mode: "green" }>, now);
    child = started.state;
    effects.push(...started.effects);
  } else if (picked.tea === "red") {
    const started = redTeaMode.start(child as Extract<AnyRoundGameState, { mode: "red" }>, now);
    child = started.state;
    effects.push(...started.effects);
  } else {
    const started = yellowTeaMode.start(
      child as Extract<AnyRoundGameState, { mode: "yellow" }>,
      now,
    );
    child = started.state;
    effects.push(...started.effects);
  }
  const roundNumber = state.roundNumber + 1;
  const nextState = {
    ...state,
    status: "playing" as const,
    roundNumber,
    currentTea: picked.tea,
    upcomingTea: null,
    intermissionEndsAt: null,
    activeGame: child,
    roundStartingPoints: Object.fromEntries(state.players.map(({ id, points }) => [id, points])),
    roundStartingHp: Object.fromEntries(state.players.map(({ id, hp }) => [id, hp])),
    rngState: childSeed.rngState,
  };
  if (picked.tea === "black" && child.status === "finished")
    return completeMixRound(
      { ...nextState, activeGame: null },
      picked.tea,
      now,
      effects,
      "unavailable",
    );
  const endsAt = child.mode === "black" ? (child.turnEndsAt ?? now) : (child.roundEndsAt ?? now);
  effects.push({ type: "mix-round-started", round: roundNumber, tea: picked.tea, endsAt });
  return nextState;
}

export function stepMix(state: MixGameState, event: MixEvent, now: number): MixTransition {
  const effects: MixEffect[] = [];
  if (event.type === "START" && state.status === "ready") {
    const picked = pickTea(state, null);
    return {
      state: startNextRound(
        { ...state, upcomingTea: picked.tea, rngState: picked.rngState },
        now,
        effects,
      ),
      effects,
    };
  }
  if (
    state.status === "intermission" &&
    event.type === "TICK" &&
    now >= (state.intermissionEndsAt ?? Infinity)
  )
    return { state: startNextRound(state, now, effects), effects };
  if (state.status !== "playing" || !state.activeGame || !state.currentTea)
    return { state, effects };
  const tea = state.currentTea;
  let child: MixRoundState;
  if (tea === "black") {
    const input = event.type === "SUBMIT_WORD" ? event : event.type === "TICK" ? event : null;
    if (!input) return { state, effects };
    const result = blackTeaMode.step(state.activeGame as BlackGameState, input as BlackEvent, now);
    child = result.state;
    effects.push(...result.effects);
  } else {
    const input: RoundModeEvent =
      event.type === "SUBMIT_MESSAGE" || event.type === "SUBMIT_WORD" || event.type === "TICK"
        ? event
        : { type: "TICK" };
    const substate = state.activeGame as AnyRoundGameState;
    const result =
      tea === "green"
        ? greenTeaMode.step(
            substate as Extract<AnyRoundGameState, { mode: "green" }>,
            input as GreenEvent,
            now,
          )
        : tea === "red"
          ? redTeaMode.step(
              substate as Extract<AnyRoundGameState, { mode: "red" }>,
              input as RedEvent,
              now,
            )
          : yellowTeaMode.step(
              substate as Extract<AnyRoundGameState, { mode: "yellow" }>,
              input as YellowEvent,
              now,
            );
    child = result.state;
    effects.push(...result.effects);
  }
  let next = syncChild(state, child, tea);
  const targetWinner = next.players.find(
    ({ alive, points }) => alive && points >= next.config.pointsToWin,
  );
  if (targetWinner)
    return {
      state: completeMixRound({ ...next, activeGame: null }, tea, now, effects, "submission"),
      effects,
    };
  const survivors = next.players.filter(({ alive }) => alive);
  if (survivors.length <= 1 && tea === "black" && child.status === "finished")
    return {
      state: completeMixRound({ ...next, activeGame: null }, tea, now, effects, "timeout"),
      effects,
    };
  if (survivors.length <= 1)
    return {
      state: finish(
        { ...next, activeGame: child },
        survivors[0]?.id ?? next.players[0]?.id ?? "",
        effects,
      ),
      effects,
    };
  if (tea === "black" && child.status === "finished")
    return {
      state: completeMixRound({ ...next, activeGame: null }, tea, now, effects, "unavailable"),
      effects,
    };
  next = { ...next, activeGame: child };
  const completed =
    tea === "black"
      ? blackTeaMode.isRoundComplete(child as BlackGameState)
      : tea === "green"
        ? greenTeaMode.isRoundComplete(child as Extract<AnyRoundGameState, { mode: "green" }>)
        : tea === "red"
          ? redTeaMode.isRoundComplete(child as Extract<AnyRoundGameState, { mode: "red" }>)
          : yellowTeaMode.isRoundComplete(child as Extract<AnyRoundGameState, { mode: "yellow" }>);
  if (!completed) return { state: next, effects };
  const childResult =
    tea === "black"
      ? (child as BlackGameState).lastRoundResult
      : (child as AnyRoundGameState).roundResults.at(-1);
  const reason =
    tea === "black" ? "timeout" : ((childResult as RoundResult | undefined)?.reason ?? "timeout");
  return {
    state: completeMixRound({ ...next, activeGame: null }, tea, now, effects, reason),
    effects,
  };
}

export function latestMixRoundResult(state: MixGameState): MixRoundResult | null {
  return state.roundResults.at(-1) ?? null;
}

export function mixTimeRemainingMs(state: MixGameState, now: number): number {
  if (state.status === "intermission") return Math.max(0, (state.intermissionEndsAt ?? now) - now);
  const active = state.activeGame;
  if (!active || state.status !== "playing") return 0;
  if (active.mode === "black") return Math.max(0, (active.turnEndsAt ?? now) - now);
  return Math.max(0, (active.roundEndsAt ?? now) - now);
}
