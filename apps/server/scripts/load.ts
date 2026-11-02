import { PROTOCOL_VERSION } from "@redtea/protocol";
import { catalogFromData, RoomService } from "../src/rooms";

const roomCount = Math.max(1, Number(Bun.argv[2] ?? 100));
const botCount = Math.min(3, Math.max(1, Number(Bun.argv[3] ?? 3)));
const durationMs = Math.max(1_000, Number(Bun.argv[4] ?? 60_000));
const wordsUrl = new URL("../../../packages/words/data/generated/words.txt", import.meta.url);
const fragmentsUrl = new URL(
  "../../../packages/words/data/generated/fragments.json",
  import.meta.url,
);
const [wordsText, fragmentsText] = await Promise.all([
  Bun.file(wordsUrl).text(),
  Bun.file(fragmentsUrl).text(),
]);
const catalog = catalogFromData(wordsText, JSON.parse(fragmentsText));
let codeSequence = 0;
let playerSequence = 0;
let tokenSequence = 0;
const service = new RoomService({
  catalog,
  countdownMs: 100,
  maxRooms: Math.max(500, roomCount),
  maxPlayersPerRoom: 8,
  codeFactory: () => (codeSequence++).toString(36).toUpperCase().padStart(5, "0").slice(-5),
  idFactory: () => `load-player-${++playerSequence}`,
  sessionTokenFactory: () => `load-session-token-${++tokenSequence}`,
  log: (event, fields) => {
    if (event === "room_step_error") console.error(JSON.stringify({ event, ...fields }));
  },
});

const startRss = process.memoryUsage().rss;
let maxLoopDriftMs = 0;
let expectedAt = performance.now() + 100;
const monitor = setInterval(() => {
  const now = performance.now();
  maxLoopDriftMs = Math.max(maxLoopDriftMs, now - expectedAt);
  expectedAt = now + 100;
}, 100);

for (let index = 0; index < roomCount; index++) {
  const peerId = `room-host-${index}`;
  service.connect(peerId, () => {}, "load-test");
  service.receive(
    peerId,
    JSON.stringify({ type: "hello", version: PROTOCOL_VERSION, clientSentAt: Date.now() }),
  );
  service.receive(
    peerId,
    JSON.stringify({
      type: "create_room",
      requestId: `load-request-id-${index}`,
      name: `Load ${index}`,
    }),
  );
  service.receive(
    peerId,
    JSON.stringify({
      type: "configure_room",
      mode: "green",
      botCount,
      config: { botCount, pointsToWin: 99, roundTimeMs: 10_000 },
    }),
  );
  service.receive(peerId, JSON.stringify({ type: "start_game" }));
}

await Bun.sleep(durationMs);
clearInterval(monitor);
const endRss = process.memoryUsage().rss;
service.shutdown();
console.log(
  JSON.stringify({
    rooms: roomCount,
    botsPerRoom: botCount,
    durationMs,
    maxLoopDriftMs: Math.round(maxLoopDriftMs * 10) / 10,
    rssStartMb: Math.round(startRss / 1024 / 1024),
    rssEndMb: Math.round(endRss / 1024 / 1024),
    rssGrowthMb: Math.round((endRss - startRss) / 1024 / 1024),
  }),
);
