import { describe, expect, test } from "bun:test";
import type { GreenConfig, RedConfig, YellowConfig } from "../src";
import {
  createGreenGame,
  createRedGame,
  createWordCatalog,
  createYellowGame,
  stepGreen,
  stepRed,
  stepYellow,
  type GamePlayer,
} from "../src";

const words = [
  "cat",
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
const catalog = createWordCatalog(
  words,
  [
    { fragment: "cat", solutionCount: 6 },
    { fragment: "dog", solutionCount: 5 },
    { fragment: "tea", solutionCount: 5 },
  ],
  5,
);
const players: GamePlayer[] = [
  { id: "you", name: "You", kind: "human", skill: 1 },
  { id: "bot", name: "Bot", kind: "bot", skill: 0.7 },
];

function green(config: Partial<GreenConfig> = {}) {
  return createGreenGame({ players, catalog, seed: 22, config: { botCount: 1, ...config } });
}
function red(config: Partial<RedConfig> = {}) {
  return createRedGame({ players, catalog, seed: 22, config: { botCount: 1, ...config } });
}
function yellow(config: Partial<YellowConfig> = {}) {
  return createYellowGame({ players, catalog, seed: 22, config: { botCount: 1, ...config } });
}

function startGreen(config = green()) {
  return stepGreen(config, { type: "START" }, 1_000).state;
}
function startRed(config = red()) {
  return stepRed(config, { type: "START" }, 1_000).state;
}
function startYellow(config = yellow()) {
  return stepYellow(config, { type: "START" }, 1_000).state;
}

describe("Green Tea", () => {
  test("the first valid submission wins and adds one point", () => {
    const state = startGreen(green({ roundTimeMs: 20_000, pointsToWin: 2 }));
    const word = state.catalog.wordsByFragment[state.fragment ?? ""]?.[0] ?? "";
    const outcome = stepGreen(state, { type: "SUBMIT_WORD", playerId: "you", word }, 2_500);
    expect(outcome.state.roundResults.at(-1)?.winnerId).toBe("you");
    expect(outcome.state.players.find((player) => player.id === "you")?.points).toBe(1);
    expect(outcome.state.roundResults.at(-1)?.submissions[0]?.submittedAt).toBe(2_500);
    expect(outcome.state.roundNumber).toBe(2);
  });

  test("a round with no valid submission awards no point and moves on", () => {
    const state = startGreen(green({ roundTimeMs: 2_000 }));
    const outcome = stepGreen(state, { type: "TICK" }, 3_000).state;
    expect(outcome.roundResults).toHaveLength(1);
    expect(outcome.roundResults[0]?.winnerId).toBeNull();
    expect(Object.values(outcome.roundResults[0]?.deltas ?? {})).toEqual([0, 0]);
    expect(outcome.roundNumber).toBe(2);
  });

  test("processes an earlier bot race win before a late human event", () => {
    const state = startGreen(green({ roundTimeMs: 20_000 }));
    const word = state.catalog.wordsByFragment[state.fragment ?? ""]?.[0] ?? "";
    const outcome = stepGreen(state, { type: "SUBMIT_WORD", playerId: "you", word }, 5_000);
    expect(outcome.state.roundResults[0]?.winnerId).toBe("bot");
    expect(outcome.effects[0]?.type).toBe("submission-recorded");
    expect(outcome.state.roundNumber).toBe(2);
  });

  test("never reuses a valid word and finishes at its configured target", () => {
    const winning = startGreen(green({ pointsToWin: 1 }));
    const winningWord = winning.catalog.wordsByFragment[winning.fragment ?? ""]?.[0] ?? "";
    const finished = stepGreen(
      winning,
      { type: "SUBMIT_WORD", playerId: "you", word: winningWord },
      1_500,
    ).state;
    expect(finished.status).toBe("finished");
    expect(finished.winnerId).toBe("you");

    let state = startGreen(green({ pointsToWin: 2 }));
    const fragment = state.fragment ?? "";
    const word = state.catalog.wordsByFragment[fragment]?.[0] ?? "";
    state = stepGreen(state, { type: "SUBMIT_WORD", playerId: "you", word }, 1_500).state;
    expect(state.usedWords).toContain(word);
    const forced = { ...state, fragment, roundEndsAt: 20_000 };
    const repeat = stepGreen(forced, { type: "SUBMIT_WORD", playerId: "you", word }, 2_000).state;
    expect(repeat.roundSubmissions.at(-1)?.invalidWords).toContain(word);
    expect(repeat.roundResults).toHaveLength(1);
  });
});

describe("Red Tea", () => {
  test("the longest valid word wins and equal lengths go to the earliest submission", () => {
    let state = startRed(red({ roundTimeMs: 2_000 }));
    state = { ...state, fragment: "cat", roundEndsAt: 3_000 };
    state = stepRed(state, { type: "SUBMIT_WORD", playerId: "bot", word: "catlike" }, 1_200).state;
    state = stepRed(state, { type: "SUBMIT_WORD", playerId: "you", word: "catwalk" }, 1_500).state;
    state = stepRed(state, { type: "TICK" }, 3_000).state;
    expect(state.roundResults[0]?.winnerId).toBe("bot");
    expect(state.roundResults[0]?.deltas.bot).toBe(1);
  });

  test("a round with no submissions awards nothing and continues", () => {
    const state = startRed(red({ roundTimeMs: 1_000 }));
    const next = stepRed(state, { type: "TICK" }, 2_000).state;
    expect(next.roundResults[0]?.winnerId).toBeNull();
    expect(next.players.every((player) => player.points === 0)).toBe(true);
    expect(next.roundNumber).toBe(2);
  });

  test("reaches its configured win condition", () => {
    let state = startRed(red({ pointsToWin: 1, roundTimeMs: 1_000 }));
    state = { ...state, fragment: "cat", roundEndsAt: 2_000 };
    state = stepRed(state, { type: "SUBMIT_WORD", playerId: "you", word: "catapult" }, 1_500).state;
    state = stepRed(state, { type: "TICK" }, 2_000).state;
    expect(state.status).toBe("finished");
    expect(state.winnerId).toBe("you");
  });
});

describe("Yellow Tea", () => {
  test("accepts only one message and counts unique valid words", () => {
    let state = startYellow(yellow({ roundTimeMs: 2_000 }));
    state = { ...state, fragment: "cat", roundEndsAt: 3_000 };
    state = stepYellow(
      state,
      {
        type: "SUBMIT_MESSAGE",
        playerId: "you",
        message: "catapult, catapult catlike invalid",
      },
      1_500,
    ).state;
    expect(state.roundSubmissions[0]?.validWords).toEqual(["catapult", "catlike"]);
    expect(state.roundSubmissions[0]?.score).toBe(2);
    const ignored = stepYellow(
      state,
      {
        type: "SUBMIT_MESSAGE",
        playerId: "you",
        message: "catnip",
      },
      1_600,
    ).state;
    expect(ignored.roundSubmissions).toHaveLength(1);
  });

  test("invalid words are ignored by default or penalized when configured", () => {
    let state = startYellow(yellow({ roundTimeMs: 2_000 }));
    state = { ...state, fragment: "cat", roundEndsAt: 3_000 };
    state = stepYellow(
      state,
      {
        type: "SUBMIT_MESSAGE",
        playerId: "you",
        message: "catapult nope",
      },
      1_500,
    ).state;
    expect(state.roundSubmissions[0]?.score).toBe(1);

    let penalized = startYellow(yellow({ roundTimeMs: 2_000, ignoreInvalidWords: false }));
    penalized = { ...penalized, fragment: "cat", roundEndsAt: 3_000 };
    penalized = stepYellow(
      penalized,
      {
        type: "SUBMIT_MESSAGE",
        playerId: "you",
        message: "catapult nope",
      },
      1_500,
    ).state;
    expect(penalized.roundSubmissions[0]?.score).toBe(0);
  });

  test("ties go to the earliest message and the target ends the game", () => {
    let state = startYellow(yellow({ roundTimeMs: 2_000, pointsToWin: 1 }));
    state = { ...state, fragment: "cat", roundEndsAt: 3_000 };
    state = stepYellow(
      state,
      {
        type: "SUBMIT_MESSAGE",
        playerId: "you",
        message: "catapult catlike",
      },
      1_400,
    ).state;
    state = stepYellow(
      state,
      {
        type: "SUBMIT_MESSAGE",
        playerId: "bot",
        message: "catnip catwalk",
      },
      1_200,
    ).state;
    state = stepYellow(state, { type: "TICK" }, 3_000).state;
    expect(state.status).toBe("finished");
    expect(state.winnerId).toBe("bot");
    expect(state.roundResults[0]?.deltas.bot).toBe(1);
  });

  test("a message with no valid words can result in an empty round", () => {
    let state = startYellow(yellow({ roundTimeMs: 1_000 }));
    state = { ...state, fragment: "cat", roundEndsAt: 2_000 };
    state = stepYellow(
      state,
      {
        type: "SUBMIT_MESSAGE",
        playerId: "you",
        message: "nope notaword",
      },
      1_500,
    ).state;
    state = stepYellow(state, { type: "TICK" }, 2_000).state;
    expect(state.roundResults[0]?.winnerId).toBeNull();
    expect(state.roundNumber).toBe(2);
  });
});
