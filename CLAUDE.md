# Multiplayer architecture notes

- `packages/engine` remains the shared source of game rules. The browser uses it through `LocalConnection` for solo play; `apps/server` uses it for all room games.
- `packages/protocol` owns the versioned Zod WebSocket message schemas.
- `apps/server/src/rooms.ts` owns in-memory room state, server timestamps, timer scheduling, intent validation, and room snapshots. WebSocket delivery uses one Bun pub/sub topic per room.
- `apps/web/src/connection.ts` is the UI boundary between local and remote play.

Server messages use full snapshots rather than deltas. The game is small, and snapshots simplify initial room entry and later reconnect support. Snapshots omit catalogs, RNG state, and planned bot actions. During a Yellow round, all message contents and scores are hidden until the round resolves.

The version 1 client messages are `hello`, `create_room`, `join_room`, `set_ready`, `configure_room`, `start_game`, `submit_word`, `submit_message`, and `leave_room`. Server messages are `hello`, `welcome`, `snapshot`, and `error`.

Disconnect behavior for this core loop: Black turns continue to their normal timeout (including its HP penalty); disconnected players remain seated through Green, Red, and Yellow rounds and make no submissions. If the host disconnects, the next connected human by join order becomes host. Green uses server receipt time, so lower network latency can provide a small advantage; a short server-side grace window is a possible later mitigation.

The server uses only Bun's native HTTP and WebSocket APIs. No new runtime dependency is needed; Zod was already a protocol dependency.
