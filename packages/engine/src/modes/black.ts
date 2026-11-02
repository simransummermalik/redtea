import { nextRandom, randomIndex } from "../random";
import type { ModeStrategy, PlayerDelta, PlayerId } from "../types";

export interface FragmentEntry {
  fragment: string;
  solutionCount: number;
}

export interface WordCatalog {
  fragments: readonly string[];
  wordsByFragment: Readonly<Record<string, readonly string[]>>;
}

export interface GamePlayer {
  id: PlayerId;
  name: string;
  kind: "human" | "bot";
  skill: number;
}

export interface BlackConfig {
  initialHp: number;
  initialTurnMs: number;
  timerDecreasePerTurnMs: number;
  minimumTurnMs: number;
  pointsPerWord: number;
  minimumFragmentSolutions: number;
  botFastestThinkMs: number;
  botSlowestThinkMs: number;
}

export const defaultBlackConfig: BlackConfig = {
  initialHp: 2,
  initialTurnMs: 12_000,
  timerDecreasePerTurnMs: 500,
  minimumTurnMs: 5_000,
  pointsPerWord: 1,
  minimumFragmentSolutions: 5,
  botFastestThinkMs: 900,
  botSlowestThinkMs: 4_500,
};

export interface BlackPlayerState extends GamePlayer {
  hp: number;
  points: number;
  alive: boolean;
}

export type BlackFeedback =
  | { kind: "valid"; playerId: PlayerId; word: string }
  | { kind: "invalid"; playerId: PlayerId; word: string }
  | { kind: "reused"; playerId: PlayerId; word: string }
  | { kind: "timeout"; playerId: PlayerId }
  | { kind: "eliminated"; playerId: PlayerId };

export interface BotAction {
  dueAt: number;
  word: string;
  isValid: boolean;
}

export interface BlackGameState {
  mode: "black";
  status: "ready" | "playing" | "finished";
  config: BlackConfig;
  catalog: WordCatalog;
  players: BlackPlayerState[];
  currentPlayerId: PlayerId | null;
  fragment: string | null;
  turnNumber: number;
  turnDurationMs: number;
  turnStartedAt: number | null;
  turnEndsAt: number | null;
  usedWords: string[];
  winnerId: PlayerId | null;
  lastFeedback: BlackFeedback | null;
  botAction: BotAction | null;
  rngState: number;
}

export type BlackSubmission = { playerId: PlayerId; word: string };

export type BlackEvent =
  | { type: "START" }
  | { type: "SUBMIT_WORD"; playerId: PlayerId; word: string }
  | { type: "TICK" };

export type BlackEffect =
  | { type: "turn-started"; playerId: PlayerId; fragment: string; endsAt: number }
  | { type: "word-accepted"; playerId: PlayerId; word: string }
  | { type: "turn-expired"; playerId: PlayerId }
  | { type: "game-finished"; winnerId: PlayerId };

export interface BlackResolution {
  winnerId: PlayerId;
  deltas: Readonly<Record<PlayerId, PlayerDelta>>;
  usedWords: readonly string[];
}

export function createWordCatalog(
  words: readonly string[],
  entries: readonly FragmentEntry[],
  minimumSolutions = defaultBlackConfig.minimumFragmentSolutions,
): WordCatalog {
  const allowed = new Set(
    entries
      .filter(({ solutionCount }) => solutionCount >= minimumSolutions)
      .map(({ fragment }) => fragment),
  );
  const mutableIndex = new Map<string, Set<string>>();
  for (const sourceWord of words) {
    const word = sourceWord.trim().toLowerCase();
    if (!/^[a-z]+$/.test(word)) continue;
    const seen = new Set<string>();
    for (let offset = 0; offset <= word.length - 3; offset += 1) {
      const fragment = word.slice(offset, offset + 3);
      if (allowed.has(fragment)) seen.add(fragment);
    }
    for (const fragment of seen) {
      const solutions = mutableIndex.get(fragment) ?? new Set<string>();
      solutions.add(word);
      mutableIndex.set(fragment, solutions);
    }
  }

  const wordsByFragment: Record<string, readonly string[]> = {};
  for (const [fragment, solutions] of mutableIndex) {
    if (solutions.size >= minimumSolutions) wordsByFragment[fragment] = [...solutions].sort();
  }
  return {
    fragments: Object.keys(wordsByFragment).sort(),
    wordsByFragment,
  };
}

export interface CreateBlackGameOptions {
  players: readonly GamePlayer[];
  catalog: WordCatalog;
  seed: number;
  config?: Partial<BlackConfig>;
}

export function createBlackGame(options: CreateBlackGameOptions): BlackGameState {
  if (options.players.length < 2) throw new RangeError("Black Tea requires at least two players");
  const ids = new Set(options.players.map(({ id }) => id));
  if (ids.size !== options.players.length) throw new RangeError("Player IDs must be unique");
  if (options.catalog.fragments.length === 0) {
    throw new RangeError("The word catalog has no fragments with enough solutions");
  }
  const config = { ...defaultBlackConfig, ...options.config };
  validateConfig(config);
  return {
    mode: "black",
    status: "ready",
    config,
    catalog: options.catalog,
    players: options.players.map((player) => ({
      ...player,
      skill: clamp(player.skill, 0, 1),
      hp: config.initialHp,
      points: 0,
      alive: true,
    })),
    currentPlayerId: null,
    fragment: null,
    turnNumber: 0,
    turnDurationMs: config.initialTurnMs,
    turnStartedAt: null,
    turnEndsAt: null,
    usedWords: [],
    winnerId: null,
    lastFeedback: null,
    botAction: null,
    rngState: options.seed >>> 0,
  };
}

function validateConfig(config: BlackConfig): void {
  if (config.initialHp < 1) throw new RangeError("Initial HP must be at least 1");
  if (config.minimumTurnMs < 5_000)
    throw new RangeError("Minimum turn time cannot be below 5 seconds");
  if (config.initialTurnMs < config.minimumTurnMs) {
    throw new RangeError("Initial turn time must be at least the minimum turn time");
  }
  if (config.timerDecreasePerTurnMs < 0 || config.pointsPerWord < 0) {
    throw new RangeError("Timer decay and points cannot be negative");
  }
  if (config.botFastestThinkMs < 0 || config.botSlowestThinkMs < config.botFastestThinkMs) {
    throw new RangeError("Bot think-time bounds are invalid");
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function currentPlayer(state: BlackGameState): BlackPlayerState | undefined {
  return state.players.find(({ id }) => id === state.currentPlayerId);
}

function availableWords(state: BlackGameState, fragment: string): readonly string[] {
  const used = new Set(state.usedWords);
  return (state.catalog.wordsByFragment[fragment] ?? []).filter((word) => !used.has(word));
}

function chooseFragment(state: BlackGameState): { fragment: string | null; rngState: number } {
  let available = state.catalog.fragments.filter(
    (fragment) => availableWords(state, fragment).length > 0,
  );
  if (available.length > 1 && state.fragment !== null) {
    available = available.filter((fragment) => fragment !== state.fragment);
  }
  if (available.length === 0) return { fragment: null, rngState: state.rngState };
  const draw = randomIndex(state, available.length);
  return { fragment: available[draw.index] ?? null, rngState: draw.rngState };
}

function planBotAction(
  state: BlackGameState,
  player: BlackPlayerState,
  now: number,
): BlackGameState {
  if (player.kind !== "bot" || state.fragment === null || state.turnEndsAt === null) {
    return { ...state, botAction: null };
  }
  const candidates = availableWords(state, state.fragment);
  if (candidates.length === 0) return { ...state, botAction: null };

  const wordDraw = randomIndex(state, candidates.length);
  const accuracyDraw = nextRandom({ rngState: wordDraw.rngState });
  const speed = clamp(player.skill, 0, 1);
  const delayRange = state.config.botSlowestThinkMs - state.config.botFastestThinkMs;
  const thinkMs = Math.round(state.config.botSlowestThinkMs - speed * delayRange);
  return {
    ...state,
    rngState: accuracyDraw.rngState,
    botAction: {
      dueAt: now + thinkMs,
      word: candidates[wordDraw.index] ?? "",
      isValid: accuracyDraw.value <= speed,
    },
  };
}

function beginTurn(
  state: BlackGameState,
  playerId: PlayerId,
  now: number,
  durationMs: number,
  effects: BlackEffect[],
): BlackGameState {
  const chosen = chooseFragment(state);
  if (chosen.fragment === null) return finishGame({ ...state, rngState: chosen.rngState });
  const next = {
    ...state,
    status: "playing" as const,
    currentPlayerId: playerId,
    fragment: chosen.fragment,
    turnNumber: state.turnNumber + 1,
    turnDurationMs: durationMs,
    turnStartedAt: now,
    turnEndsAt: now + durationMs,
    botAction: null,
    rngState: chosen.rngState,
  };
  const player = next.players.find(({ id }) => id === playerId);
  const withBot = player ? planBotAction(next, player, now) : next;
  effects.push({
    type: "turn-started",
    playerId,
    fragment: chosen.fragment,
    endsAt: now + durationMs,
  });
  return withBot;
}

function finishGame(state: BlackGameState): BlackGameState {
  const winner = state.players.find(({ alive }) => alive);
  if (!winner) return { ...state, status: "finished", currentPlayerId: null, botAction: null };
  return {
    ...state,
    status: "finished",
    currentPlayerId: winner.id,
    winnerId: winner.id,
    fragment: null,
    turnStartedAt: null,
    turnEndsAt: null,
    botAction: null,
  };
}

function livingPlayers(state: BlackGameState): BlackPlayerState[] {
  return state.players.filter(({ alive }) => alive);
}

function nextPlayerId(state: BlackGameState, afterPlayerId: PlayerId): PlayerId | null {
  const alive = livingPlayers(state);
  if (alive.length === 0) return null;
  const currentIndex = state.players.findIndex(({ id }) => id === afterPlayerId);
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const player = state.players[(currentIndex + offset) % state.players.length];
    if (player?.alive) return player.id;
  }
  return alive[0]?.id ?? null;
}

function finishIfOneAlive(state: BlackGameState): BlackGameState {
  return livingPlayers(state).length <= 1 ? finishGame(state) : state;
}

function completeTurn(
  state: BlackGameState,
  playerId: PlayerId,
  now: number,
  effects: BlackEffect[],
): BlackGameState {
  const nextState = finishIfOneAlive(state);
  if (nextState.status === "finished") {
    effects.push({ type: "game-finished", winnerId: nextState.winnerId ?? playerId });
    return nextState;
  }
  const nextId = nextPlayerId(nextState, playerId);
  if (nextId === null) return finishGame(nextState);
  const durationMs = Math.max(
    nextState.config.minimumTurnMs,
    nextState.turnDurationMs - nextState.config.timerDecreasePerTurnMs,
  );
  return beginTurn(nextState, nextId, now, durationMs, effects);
}

function acceptWord(
  state: BlackGameState,
  playerId: PlayerId,
  submittedWord: string,
  now: number,
  effects: BlackEffect[],
): BlackGameState {
  const word = submittedWord.trim().toLowerCase();
  const repeated = state.usedWords.includes(word);
  const valid =
    state.fragment !== null && (state.catalog.wordsByFragment[state.fragment] ?? []).includes(word);
  if (repeated) {
    return { ...state, lastFeedback: { kind: "reused", playerId, word } };
  }
  if (!valid) {
    return { ...state, lastFeedback: { kind: "invalid", playerId, word } };
  }

  const players = state.players.map((player) =>
    player.id === playerId
      ? { ...player, points: player.points + state.config.pointsPerWord }
      : player,
  );
  const next = {
    ...state,
    players,
    usedWords: [...state.usedWords, word],
    lastFeedback: { kind: "valid" as const, playerId, word },
    botAction: null,
  };
  effects.push({ type: "word-accepted", playerId, word });
  return completeTurn(next, playerId, now, effects);
}

function expireTurn(state: BlackGameState, now: number, effects: BlackEffect[]): BlackGameState {
  const playerId = state.currentPlayerId;
  if (!playerId) return state;
  const player = currentPlayer(state);
  if (!player) return state;
  const players = state.players.map((entry) =>
    entry.id === playerId ? { ...entry, hp: entry.hp - 1, alive: entry.hp - 1 > 0 } : entry,
  );
  const didEliminate = !players.find(({ id }) => id === playerId)?.alive;
  effects.push({ type: "turn-expired", playerId });
  const feedback: BlackFeedback = didEliminate
    ? { kind: "eliminated", playerId }
    : { kind: "timeout", playerId };
  const next = { ...state, players, lastFeedback: feedback, botAction: null };
  return completeTurn(next, playerId, now, effects);
}

function startRound(
  state: BlackGameState,
  now: number,
): { state: BlackGameState; effects: BlackEffect[] } {
  if (state.status !== "ready") return { state, effects: [] };
  const effects: BlackEffect[] = [];
  const firstPlayerId = state.players[0]?.id;
  if (!firstPlayerId) return { state, effects };
  return {
    state: beginTurn(state, firstPlayerId, now, state.config.initialTurnMs, effects),
    effects,
  };
}

function submit(
  state: BlackGameState,
  submission: BlackSubmission,
  now: number,
): { state: BlackGameState; effects: BlackEffect[] } {
  if (state.status !== "playing" || state.currentPlayerId !== submission.playerId) {
    return { state, effects: [] };
  }
  if (state.turnEndsAt !== null && now >= state.turnEndsAt) {
    return handleTick(state, now);
  }
  const effects: BlackEffect[] = [];
  return {
    state: acceptWord(state, submission.playerId, submission.word, now, effects),
    effects,
  };
}

function handleTick(
  state: BlackGameState,
  now: number,
): { state: BlackGameState; effects: BlackEffect[] } {
  if (state.status !== "playing" || state.turnEndsAt === null) return { state, effects: [] };
  const effects: BlackEffect[] = [];
  let next = state;

  while (next.status === "playing" && next.currentPlayerId !== null && next.turnEndsAt !== null) {
    const action = next.botAction;
    if (action && action.dueAt < next.turnEndsAt && action.dueAt <= now) {
      if (action.isValid) {
        next = acceptWord(next, next.currentPlayerId, action.word, action.dueAt, effects);
        break;
      }
      const player = currentPlayer(next);
      next = {
        ...next,
        lastFeedback: { kind: "invalid", playerId: next.currentPlayerId, word: "" },
        botAction: null,
      };
      if (player) next = planBotAction(next, player, action.dueAt);
      if (next.botAction && next.botAction.dueAt <= now) continue;
      if (next.turnEndsAt !== null && now >= next.turnEndsAt) {
        next = expireTurn(next, next.turnEndsAt, effects);
      }
      break;
    }
    if (now >= next.turnEndsAt) next = expireTurn(next, next.turnEndsAt, effects);
    break;
  }
  return { state: next, effects };
}

export const blackTeaMode: ModeStrategy<
  BlackGameState,
  BlackSubmission,
  BlackResolution,
  BlackEffect
> & {
  startRound: typeof startRound;
  submit: typeof submit;
} = {
  startRound,
  submit,
  resolve(state) {
    if (state.status !== "finished" || state.winnerId === null) return null;
    const deltas: Record<string, PlayerDelta> = {};
    for (const player of state.players) {
      deltas[player.id] = {
        points: player.points,
        hp: player.hp - state.config.initialHp,
      };
    }
    return { winnerId: state.winnerId, deltas, usedWords: state.usedWords };
  },
};

export function step(
  state: BlackGameState,
  event: BlackEvent,
  now: number,
): { state: BlackGameState; effects: BlackEffect[] } {
  switch (event.type) {
    case "START":
      return blackTeaMode.startRound(state, now);
    case "SUBMIT_WORD":
      return blackTeaMode.submit(state, { playerId: event.playerId, word: event.word }, now);
    case "TICK":
      return handleTick(state, now);
  }
}

export function getTimeRemainingMs(state: BlackGameState, now: number): number {
  if (state.status !== "playing" || state.turnEndsAt === null) return 0;
  return Math.max(0, state.turnEndsAt - now);
}
