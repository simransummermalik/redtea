import { describe, expect, test } from "bun:test";
import { createWordCatalog } from "@redtea/engine";
import { MAX_MESSAGE_BYTES, type ServerMessage } from "@redtea/protocol";
import { type Clock, RoomService } from "../src/rooms";

const wordList = [
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
];
const catalog = createWordCatalog(
  wordList,
  [
    { fragment: "cat", solutionCount: 5 },
    { fragment: "dog", solutionCount: 5 },
  ],
  5,
);

class FakeClock implements Clock {
  private time = 100_000;
  private nextId = 1;
  private timers = new Map<number, { at: number; callback: () => void }>();
  failNow = false;
  now(): number {
    if (this.failNow) throw new Error("clock failure");
    return this.time;
  }
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + delay, callback });
    return id as unknown as ReturnType<typeof setTimeout>;
  }
  clearTimeout(timer: ReturnType<typeof setTimeout>): void {
    this.timers.delete(timer as unknown as number);
  }
  advance(milliseconds: number): void {
    const end = this.time + milliseconds;
    while (true) {
      const next = [...this.timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.time = end;
  }
}

function fixture(options: ConstructorParameters<typeof RoomService>[0] = {}) {
  const out = new Map<string, ServerMessage[]>();
  const clock = new FakeClock();
  let playerSequence = 0;
  let tokenSequence = 0;
  let requestSequence = 0;
  const service = new RoomService({
    catalog,
    clock,
    codeFactory: () => "ABCDE",
    idFactory: () => `player-${++playerSequence}`,
    sessionTokenFactory: () => `redtea-session-token-${++tokenSequence}`,
    countdownMs: 10_000,
    ...options,
  });
  const connect = (id: string) => {
    out.set(id, []);
    service.connect(id, (message) => out.get(id)?.push(message), "127.0.0.1");
  };
  const receive = (id: string, message: unknown) => {
    if (typeof message === "object" && message !== null && "type" in message) {
      const value = message as Record<string, unknown>;
      if ((value.type === "create_room" || value.type === "join_room") && !value.requestId)
        message = { ...value, requestId: `test-request-id-${++requestSequence}` };
    }
    service.receive(id, JSON.stringify(message));
  };
  const hello = (id: string, sessionToken?: string) =>
    receive(id, {
      type: "hello",
      version: 2,
      clientSentAt: 10,
      ...(sessionToken ? { sessionToken } : {}),
    });
  const latestSnapshot = (id: string) =>
    out
      .get(id)
      ?.filter((message) => message.type === "snapshot")
      .at(-1);
  const sessionToken = (id: string) => {
    const welcome = out.get(id)?.find((message) => message.type === "welcome");
    return welcome?.type === "welcome" ? welcome.sessionToken : undefined;
  };
  return { service, out, clock, connect, receive, hello, latestSnapshot, sessionToken };
}

function createTwoPlayerRoom(
  f: ReturnType<typeof fixture>,
  mode: "black" | "green" | "red" | "yellow" = "green",
) {
  f.connect("host");
  f.connect("guest");
  f.hello("host");
  f.hello("guest");
  f.receive("host", { type: "create_room", name: "Host" });
  f.receive("guest", { type: "join_room", code: "ABCDE", name: "Guest" });
  f.receive("guest", { type: "set_ready", ready: true });
  f.receive("host", {
    type: "configure_room",
    mode,
    botCount: 0,
    config: mode === "black" ? { initialTurnMs: 5_000 } : {},
  });
}

function start(f: ReturnType<typeof fixture>) {
  f.receive("host", { type: "start_game" });
  f.clock.advance(10_000);
}

describe("RoomService protocol and lifecycle", () => {
  test("malformed input is isolated and repeated malformed messages disconnect", () => {
    const f = fixture();
    f.connect("one");
    f.hello("one");
    expect(() => f.service.receive("one", "x".repeat(MAX_MESSAGE_BYTES + 1))).not.toThrow();
    expect(() => f.service.receive("one", "{")).not.toThrow();
    f.service.receive("one", "not-json");
    f.service.receive("one", "[]");
    expect(
      f.out
        .get("one")
        ?.some((message) => message.type === "error" && message.code === "disconnected"),
    ).toBe(true);
  });

  test("the server rejects clients using the old protocol version", () => {
    const f = fixture();
    f.connect("old-client");
    f.receive("old-client", { type: "hello", version: 1, clientSentAt: 10 });
    expect(
      f.out
        .get("old-client")
        ?.some((message) => message.type === "error" && message.code === "version_mismatch"),
    ).toBe(true);
  });

  test("message rate limits include handshake traffic and escalate to disconnect", () => {
    const f = fixture();
    f.connect("one");
    for (let count = 0; count < 34; count++) f.hello("one");
    expect(
      f.out
        .get("one")
        ?.some((message) => message.type === "error" && message.code === "rate_limited"),
    ).toBe(true);
    expect(
      f.out
        .get("one")
        ?.some((message) => message.type === "error" && message.code === "disconnected"),
    ).toBe(true);
  });

  test("joins during countdown and starts when its window expires", () => {
    const f = fixture();
    createTwoPlayerRoom(f);
    f.receive("host", { type: "start_game" });
    expect(
      f.latestSnapshot("host")?.type === "snapshot" && f.latestSnapshot("host")?.room.phase,
    ).toBe("countdown");
    f.connect("late");
    f.hello("late");
    f.receive("late", { type: "join_room", code: "ABCDE", name: "Late" });
    expect(
      f.latestSnapshot("host")?.type === "snapshot" && f.latestSnapshot("host")?.players,
    ).toHaveLength(3);
    f.clock.advance(10_000);
    const snapshot = f.latestSnapshot("host");
    expect(snapshot?.type === "snapshot" && snapshot.room.phase).toBe("playing");
    expect(
      snapshot?.type === "snapshot" && (snapshot.game as { players: unknown[] }).players,
    ).toHaveLength(3);
  });

  test("an empty join window ends without starting and gives original flavor text", () => {
    const f = fixture();
    f.connect("host");
    f.hello("host");
    f.receive("host", { type: "create_room", name: "Host" });
    f.receive("host", { type: "start_game" });
    expect(
      f.latestSnapshot("host")?.type === "snapshot" && f.latestSnapshot("host")?.room.phase,
    ).toBe("countdown");
    f.clock.advance(10_000);
    const snapshot = f.latestSnapshot("host");
    expect(snapshot?.type === "snapshot" && snapshot.room.phase).toBe("lobby");
    expect(snapshot?.type === "snapshot" && snapshot.game).toBeNull();
    expect(
      f.out
        .get("host")
        ?.some((message) => message.type === "error" && message.message.includes("No one made it")),
    ).toBe(true);
  });

  test("a create request retried after a lost welcome reclaims the same seat", () => {
    const f = fixture();
    f.connect("first");
    f.hello("first");
    const request = { type: "create_room", requestId: "lost-create-response-0001", name: "Host" };
    f.receive("first", request);
    const originalToken = f.sessionToken("first");
    f.service.disconnect("first");
    f.connect("retry");
    f.hello("retry");
    f.receive("retry", request);
    const welcome = f.out.get("retry")?.find((message) => message.type === "welcome");
    expect(welcome?.type === "welcome" && welcome.playerId).toBe("player-1");
    expect(welcome?.type === "welcome" && welcome.sessionToken).not.toBe(originalToken);
    expect(
      f.latestSnapshot("retry")?.type === "snapshot" && f.latestSnapshot("retry")?.players,
    ).toHaveLength(1);
  });

  for (const mode of ["black", "green", "red", "yellow"] as const) {
    test(`reconnects to the same ${mode} seat during a round`, () => {
      const f = fixture();
      createTwoPlayerRoom(f, mode);
      const token = f.sessionToken("guest");
      expect(token).toBeTruthy();
      start(f);
      const before = f.latestSnapshot("host");
      if (before?.type !== "snapshot") throw new Error("Expected starting snapshot");
      const beforeGame = before.game as {
        fragment: string;
        turnEndsAt?: number;
        roundEndsAt?: number;
      };
      f.service.disconnect("guest");
      f.connect("guest-reconnected");
      f.hello("guest-reconnected", token);
      const welcome = f.out.get("guest-reconnected")?.find((message) => message.type === "welcome");
      expect(welcome?.type === "welcome" && welcome.playerId).toBe("player-2");
      const snapshot = f.latestSnapshot("guest-reconnected");
      expect(snapshot?.type === "snapshot" && snapshot.room.phase).toBe("playing");
      expect(snapshot?.type === "snapshot" && (snapshot.game as { mode: string }).mode).toBe(mode);
      expect(
        snapshot?.type === "snapshot" &&
          snapshot.players.find((player) => player.id === "player-2")?.connected,
      ).toBe(true);
      const afterGame =
        snapshot?.type === "snapshot"
          ? (snapshot.game as { fragment: string; turnEndsAt?: number; roundEndsAt?: number })
          : null;
      expect(afterGame?.fragment).toBe(beforeGame.fragment);
      expect(afterGame?.turnEndsAt ?? afterGame?.roundEndsAt).toBe(
        beforeGame.turnEndsAt ?? beforeGame.roundEndsAt,
      );
      if (mode === "yellow") {
        const game =
          snapshot?.type === "snapshot"
            ? (snapshot.game as { roundSubmissions: { text: string }[] })
            : null;
        expect(game?.roundSubmissions.every((submission) => submission.text === "")).toBe(true);
      }
    });
  }

  for (const mode of ["green", "red", "yellow"] as const) {
    test(`a disconnected ${mode} player stays seated and is not eliminated`, () => {
      const f = fixture();
      createTwoPlayerRoom(f, mode);
      start(f);
      f.service.disconnect("guest");
      f.clock.advance(1_000);
      const snapshot = f.latestSnapshot("host");
      expect(snapshot?.type === "snapshot" && snapshot.room.phase).toBe("playing");
      expect(
        snapshot?.type === "snapshot" &&
          snapshot.players.find((player) => player.id === "player-2")?.connected,
      ).toBe(false);
      const game =
        snapshot?.type === "snapshot"
          ? (snapshot.game as { players: { id: string; alive?: boolean }[] })
          : null;
      expect(
        game?.players.some((player) => player.id === "player-2" && player.alive !== false),
      ).toBe(true);
    });
  }

  test("a client dropped during its Black turn takes the normal timeout HP loss", () => {
    const f = fixture();
    createTwoPlayerRoom(f, "black");
    start(f);
    const snapshot = f.latestSnapshot("host");
    if (snapshot?.type !== "snapshot") throw new Error("Expected game snapshot");
    const game = snapshot.game as {
      currentPlayerId: string;
      players: { id: string; hp: number }[];
      turnNumber: number;
    };
    const turnPeer = game.currentPlayerId === "player-1" ? "host" : "guest";
    const observer = turnPeer === "host" ? "guest" : "host";
    const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId);
    if (!currentPlayer) throw new Error("Expected current player");
    f.service.disconnect(turnPeer);
    f.clock.advance(5_001);
    const after = f.latestSnapshot(observer);
    if (after?.type !== "snapshot") throw new Error("Expected timeout snapshot");
    const next = after.game as { turnNumber: number; players: { id: string; hp: number }[] };
    expect(next.turnNumber).toBeGreaterThan(game.turnNumber);
    expect(next.players.find((player) => player.id === currentPlayer.id)?.hp).toBe(
      currentPlayer.hp - 1,
    );
  });

  test("host migration happens when the grace period expires", () => {
    const f = fixture({ reconnectGraceMs: 2_000 });
    createTwoPlayerRoom(f);
    f.service.disconnect("host");
    expect(
      f.latestSnapshot("guest")?.type === "snapshot" && f.latestSnapshot("guest")?.room.hostId,
    ).toBe("player-1");
    f.clock.advance(2_000);
    expect(
      f.latestSnapshot("guest")?.type === "snapshot" && f.latestSnapshot("guest")?.room.hostId,
    ).toBe("player-2");
  });

  test("expired sessions cannot reclaim seats and empty rooms are cleaned up", () => {
    const f = fixture({ reconnectGraceMs: 1_000, emptyRoomTimeoutMs: 2_000 });
    f.connect("host");
    f.hello("host");
    f.receive("host", { type: "create_room", name: "Host" });
    const token = f.sessionToken("host");
    f.service.disconnect("host");
    f.clock.advance(2_000);
    f.connect("returning");
    f.hello("returning", token);
    expect(
      f.out
        .get("returning")
        ?.some((message) => message.type === "error" && message.code === "session_expired"),
    ).toBe(true);
    f.connect("new-player");
    f.hello("new-player");
    f.receive("new-player", { type: "join_room", code: "ABCDE", name: "New" });
    expect(
      f.out
        .get("new-player")
        ?.some((message) => message.type === "error" && message.code === "room_unavailable"),
    ).toBe(true);
  });

  test("idle connected rooms are cleaned up", () => {
    const f = fixture({ idleRoomTimeoutMs: 1_000 });
    f.connect("host");
    f.hello("host");
    f.receive("host", { type: "create_room", name: "Host" });
    f.clock.advance(1_000);
    expect(
      f.out
        .get("host")
        ?.some((message) => message.type === "error" && message.code === "room_closed"),
    ).toBe(true);
    f.connect("new-player");
    f.hello("new-player");
    f.receive("new-player", { type: "join_room", code: "ABCDE", name: "New" });
    expect(
      f.out
        .get("new-player")
        ?.some((message) => message.type === "error" && message.code === "room_unavailable"),
    ).toBe(true);
  });

  test("room timer errors are isolated and do not escape the room callback", () => {
    const f = fixture();
    createTwoPlayerRoom(f);
    start(f);
    f.clock.failNow = true;
    expect(() => f.clock.advance(30_001)).not.toThrow();
    f.clock.failNow = false;
    const snapshot = f.latestSnapshot("host");
    expect(snapshot?.type === "snapshot" && snapshot.room.phase).toBe("finished");
    expect(
      f.out
        .get("host")
        ?.some((message) => message.type === "error" && message.code === "room_error"),
    ).toBe(true);
  });

  test("host-only room configuration and start are enforced", () => {
    const f = fixture();
    createTwoPlayerRoom(f);
    f.receive("guest", { type: "configure_room", mode: "red", botCount: 0, config: {} });
    f.receive("guest", { type: "start_game" });
    expect(
      f.out
        .get("guest")
        ?.filter((message) => message.type === "error" && message.code === "host_only"),
    ).toHaveLength(2);
  });

  test("room creation limits and name normalization are enforced", () => {
    const f = fixture({ maxRoomsPerIp: 1 });
    f.connect("first");
    f.connect("second");
    f.hello("first");
    f.hello("second");
    f.receive("first", { type: "create_room", name: "  Ana\n\u0000  " });
    f.receive("second", { type: "create_room", name: "Second" });
    const snapshot = f.latestSnapshot("first");
    expect(snapshot?.type === "snapshot" && snapshot.players[0]?.name).toBe("Ana");
    expect(
      f.out
        .get("second")
        ?.some((message) => message.type === "error" && message.code === "room_limit"),
    ).toBe(true);
  });

  test("room player and total room caps are enforced", () => {
    const f = fixture({ maxPlayersPerRoom: 2, maxRooms: 1, maxRoomsPerIp: 3 });
    createTwoPlayerRoom(f);
    f.connect("third");
    f.hello("third");
    f.receive("third", { type: "join_room", code: "ABCDE", name: "Third" });
    expect(
      f.out
        .get("third")
        ?.some((message) => message.type === "error" && message.code === "room_full"),
    ).toBe(true);
    f.connect("extra-room");
    f.hello("extra-room");
    f.receive("extra-room", { type: "create_room", name: "Extra" });
    expect(
      f.out
        .get("extra-room")
        ?.some((message) => message.type === "error" && message.code === "room_limit"),
    ).toBe(true);
  });
});
