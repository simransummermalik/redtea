import { z } from "zod";

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 2_048;

const name = z.string().trim().min(1).max(24);
const roomCode = z.string().regex(/^[A-Z0-9]{5}$/);
const config = z.record(z.string(), z.union([z.number(), z.boolean()]));

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), version: z.number().int(), clientSentAt: z.number() }),
  z.object({ type: z.literal("create_room"), name }),
  z.object({ type: z.literal("join_room"), code: roomCode, name }),
  z.object({ type: z.literal("set_ready"), ready: z.boolean() }),
  z.object({
    type: z.literal("configure_room"),
    mode: z.enum(["black", "green", "red", "yellow"]),
    config,
    botCount: z.number().int().min(0).max(3),
  }),
  z.object({ type: z.literal("start_game") }),
  z.object({ type: z.literal("submit_word"), word: z.string().trim().min(1).max(80) }),
  z.object({ type: z.literal("submit_message"), message: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal("leave_room") }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    version: z.number().int(),
    clientSentAt: z.number(),
    serverReceivedAt: z.number(),
  }),
  z.object({ type: z.literal("welcome"), playerId: z.string(), roomCode }),
  z.object({
    type: z.literal("snapshot"),
    room: z.object({
      code: roomCode,
      phase: z.enum(["lobby", "playing", "finished"]),
      hostId: z.string(),
      mode: z.enum(["black", "green", "red", "yellow"]),
      botCount: z.number().int(),
    }),
    players: z.array(
      z.object({
        id: z.string(),
        name,
        kind: z.enum(["human", "bot"]),
        ready: z.boolean(),
        connected: z.boolean(),
      }),
    ),
    game: z.unknown(),
  }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;
