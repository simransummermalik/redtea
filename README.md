# Redtea

A browser word game inspired by the Tea minigames in Mudae. The repository is a Bun workspace monorepo with a pure TypeScript game engine, a word-list pipeline, shared protocol schemas, a Solid frontend, and a Bun server.

See [AGENTS.md](./AGENTS.md) for the stack, architecture principles, and development commands.

The game rules reference is the [Mudae Tea wiki page](https://mudae.fandom.com/wiki/Tea).

## Deploy to Fly.io

The Docker image builds the Solid app and runs it with the Bun WebSocket server on port `3001`. The same origin serves the web app, `/ws`, and `/health`, so the browser uses `wss://` automatically when Fly terminates HTTPS at its proxy.

Set a globally unique app name in `fly.toml`, then create and deploy it:

```sh
fly apps create redtea-yourname
fly deploy
fly scale count 1
```

Use the included `fly.toml` and keep the app at one machine (`fly scale count 1`). Multiplayer rooms, reconnect tokens, timers, and player state live only in process memory. A process restart or deploy closes every room; a second instance would have separate rooms and cannot accept a reconnect for a session owned by the other instance. The config disables automatic stopping to avoid routinely discarding active rooms.

The `/health` endpoint reports process health and protocol version. Configure limits with environment variables when needed: `RECONNECT_GRACE_MS`, `LOBBY_COUNTDOWN_MS`, `EMPTY_ROOM_TIMEOUT_MS`, `IDLE_ROOM_TIMEOUT_MS`, `MAX_ROOMS`, `MAX_ROOMS_PER_IP`, and `MAX_PLAYERS_PER_ROOM`.

To exercise the room loop outside CI, run `bun run load:server -- <rooms> <bots-per-room> <duration-ms>`. For example, `bun run load:server -- 100 3 60000` starts 100 rooms with three bots each and reports maximum event-loop drift and RSS growth.
