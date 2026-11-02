# Repository guidance

## Stack

- Bun for runtime, package management, workspaces, and tests.
- Strict TypeScript throughout.
- Solid and Vite for the browser UI; run Vite through `bunx --bun vite`.
- `Bun.serve` and native WebSockets for the server. Do not add Express or Hono.
- Zod for shared protocol schemas.
- Vanilla CSS with custom properties; use DOM and SVG, not canvas or Tailwind.
- Biome for linting and formatting.

Keep dependencies minimal and document why each new dependency is needed.

## Architecture

- `packages/engine` is pure game logic: no DOM, I/O, `Date.now()`, or timers. Game state advances through `step(state, event, now) => { state, effects }` with injected time and random values.
- Modes implement a common round strategy interface. Black is turn based; Mix and other modes should fit without changing the engine core.
- `packages/words` owns reproducible dictionary processing, generated word data, and 3-letter fragment indexes.
- `packages/protocol` owns shared WebSocket schemas and types.
- `apps/server` is authoritative for multiplayer validity. Clients do not decide word validity.
- `apps/web` contains the Solid UI and uses a game connection for local solo play and remote multiplayer.

## Multiplayer notes

- Server messages use full snapshots rather than deltas. This keeps room entry and later reconnect support simple. Snapshots omit catalogs, RNG state, and planned bot actions.
- During a Yellow round, all message contents and scores are hidden until the round resolves.
- The version 1 client messages are `hello`, `create_room`, `join_room`, `set_ready`, `configure_room`, `start_game`, `submit_word`, `submit_message`, and `leave_room`. Server messages are `hello`, `welcome`, `snapshot`, and `error`.
- Black turns for disconnected players continue to their normal timeout, including its HP penalty. Disconnected players remain seated through Green, Red, and Yellow rounds and make no submissions. If the host disconnects, the next connected human by join order becomes host.
- Green uses server receipt time, so lower network latency can provide a small advantage. A short server-side grace window is a possible later mitigation.
- The server uses Bun's native HTTP and WebSocket APIs. Zod is already a protocol dependency; avoid adding runtime dependencies without need.

## Commands

- `bun install` installs all workspace dependencies.
- `bun test` runs the test suite.
- `bun run dev:web` starts the Vite development server via `bunx --bun vite`.
- `bun run build:web` builds the browser app.
- `bun run typecheck` checks every workspace with strict TypeScript.
- `bun run lint` and `bun run format` run Biome.
- `bun run words:build` downloads/processes the source word list and generates game data.

Use the scripts in package manifests as the source of truth when commands change.
