import { describe, expect, test } from "bun:test";
import { createWordCatalog } from "@redtea/engine";
import type { ServerMessage } from "@redtea/protocol";
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
  now(): number {
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

function socketMessages() {
  const out = new Map<string, ServerMessage[]>();
  const service = new RoomService({
    catalog,
    clock: new FakeClock(),
    codeFactory: () => "ABCDE",
    idFactory: (() => {
      let id = 0;
      return () => `player-${++id}`;
    })(),
  });
  const connect = (id: string) => {
    out.set(id, []);
    service.connect(id, (message) => out.get(id)?.push(message));
  };
  const receive = (id: string, message: unknown) => service.receive(id, JSON.stringify(message));
  return { service, out, connect, receive };
}

function hello(receive: (id: string, message: unknown) => void, id: string): void {
  receive(id, { type: "hello", version: 1, clientSentAt: 10 });
}

describe("RoomService protocol and game loop", () => {
  test("drops malformed, unknown, invalid-version, and oversized messages", () => {
    const { connect, receive, out, service } = socketMessages();
    connect("one");
    receive("one", { type: "hello", version: 1, clientSentAt: 1 });
    const countAfterHello = out.get("one")?.length;
    receive("one", { type: "nonsense" });
    receive("one", { type: "create_room", name: "" });
    receive("one", JSON.stringify({ type: "create_room", name: "Large" }).padEnd(3_000, " "));
    expect(out.get("one")).toHaveLength(countAfterHello);
    service.disconnect("one");
  });

  test("two socket peers join and finish a Green game through server validation", () => {
    const { connect, receive, out } = socketMessages();
    connect("socket-a");
    connect("socket-b");
    hello(receive, "socket-a");
    hello(receive, "socket-b");
    receive("socket-a", { type: "create_room", name: "Ari" });
    receive("socket-b", { type: "join_room", code: "ABCDE", name: "Bea" });
    receive("socket-b", { type: "set_ready", ready: true });
    receive("socket-a", {
      type: "configure_room",
      mode: "green",
      botCount: 0,
      config: { botCount: 0, pointsToWin: 1, roundTimeMs: 5_000 },
    });
    receive("socket-a", { type: "start_game" });

    const snapshot = out
      .get("socket-a")
      ?.filter((message) => message.type === "snapshot")
      .at(-1);
    expect(snapshot?.type).toBe("snapshot");
    if (snapshot?.type !== "snapshot") throw new Error("Expected game snapshot");
    const game = snapshot.game as { fragment: string; players: { id: string }[]; status: string };
    expect(game.status).toBe("playing");
    expect(game.players).toHaveLength(2);
    const word = catalog.wordsByFragment[game.fragment]?.[0];
    expect(word).toBeTruthy();
    receive("socket-b", { type: "submit_word", word });

    const finalSnapshot = out
      .get("socket-a")
      ?.filter((message) => message.type === "snapshot")
      .at(-1);
    expect(finalSnapshot?.type).toBe("snapshot");
    if (finalSnapshot?.type !== "snapshot") throw new Error("Expected final snapshot");
    expect(finalSnapshot.room.phase).toBe("finished");
    expect((finalSnapshot.game as { winnerId: string }).winnerId).toBe("player-2");
  });

  test("fake clock drives a room timeout and next-round snapshot", () => {
    const clock = new FakeClock();
    const messages: ServerMessage[] = [];
    const service = new RoomService({
      catalog,
      clock,
      codeFactory: () => "FGHIJ",
      idFactory: (() => {
        let id = 0;
        return () => `p-${++id}`;
      })(),
    });
    service.connect("host", (message) => messages.push(message));
    service.receive("host", JSON.stringify({ type: "hello", version: 1, clientSentAt: 0 }));
    service.receive("host", JSON.stringify({ type: "create_room", name: "Host" }));
    service.receive(
      "host",
      JSON.stringify({
        type: "configure_room",
        mode: "green",
        botCount: 1,
        config: {
          botCount: 1,
          pointsToWin: 5,
          roundTimeMs: 1_000,
          allowWordReuse: false,
          botFastestThinkMs: 10_000,
          botSlowestThinkMs: 10_000,
        },
      }),
    );
    service.receive("host", JSON.stringify({ type: "start_game" }));
    clock.advance(1_001);
    const latest = messages.filter((message) => message.type === "snapshot").at(-1);
    expect(latest?.type).toBe("snapshot");
    if (latest?.type !== "snapshot") throw new Error("Expected timeout snapshot");
    expect((latest.game as { roundNumber: number }).roundNumber).toBe(2);
  });
});
