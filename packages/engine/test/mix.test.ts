import { describe, expect, test } from "bun:test";
import { createMixGame, createWordCatalog, stepMix, type GamePlayer, type MixConfig } from "../src";

const catalog = createWordCatalog(
  ["catapult", "catlike", "catnip", "catwalk", "doghouse", "dogwood", "dogged"],
  [
    { fragment: "cat", solutionCount: 4 },
    { fragment: "dog", solutionCount: 3 },
  ],
  3,
);
const players: GamePlayer[] = [
  { id: "a", name: "A", kind: "human", skill: 1 },
  { id: "b", name: "B", kind: "human", skill: 1 },
];

function mix(config: Partial<MixConfig> = {}, seed = 17) {
  return createMixGame({ players, catalog, seed, config });
}

function expireRound(state: ReturnType<typeof mix>, _now: number) {
  const deadline =
    state.activeGame?.mode === "black"
      ? state.activeGame.turnEndsAt
      : state.activeGame?.roundEndsAt;
  if (deadline === null || deadline === undefined) throw new Error("Missing round deadline");
  return stepMix(state, { type: "TICK" }, deadline).state;
}

describe("Mix Tea", () => {
  test("uses seeded tea selection and avoids immediate repeats by default", () => {
    const config = { blackEnabled: false, yellowEnabled: false };
    const sequence = (seed: number) => {
      let state = stepMix(mix(config, seed), { type: "START" }, 100).state;
      const teas = [state.currentTea];
      for (let index = 0; index < 7; index += 1) {
        state = expireRound(state, 100 + index * 20_000);
        expect(state.status).toBe("intermission");
        teas.push(state.upcomingTea);
        state = stepMix(state, { type: "TICK" }, state.intermissionEndsAt ?? 0).state;
      }
      return teas;
    };
    const first = sequence(99);
    expect(sequence(99)).toEqual(first);
    for (let index = 1; index < first.length; index += 1)
      expect(first[index]).not.toBe(first[index - 1]);
  });

  test("allows repeats when repeat avoidance is disabled", () => {
    let repeated = false;
    for (let seed = 1; seed < 100 && !repeated; seed += 1) {
      let state = stepMix(
        mix({ avoidImmediateRepeat: false, blackEnabled: false, yellowEnabled: false }, seed),
        { type: "START" },
        100,
      ).state;
      const firstTea = state.currentTea;
      state = expireRound(state, 100);
      repeated = state.upcomingTea === firstTea;
    }
    expect(repeated).toBe(true);
  });

  test("never chooses disabled teas and rejects zero enabled teas", () => {
    let state = stepMix(
      mix({ blackEnabled: false, redEnabled: false, yellowEnabled: false }),
      { type: "START" },
      10,
    ).state;
    expect(state.currentTea).toBe("green");
    for (let i = 0; i < 5; i += 1) {
      state = expireRound(state, 10 + i * 20_000);
      expect(state.upcomingTea).toBe("green");
      state = stepMix(state, { type: "TICK" }, state.intermissionEndsAt ?? 0).state;
    }
    expect(() =>
      mix({ blackEnabled: false, greenEnabled: false, redEnabled: false, yellowEnabled: false }),
    ).toThrow("At least one tea");
  });

  test("enforces the two-player minimum", () => {
    expect(() => createMixGame({ players: players.slice(0, 1), catalog, seed: 1 })).toThrow(
      "at least two players",
    );
  });

  test("plans bot actions for every tea through the delegated strategy", () => {
    const botPlayers: GamePlayer[] = [
      { id: "bot", name: "Bot", kind: "bot", skill: 1 },
      { id: "human", name: "Human", kind: "human", skill: 1 },
    ];
    for (const tea of ["black", "green", "red", "yellow"] as const) {
      const state = stepMix(
        createMixGame({
          players: botPlayers,
          catalog,
          seed: 7,
          config: {
            blackEnabled: tea === "black",
            greenEnabled: tea === "green",
            redEnabled: tea === "red",
            yellowEnabled: tea === "yellow",
          },
        }),
        { type: "START" },
        1_000,
      ).state;
      expect(state.currentTea).toBe(tea);
      if (state.activeGame?.mode === "black") expect(state.activeGame.botAction).not.toBeNull();
      else if (state.activeGame) expect(state.activeGame.botActions).toHaveLength(1);
    }
  });

  test("ends by points after a delegated Green win", () => {
    let state = stepMix(
      mix({
        blackEnabled: false,
        redEnabled: false,
        yellowEnabled: false,
        pointsToWin: 1,
        greenPoints: 2,
      }),
      { type: "START" },
      100,
    ).state;
    const word =
      state.activeGame?.mode === "green"
        ? state.activeGame.catalog.wordsByFragment[state.activeGame.fragment ?? ""]?.[0]
        : undefined;
    state = stepMix(
      state,
      { type: "SUBMIT_WORD", playerId: "a", word: word ?? "catapult" },
      200,
    ).state;
    expect(state.status).toBe("finished");
    expect(state.winnerId).toBe("a");
    expect(state.roundResults.at(-1)?.deltas.a?.points).toBe(2);
    expect(state.players.find(({ id }) => id === "a")?.points).toBe(2);
  });

  test("scores Black words during the sequence, then ends it at the first timeout", () => {
    let state = stepMix(
      mix({ greenEnabled: false, redEnabled: false, yellowEnabled: false, blackPoints: 2 }),
      { type: "START" },
      100,
    ).state;
    if (state.activeGame?.mode !== "black") throw new Error("Expected Black sequence");
    const firstPlayer = state.activeGame.currentPlayerId;
    const word = state.activeGame.catalog.wordsByFragment[state.activeGame.fragment ?? ""]?.[0];
    if (!word || !firstPlayer) throw new Error("Expected a Black answer and player");
    state = stepMix(state, { type: "SUBMIT_WORD", playerId: firstPlayer, word }, 200).state;
    expect(state.players.find(({ id }) => id === firstPlayer)?.points).toBe(2);
    const deadline = state.activeGame?.mode === "black" ? state.activeGame.turnEndsAt : null;
    if (deadline === null) throw new Error("Expected the next Black turn");
    state = stepMix(state, { type: "TICK" }, deadline).state;
    expect(state.status).toBe("intermission");
    const result = state.roundResults.at(-1);
    expect(result?.reason).toBe("timeout");
    expect(result?.deltas[firstPlayer]?.points).toBe(2);
    expect(result?.deltas[firstPlayer]?.hp).toBe(0);
  });

  test("ends by elimination after a Black timeout and keeps Black-only play sensible", () => {
    let state = stepMix(
      mix({
        greenEnabled: false,
        redEnabled: false,
        yellowEnabled: false,
        baseHp: 2,
        blackTimeMs: 5_000,
      }),
      { type: "START" },
      100,
    ).state;
    state = expireRound(state, 100);
    expect(state.status).toBe("intermission");
    expect(state.players.some(({ hp }) => hp === 1)).toBe(true);
    expect(state.upcomingTea).toBe("black");
    const firstTimedOut = state.roundResults.at(-1)?.deltas;
    state = stepMix(state, { type: "TICK" }, state.intermissionEndsAt ?? 0).state;
    expect(state.activeGame?.mode === "black" && state.activeGame.currentPlayerId).toBe(
      Object.entries(firstTimedOut ?? {}).find(([, delta]) => delta.hp < 0)?.[0] === "a"
        ? "b"
        : "a",
    );
    for (let index = 0; index < 3 && state.status !== "finished"; index += 1) {
      state = expireRound(state, 20_000 + index * 10_000);
      if (state.status === "intermission")
        state = stepMix(state, { type: "TICK" }, state.intermissionEndsAt ?? 0).state;
    }
    expect(state.status).toBe("finished");
    expect(state.players.filter(({ alive }) => alive)).toHaveLength(1);
    expect(state.winnerId).toBe(state.players.find(({ alive }) => alive)?.id ?? null);
  });

  test("ends cleanly when Black is the only enabled tea with no unused fragments", () => {
    const exhausted = mix({ greenEnabled: false, redEnabled: false, yellowEnabled: false });
    const allWords = [...new Set(Object.values(catalog.wordsByFragment).flat())];
    const state = stepMix({ ...exhausted, usedWords: allWords }, { type: "START" }, 100).state;
    expect(state.status).toBe("finished");
    expect(state.winnerId).toBe("a");
    expect(state.roundResults.at(-1)?.reason).toBe("unavailable");
  });
});
