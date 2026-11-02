import { describe, expect, test } from "bun:test";
import { clientMessageSchema, PROTOCOL_VERSION, serverMessageSchema } from "../src";

describe("WebSocket protocol schemas", () => {
  test("accepts valid intents and rejects malformed or unknown messages", () => {
    expect(clientMessageSchema.safeParse({ type: "submit_word", word: "catapult" }).success).toBe(
      true,
    );
    expect(clientMessageSchema.safeParse({ type: "submit_word", word: "" }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: "make_up_action" }).success).toBe(false);
  });

  test("validates versioned handshake and room snapshots", () => {
    expect(PROTOCOL_VERSION).toBe(3);
    expect(
      serverMessageSchema.safeParse({
        type: "hello",
        version: 2,
        clientSentAt: 10,
        serverReceivedAt: 11,
      }).success,
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({
        type: "snapshot",
        room: {
          code: "ABCDE",
          phase: "playing",
          hostId: "p1",
          mode: "mix",
          botCount: 0,
          countdownEndsAt: null,
        },
        players: [],
        game: { mode: "mix", currentTea: "black", upcomingTea: "yellow" },
      }).success,
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({
        type: "snapshot",
        room: {
          code: "abcde",
          phase: "lobby",
          hostId: "p1",
          mode: "green",
          botCount: 0,
          countdownEndsAt: null,
        },
        players: [],
        game: null,
      }).success,
    ).toBe(false);
    expect(
      serverMessageSchema.safeParse({
        type: "snapshot",
        room: {
          code: "ABCDE",
          phase: "countdown",
          hostId: "p1",
          mode: "green",
          botCount: 0,
          countdownEndsAt: 20,
        },
        players: [],
        game: null,
      }).success,
    ).toBe(true);
  });
});
