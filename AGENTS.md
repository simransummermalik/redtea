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
- Modes implement a common round strategy interface with an explicit round-complete boundary. Black is turn based within a round; Mix composes existing tea strategies, combines their point/HP changes, and selects the next round without duplicating tea rules.
- `packages/words` owns reproducible dictionary processing, generated word data, and 3-letter fragment indexes.
- `packages/protocol` owns shared WebSocket schemas and types.
- `apps/server` is authoritative for multiplayer validity. Clients do not decide word validity.
- `apps/web` contains the Solid UI and uses a game connection for local solo play and remote multiplayer.

## Multiplayer notes

- Server messages use full snapshots rather than deltas. This keeps room entry and later reconnect support simple. Snapshots omit catalogs, RNG state, and planned bot actions.
- During a Yellow round, all message contents and scores are hidden until the round resolves.
- Protocol version 3 keeps the v1/v2 actions, adds Mix mode to the mode schema, and preserves v2 session resumption through optional `sessionToken` on `hello` and `requestId` on room create/join. `welcome` returns the rotated token. Snapshots include the `countdown` phase and `countdownEndsAt`; Mix game snapshots expose the current tea, upcoming tea, and each player's points and HP. `shutdown` asks clients to reconnect after deploy shutdown. Reject incompatible protocol versions.
- The browser keeps the session token in `sessionStorage`, scoped to its tab and lifetime. This restores seats after reloads while avoiding a bearer credential that persists across browser restarts. Reconnect does not reset game timers or reveal additional state. Yellow submission contents and scores remain hidden until the round resolves.
- A disconnected seat is reserved during the configurable reconnect grace period. Black turns continue to their normal timeout and take the usual HP penalty. During Green, Red, and Yellow, disconnected players simply make no submissions and are not eliminated. Reconnecting players recover the same seat and full current snapshot in every mode.
- When the host remains disconnected past grace, promote the connected human with the earliest join order. Only the host can change configuration or start a game. A host start opens a 10-second join countdown; all supported modes require at least two participants when it resolves.
- If all humans disconnect, close the room after the configured empty-room timeout. Idle rooms also expire. Rooms and sessions are in memory, so a deploy or process restart ends all rooms.
- Green uses server receipt time, so lower network latency can provide a small advantage. Reconnect preserves the current deadline and fragment and does not restore time already spent offline.
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
