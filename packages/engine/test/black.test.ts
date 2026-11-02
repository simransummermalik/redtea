import { describe, expect, test } from "bun:test";
import type { BlackGameState, GamePlayer } from "../src";
import { blackTeaMode, createBlackGame, createWordCatalog, getTimeRemainingMs, step } from "../src";

const words = [
  "catapult",
  "catlike",
  "catnip",
  "catwalk",
  "scatter",
  "doghouse",
  "dogwood",
  "dogged",
  "doggone",
  "hotdog",
  "teapot",
  "teacup",
  "teaser",
  "teammate",
  "steamers",
];
const entries = [
  { fragment: "cat", solutionCount: 5 },
  { fragment: "dog", solutionCount: 5 },
  { fragment: "tea", solutionCount: 5 },
];
const catalog = createWordCatalog(words, entries, 5);
const players: GamePlayer[] = [
  { id: "human", name: "You", kind: "human", skill: 1 },
  { id: "bot", name: "Bot", kind: "bot", skill: 0.7 },
];

function makeState(overrides: Partial<Parameters<typeof createBlackGame>[0]> = {}): BlackGameState {
  return createBlackGame({
    players,
    catalog,
    seed: 1234,
    config: { initialTurnMs: 10_000, minimumTurnMs: 5_000 },
    ...overrides,
  });
}

function answerFor(state: BlackGameState): string {
  const fragment = state.fragment;
  if (!fragment) throw new Error("Expected an active fragment");
  const answer = state.catalog.wordsByFragment[fragment]?.find(
    (word) => !state.usedWords.includes(word),
  );
  if (!answer) throw new Error(`No answer available for ${fragment}`);
  return answer;
}

function start(state = makeState(), now = 1_000): BlackGameState {
  return step(state, { type: "START" }, now).state;
}

describe("Black Tea engine", () => {
  test("starts with a seeded fragment and starts the turn timer", () => {
    const first = start(makeState(), 1_000);
    const second = start(makeState(), 1_000);

    expect(first.status).toBe("playing");
    expect(first.fragment).toBe(second.fragment);
    expect(first.turnEndsAt).toBe(11_000);
    expect(first.currentPlayerId).toBe("human");
    expect(getTimeRemainingMs(first, 3_000)).toBe(8_000);
  });

  test("rejects invalid words without moving the turn or extending its timer", () => {
    const state = start();
    const result = step(
      state,
      { type: "SUBMIT_WORD", playerId: "human", word: "notaword" },
      2_000,
    ).state;

    expect(result.currentPlayerId).toBe("human");
    expect(result.turnEndsAt).toBe(state.turnEndsAt);
    expect(result.lastFeedback?.kind).toBe("invalid");
  });

  test("accepts a valid word, scores it, and gives the next player a new turn", () => {
    const state = start();
    const word = answerFor(state);
    const result = step(
      state,
      { type: "SUBMIT_WORD", playerId: "human", word: word.toUpperCase() },
      2_000,
    ).state;

    expect(result.currentPlayerId).toBe("bot");
    expect(result.turnNumber).toBe(2);
    expect(result.usedWords).toContain(word);
    expect(result.players.find(({ id }) => id === "human")?.points).toBe(1);
    expect(result.turnDurationMs).toBe(9_500);
    expect(result.lastFeedback?.kind).toBe("valid");
    expect(result.fragment).not.toBeNull();
    expect(result.fragment).not.toBe(state.fragment);
  });

  test("does not accept a submission at or after its deadline", () => {
    const state = start();
    const late = step(
      state,
      { type: "SUBMIT_WORD", playerId: "human", word: answerFor(state) },
      state.turnEndsAt ?? 0,
    ).state;

    expect(late.players.find(({ id }) => id === "human")?.hp).toBe(1);
    expect(late.usedWords).toHaveLength(0);
    expect(late.lastFeedback?.kind).toBe("timeout");
  });

  test("never accepts a previously used word again", () => {
    let state = start();
    const firstWord = answerFor(state);
    state = step(state, { type: "SUBMIT_WORD", playerId: "human", word: firstWord }, 2_000).state;
    const botWord = answerFor(state);
    state = step(state, { type: "SUBMIT_WORD", playerId: "bot", word: botWord }, 3_000).state;
    const repeated = step(
      state,
      { type: "SUBMIT_WORD", playerId: "human", word: firstWord },
      4_000,
    ).state;

    expect(repeated.currentPlayerId).toBe("human");
    expect(repeated.lastFeedback?.kind).toBe("reused");
    expect(repeated.usedWords).toHaveLength(2);
  });

  test("removes one HP on each timeout and decays the timer to its configured floor", () => {
    const slowBotPlayers: GamePlayer[] = [
      { id: "human", name: "You", kind: "human", skill: 1 },
      { id: "bot", name: "Bot", kind: "bot", skill: 0 },
    ];
    let state = start(
      makeState({
        players: slowBotPlayers,
        config: { initialTurnMs: 5_500, minimumTurnMs: 5_000 },
      }),
      0,
    );
    state = step(state, { type: "TICK" }, 5_500).state;

    expect(state.players.find(({ id }) => id === "human")?.hp).toBe(1);
    expect(state.currentPlayerId).toBe("bot");
    expect(state.turnDurationMs).toBe(5_000);
    expect(state.lastFeedback?.kind).toBe("timeout");

    state = step(state, { type: "TICK" }, state.turnEndsAt ?? 0).state;
    expect(state.turnDurationMs).toBe(5_000);
  });

  test("ends with the last player alive and resolves score and HP deltas", () => {
    const slowBotPlayers: GamePlayer[] = [
      { id: "human", name: "You", kind: "human", skill: 1 },
      { id: "bot", name: "Bot", kind: "bot", skill: 0 },
    ];
    let state = start(
      makeState({
        players: slowBotPlayers,
        config: { initialTurnMs: 5_000, minimumTurnMs: 5_000 },
      }),
      0,
    );
    const firstAnswer = answerFor(state);
    state = step(state, { type: "SUBMIT_WORD", playerId: "human", word: firstAnswer }, 1_000).state;
    state = step(state, { type: "TICK" }, state.turnEndsAt ?? 0).state;
    const secondAnswer = answerFor(state);
    state = step(
      state,
      { type: "SUBMIT_WORD", playerId: "human", word: secondAnswer },
      7_000,
    ).state;
    state = step(state, { type: "TICK" }, state.turnEndsAt ?? 0).state;

    expect(state.status).toBe("finished");
    expect(state.winnerId).toBe("human");
    expect(state.players.find(({ id }) => id === "bot")?.alive).toBe(false);
    expect(state.players.find(({ id }) => id === "human")?.points).toBe(2);
    expect(state.lastFeedback?.kind).toBe("eliminated");
    const resolution = blackTeaMode.resolve(state, state.turnEndsAt ?? 0);
    expect(resolution?.winnerId).toBe("human");
    expect(resolution?.deltas.bot?.hp).toBe(-2);
  });

  test("bots act after skill-scaled delays and can make accuracy mistakes", () => {
    const botFirst: GamePlayer[] = [
      { id: "bot", name: "Bot", kind: "bot", skill: 1 },
      { id: "human", name: "You", kind: "human", skill: 1 },
    ];
    let quick = start(makeState({ players: botFirst }), 100);
    expect(quick.botAction?.dueAt).toBe(1_000);
    expect(quick.botAction?.isValid).toBe(true);
    quick = step(quick, { type: "TICK" }, quick.botAction?.dueAt ?? 1_000).state;
    expect(quick.currentPlayerId).toBe("human");
    expect(quick.lastFeedback?.kind).toBe("valid");

    const inaccurateBot: GamePlayer[] = [
      { id: "bot", name: "Bot", kind: "bot", skill: 0 },
      { id: "human", name: "You", kind: "human", skill: 1 },
    ];
    let slow = start(makeState({ players: inaccurateBot }), 100);
    expect(slow.botAction?.dueAt).toBe(4_600);
    expect(slow.botAction?.isValid).toBe(false);
    slow = step(slow, { type: "TICK" }, slow.botAction?.dueAt ?? 4_600).state;
    expect(slow.currentPlayerId).toBe("bot");
    expect(slow.lastFeedback?.kind).toBe("invalid");
  });
});
