import { nextRandom, randomIndex } from "../random";
import type { GamePlayer, WordCatalog } from "./black";
import type { ModeStrategy, PlayerId } from "../types";

export type RoundModeName = "green" | "red" | "yellow";

export interface RoundModeConfig {
  pointsToWin: number;
  roundTimeMs: number;
  botCount: number;
  allowWordReuse: boolean;
  botFastestThinkMs: number;
  botSlowestThinkMs: number;
}

export interface GreenConfig extends RoundModeConfig {}
export interface RedConfig extends RoundModeConfig {}
export interface YellowConfig extends RoundModeConfig {
  ignoreInvalidWords: boolean;
}

const commonDefaults = {
  roundTimeMs: 10_000,
  botCount: 2,
  allowWordReuse: true,
  botFastestThinkMs: 650,
  botSlowestThinkMs: 5_000,
};

export const defaultGreenConfig: GreenConfig = {
  ...commonDefaults,
  pointsToWin: 30,
  allowWordReuse: false,
};

export const defaultRedConfig: RedConfig = { ...commonDefaults, pointsToWin: 4 };

export const defaultYellowConfig: YellowConfig = {
  ...commonDefaults,
  pointsToWin: 4,
  ignoreInvalidWords: true,
};

export interface RoundSubmission {
  playerId: PlayerId;
  text: string;
  submittedAt: number;
  order: number;
  validWords: readonly string[];
  invalidWords: readonly string[];
  score: number;
}

export interface RoundResult {
  round: number;
  fragment: string;
  winnerId: PlayerId | null;
  submissions: readonly RoundSubmission[];
  deltas: Readonly<Record<PlayerId, number>>;
  reason: "submission" | "timeout";
}

export interface RoundPlayer extends GamePlayer {
  points: number;
}

interface BotAction {
  playerId: PlayerId;
  dueAt: number;
  text: string;
}

export interface RoundGameState<Mode extends RoundModeName, Config extends RoundModeConfig> {
  mode: Mode;
  status: "ready" | "playing" | "finished";
  config: Config;
  catalog: WordCatalog;
  players: RoundPlayer[];
  roundNumber: number;
  fragment: string | null;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  roundSubmissions: RoundSubmission[];
  roundResults: RoundResult[];
  usedWords: string[];
  submittedPlayerIds: PlayerId[];
  botActions: BotAction[];
  rngState: number;
  winnerId: PlayerId | null;
}

export type GreenGameState = RoundGameState<"green", GreenConfig>;
export type RedGameState = RoundGameState<"red", RedConfig>;
export type YellowGameState = RoundGameState<"yellow", YellowConfig>;
export type AnyRoundGameState = GreenGameState | RedGameState | YellowGameState;

export type GreenEvent =
  | { type: "START" }
  | { type: "SUBMIT_WORD"; playerId: PlayerId; word: string }
  | { type: "TICK" };
export type RedEvent =
  | { type: "START" }
  | { type: "SUBMIT_WORD"; playerId: PlayerId; word: string }
  | { type: "TICK" };
export type YellowEvent =
  | { type: "START" }
  | { type: "SUBMIT_MESSAGE"; playerId: PlayerId; message: string }
  | { type: "TICK" };
export type RoundModeEvent = GreenEvent | RedEvent | YellowEvent;

export type RoundModeEffect =
  | { type: "round-started"; round: number; fragment: string; endsAt: number }
  | { type: "submission-recorded"; round: number; submission: RoundSubmission }
  | { type: "round-resolved"; result: RoundResult }
  | { type: "game-finished"; winnerId: PlayerId };

export interface RoundTransition<State> {
  state: State;
  effects: RoundModeEffect[];
}

export interface RoundModeStrategy<State, Event>
  extends ModeStrategy<
    State,
    Event,
    RoundResult,
    { winnerId: PlayerId; scores: Readonly<Record<PlayerId, number>> },
    RoundModeEffect
  > {}

export interface CreateRoundGameOptions<Config extends RoundModeConfig> {
  players: readonly GamePlayer[];
  catalog: WordCatalog;
  seed: number;
  config?: Partial<Config>;
}

function createState<Mode extends RoundModeName, Config extends RoundModeConfig>(
  mode: Mode,
  defaults: Config,
  options: CreateRoundGameOptions<Config>,
): RoundGameState<Mode, Config> {
  if (options.players.length < 2) throw new RangeError("Tea rounds require at least two players");
  const ids = new Set(options.players.map(({ id }) => id));
  if (ids.size !== options.players.length) throw new RangeError("Player IDs must be unique");
  if (options.catalog.fragments.length === 0)
    throw new RangeError("The word catalog has no fragments");
  const config = { ...defaults, ...options.config } as Config;
  if (mode === "green") (config as RoundModeConfig).allowWordReuse = false;
  validateConfig(config);
  const bots = options.players.filter(({ kind }) => kind === "bot").length;
  if (bots !== config.botCount) throw new RangeError("Configured bot count must match the players");
  return {
    mode,
    status: "ready",
    config,
    catalog: options.catalog,
    players: options.players.map((player) => ({
      ...player,
      skill: clamp(player.skill, 0, 1),
      points: 0,
    })),
    roundNumber: 0,
    fragment: null,
    roundStartedAt: null,
    roundEndsAt: null,
    roundSubmissions: [],
    roundResults: [],
    usedWords: [],
    submittedPlayerIds: [],
    botActions: [],
    rngState: options.seed >>> 0,
    winnerId: null,
  };
}

function validateConfig(config: RoundModeConfig): void {
  if (!Number.isInteger(config.pointsToWin) || config.pointsToWin < 1) {
    throw new RangeError("Points to win must be a positive integer");
  }
  if (!Number.isFinite(config.roundTimeMs) || config.roundTimeMs <= 0) {
    throw new RangeError("Round time must be positive");
  }
  if (!Number.isInteger(config.botCount) || config.botCount < 1 || config.botCount > 3) {
    throw new RangeError("Bot count must be between 1 and 3");
  }
  if (config.botFastestThinkMs < 0 || config.botSlowestThinkMs < config.botFastestThinkMs) {
    throw new RangeError("Bot think-time bounds are invalid");
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function chooseFragment(state: RoundGameState<RoundModeName, RoundModeConfig>): {
  fragment: string;
  rngState: number;
} {
  const draw = randomIndex(state, state.catalog.fragments.length);
  return { fragment: state.catalog.fragments[draw.index] ?? "", rngState: draw.rngState };
}

function wordsForFragment(
  state: RoundGameState<RoundModeName, RoundModeConfig>,
): readonly string[] {
  return state.fragment ? (state.catalog.wordsByFragment[state.fragment] ?? []) : [];
}

function planBots<Mode extends RoundModeName, Config extends RoundModeConfig>(
  state: RoundGameState<Mode, Config>,
  now: number,
): { actions: BotAction[]; rngState: number } {
  let rngState = state.rngState;
  const candidates = wordsForFragment(state).filter(
    (word) => state.config.allowWordReuse || !state.usedWords.includes(word),
  );
  const botActions: BotAction[] = [];
  for (const player of state.players) {
    if (player.kind !== "bot") continue;
    const speed = player.skill;
    const delay = Math.round(
      state.config.botSlowestThinkMs -
        speed * (state.config.botSlowestThinkMs - state.config.botFastestThinkMs),
    );
    const offset = nextRandom({ rngState });
    rngState = offset.rngState;
    const dueAt = now + Math.min(delay + Math.floor(offset.value * 250), state.config.roundTimeMs);
    if (state.mode === "yellow") {
      const ranked = [...candidates].sort((a, b) => a.localeCompare(b));
      const maxWords = Math.max(1, Math.min(12, Math.round(2 + speed * 10)));
      botActions.push({ playerId: player.id, dueAt, text: ranked.slice(0, maxWords).join(", ") });
    } else if (state.mode === "red") {
      const ranked = [...candidates].sort((a, b) => b.length - a.length || a.localeCompare(b));
      const poolSize = Math.max(1, Math.ceil(ranked.length * (1 - speed * 0.85)));
      const pick = randomIndex({ rngState }, poolSize);
      rngState = pick.rngState;
      botActions.push({ playerId: player.id, dueAt, text: ranked[pick.index] ?? "" });
    } else {
      const pick = candidates.length ? randomIndex({ rngState }, candidates.length) : null;
      if (pick) rngState = pick.rngState;
      botActions.push({ playerId: player.id, dueAt, text: candidates[pick?.index ?? 0] ?? "" });
    }
  }
  return { actions: botActions, rngState };
}

function startRound<Mode extends RoundModeName, Config extends RoundModeConfig>(
  state: RoundGameState<Mode, Config>,
  now: number,
  effects: RoundModeEffect[],
): RoundGameState<Mode, Config> {
  const choice = chooseFragment(state);
  const roundNumber = state.roundNumber + 1;
  const active = {
    ...state,
    status: "playing" as const,
    roundNumber,
    fragment: choice.fragment,
    roundStartedAt: now,
    roundEndsAt: now + state.config.roundTimeMs,
    roundSubmissions: [],
    submittedPlayerIds: [],
    botActions: [],
    rngState: choice.rngState,
  };
  const bots = planBots(active, now);
  effects.push({
    type: "round-started",
    round: roundNumber,
    fragment: choice.fragment,
    endsAt: now + state.config.roundTimeMs,
  });
  return { ...active, botActions: bots.actions, rngState: bots.rngState };
}

function findPlayer<Mode extends RoundModeName, Config extends RoundModeConfig>(
  state: RoundGameState<Mode, Config>,
  playerId: PlayerId,
): RoundPlayer | undefined {
  return state.players.find(({ id }) => id === playerId);
}

function validWordsForSubmission<Mode extends RoundModeName, Config extends RoundModeConfig>(
  state: RoundGameState<Mode, Config>,
  rawWords: readonly string[],
): { validWords: string[]; invalidWords: string[] } {
  const candidates = new Set(wordsForFragment(state));
  const withinMessage = new Set<string>();
  const validWords: string[] = [];
  const invalidWords: string[] = [];
  for (const raw of rawWords) {
    const word = raw.trim().toLowerCase();
    if (!word) continue;
    if (withinMessage.has(word)) continue;
    withinMessage.add(word);
    if (!candidates.has(word) || (!state.config.allowWordReuse && state.usedWords.includes(word))) {
      invalidWords.push(word);
    } else validWords.push(word);
  }
  return { validWords, invalidWords };
}

function canSubmit<Mode extends RoundModeName, Config extends RoundModeConfig>(
  state: RoundGameState<Mode, Config>,
  playerId: PlayerId,
  now: number,
): boolean {
  return (
    state.status === "playing" &&
    now < (state.roundEndsAt ?? 0) &&
    Boolean(findPlayer(state, playerId)) &&
    (state.mode === "green" || !state.submittedPlayerIds.includes(playerId))
  );
}

function addSubmission<Mode extends RoundModeName, Config extends RoundModeConfig>(
  state: RoundGameState<Mode, Config>,
  playerId: PlayerId,
  text: string,
  now: number,
  effects: RoundModeEffect[],
): RoundGameState<Mode, Config> {
  const rawWords = state.mode === "yellow" ? text.split(/[\s,]+/) : [text];
  const checked = validWordsForSubmission(state, rawWords);
  const ignoreInvalidWords = !(
    state.mode === "yellow" &&
    "ignoreInvalidWords" in state.config &&
    state.config.ignoreInvalidWords === false
  );
  const score =
    state.mode === "yellow" && !ignoreInvalidWords
      ? Math.max(0, checked.validWords.length - checked.invalidWords.length)
      : checked.validWords.length;
  const submission: RoundSubmission = {
    playerId,
    text,
    submittedAt: now,
    order: state.roundSubmissions.length,
    validWords: checked.validWords,
    invalidWords: checked.invalidWords,
    score,
  };
  const next = {
    ...state,
    roundSubmissions: [...state.roundSubmissions, submission],
    submittedPlayerIds:
      state.mode === "green" ? state.submittedPlayerIds : [...state.submittedPlayerIds, playerId],
    usedWords:
      state.mode === "green" || !state.config.allowWordReuse
        ? [...state.usedWords, ...checked.validWords]
        : state.usedWords,
    botActions: state.botActions.filter(({ playerId: botId }) => botId !== playerId),
  } as RoundGameState<Mode, Config>;
  effects.push({ type: "submission-recorded", round: state.roundNumber, submission });
  return next;
}

function resolveRound<Mode extends RoundModeName, Config extends RoundModeConfig>(
  state: RoundGameState<Mode, Config>,
  now: number,
  effects: RoundModeEffect[],
  reason: RoundResult["reason"],
  greenWinnerId?: PlayerId,
): RoundGameState<Mode, Config> {
  const ranked = [...state.roundSubmissions]
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (state.mode === "red") {
        const aLength = a.validWords[0]?.length ?? 0;
        const bLength = b.validWords[0]?.length ?? 0;
        if (aLength !== bLength) return bLength - aLength;
      } else if (state.mode === "yellow" && a.score !== b.score) return b.score - a.score;
      return a.submittedAt - b.submittedAt || a.order - b.order;
    });
  const winnerId = greenWinnerId ?? ranked[0]?.playerId ?? null;
  const deltas: Record<string, number> = Object.fromEntries(state.players.map(({ id }) => [id, 0]));
  if (winnerId) deltas[winnerId] = 1;
  const result: RoundResult = {
    round: state.roundNumber,
    fragment: state.fragment ?? "",
    winnerId,
    submissions: state.roundSubmissions,
    deltas,
    reason,
  };
  const results = [...state.roundResults, result];
  const players = state.players.map((player) => ({
    ...player,
    points: player.points + (deltas[player.id] ?? 0),
  }));
  const winner = players.find(({ id }) => id === winnerId);
  effects.push({ type: "round-resolved", result });
  if (winner && winner.points >= state.config.pointsToWin) {
    effects.push({ type: "game-finished", winnerId: winner.id });
    return {
      ...state,
      status: "finished",
      players,
      roundResults: results,
      roundStartedAt: null,
      roundEndsAt: null,
      botActions: [],
      winnerId: winner.id,
    };
  }
  return startRound(
    {
      ...state,
      players,
      roundResults: results,
      roundStartedAt: null,
      roundEndsAt: null,
      botActions: [],
    },
    now,
    effects,
  );
}

function processDueBots<Mode extends RoundModeName, Config extends RoundModeConfig>(
  state: RoundGameState<Mode, Config>,
  now: number,
  effects: RoundModeEffect[],
): RoundGameState<Mode, Config> {
  let next = state;
  while (next.status === "playing" && next.roundEndsAt !== null) {
    const deadline = next.roundEndsAt;
    const due = [...next.botActions]
      .filter(({ dueAt }) => dueAt <= now && dueAt < deadline)
      .sort((a, b) => a.dueAt - b.dueAt || a.playerId.localeCompare(b.playerId))[0];
    if (!due) break;
    next = addSubmission(next, due.playerId, due.text, due.dueAt, effects);
    const submission = next.roundSubmissions.at(-1);
    if (next.mode === "green" && submission && submission.validWords.length > 0) {
      next = resolveRound(next, due.dueAt, effects, "submission", due.playerId);
      break;
    }
  }
  return next;
}

function createModeStrategy<Mode extends RoundModeName, Config extends RoundModeConfig, Event>(
  mode: Mode,
): RoundModeStrategy<RoundGameState<Mode, Config>, Event> {
  return {
    start(state, now) {
      if (state.status !== "ready") return { state, effects: [] };
      const effects: RoundModeEffect[] = [];
      return { state: startRound(state, now, effects), effects };
    },
    step(state, event, now) {
      const input = event as { type: string; playerId?: PlayerId; word?: string; message?: string };
      if (input.type === "START") return this.start(state, now);
      if (state.status !== "playing") return { state, effects: [] };
      const effects: RoundModeEffect[] = [];
      let next = processDueBots(state, now, effects);
      // A queued bot may have won Green before this event arrived. Do not
      // apply an old-fragment submission to the newly dealt round.
      if (next.roundNumber !== state.roundNumber || next.status !== "playing") {
        return { state: next, effects };
      }
      if (input.type === "SUBMIT_WORD" && input.playerId && input.word !== undefined) {
        if (canSubmit(next, input.playerId, now)) {
          next = addSubmission(next, input.playerId, input.word, now, effects);
          const accepted = next.roundSubmissions.at(-1);
          if (mode === "green" && accepted && accepted.validWords.length > 0) {
            next = resolveRound(next, now, effects, "submission", input.playerId);
          }
        }
      } else if (input.type === "SUBMIT_MESSAGE" && input.playerId && input.message !== undefined) {
        if (mode === "yellow" && canSubmit(next, input.playerId, now)) {
          next = addSubmission(next, input.playerId, input.message, now, effects);
        }
      } else if (input.type === "TICK") {
        next = processDueBots(next, now, effects);
        if (next.status === "playing" && next.roundEndsAt !== null && now >= next.roundEndsAt) {
          next = resolveRound(next, next.roundEndsAt, effects, "timeout");
        }
      }
      return { state: next, effects };
    },
    latestRoundResult(state) {
      return state.roundResults.at(-1) ?? null;
    },
    resolve(state) {
      if (state.status !== "finished" || state.winnerId === null) return null;
      return {
        winnerId: state.winnerId,
        scores: Object.fromEntries(state.players.map(({ id, points }) => [id, points])),
      };
    },
  };
}

export function createGreenGame(options: CreateRoundGameOptions<GreenConfig>): GreenGameState {
  return createState("green", defaultGreenConfig, options);
}
export function createRedGame(options: CreateRoundGameOptions<RedConfig>): RedGameState {
  return createState("red", defaultRedConfig, options);
}
export function createYellowGame(options: CreateRoundGameOptions<YellowConfig>): YellowGameState {
  return createState("yellow", defaultYellowConfig, options);
}

export const greenTeaMode = createModeStrategy<"green", GreenConfig, GreenEvent>("green");
export const redTeaMode = createModeStrategy<"red", RedConfig, RedEvent>("red");
export const yellowTeaMode = createModeStrategy<"yellow", YellowConfig, YellowEvent>("yellow");

export function stepGreen(
  state: GreenGameState,
  event: GreenEvent,
  now: number,
): RoundTransition<GreenGameState> {
  return greenTeaMode.step(state, event, now);
}
export function stepRed(
  state: RedGameState,
  event: RedEvent,
  now: number,
): RoundTransition<RedGameState> {
  return redTeaMode.step(state, event, now);
}
export function stepYellow(
  state: YellowGameState,
  event: YellowEvent,
  now: number,
): RoundTransition<YellowGameState> {
  return yellowTeaMode.step(state, event, now);
}

export function stepRoundGame(
  state: AnyRoundGameState,
  event: RoundModeEvent,
  now: number,
): RoundTransition<AnyRoundGameState> {
  switch (state.mode) {
    case "green":
      return stepGreen(state, event as GreenEvent, now);
    case "red":
      return stepRed(state, event as RedEvent, now);
    case "yellow":
      return stepYellow(state, event as YellowEvent, now);
  }
}

export function getRoundTimeRemainingMs(
  state: RoundGameState<RoundModeName, RoundModeConfig>,
  now: number,
): number {
  if (state.status !== "playing" || state.roundEndsAt === null) return 0;
  return Math.max(0, state.roundEndsAt - now);
}
