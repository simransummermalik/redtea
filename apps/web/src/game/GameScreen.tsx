import type { RoundResult, RoundSubmission } from "@redtea/engine";
import { getRoundTimeRemainingMs, getTimeRemainingMs, mixTimeRemainingMs } from "@redtea/engine";
import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js";
import type { AnyGameState, RoomView } from "../connection";
import {
  type BotMood,
  Fox,
  FoxAvatar,
  type FoxMood,
  Heart,
  HotCup,
  Leaf,
  MUG,
  MugBack,
  MugFront,
  mugLevelY,
  SugarCube,
  TeapotBot,
  TeaWheel,
} from "./art";
import "./game.css";

export type TeaName = "black" | "green" | "red" | "yellow";

export type EffectPulse = {
  seq: number;
  effects: readonly { type: string; [key: string]: unknown }[];
};

export interface GameScreenProps {
  game: AnyGameState;
  room: RoomView | undefined;
  selfId: string;
  clock: number;
  entry: string;
  onEntry: (value: string) => void;
  onSubmit: (event: SubmitEvent) => void;
  inputRef: (element: HTMLInputElement | HTMLTextAreaElement) => void;
  connectionState: "connected" | "reconnecting" | "disconnected";
  notice: string;
  pulse: EffectPulse;
  onLeave: () => void;
  onPlayAgain: (() => void) | undefined;
}

type SeatPlayer = {
  id: string;
  name: string;
  kind: "human" | "bot";
  skill: number;
  points: number;
  hp?: number;
  alive?: boolean;
};

type ReactionKind = "nice" | "sealed" | "oops" | "ouch" | "meh" | "quip";
type Reaction = { kind: ReactionKind; text: string; id: number };

const teaCopy: Record<TeaName, { title: string; note: string; label: string }> = {
  green: {
    title: "Quick, quick!",
    note: "First valid word takes the point. No reruns.",
    label: "Your word — fastest paw wins",
  },
  red: {
    title: "Go long.",
    note: "One shot per round. Longest valid word wins, ties go to the early bird.",
    label: "Your one long word",
  },
  yellow: {
    title: "Pile it on.",
    note: "Spaces or commas between words. Repeats only count once.",
    label: "Your one message this round",
  },
  black: {
    title: "Keep it moving.",
    note: "Miss your turn and lose a heart. No word can be used twice.",
    label: "Your word — before it cools",
  },
};

const quips: Record<TeaName, readonly string[]> = {
  green: ["Go go go!", "Fast paws!", "First sip wins!", "Ready, steep, go!"],
  red: ["Think big.", "Longer is stronger.", "Stretch it out!", "Go the distance."],
  yellow: ["Pile 'em in!", "More words, more tea.", "List o'clock!", "Fill the cup!"],
  black: ["Your turn — it's hot!", "Quick, it's scalding!", "Hot paws, hot paws!"],
};

const botColors = ["#8fd3c1", "#c9a7f0", "#ffd36e", "#ff9f8a", "#9cc8ff", "#f7a8d0", "#b8e07a"];
const scarfColors = ["#3f8a83", "#e05d5d", "#5b7bd5", "#e0a63a", "#9b6bd1", "#47a86b", "#d16bb0"];
const tileTilts = [-7, 5, -3, 6, -5];

const backdropLeaves = [
  { left: 6, delay: 0, duration: 17, size: 26 },
  { left: 18, delay: -6, duration: 21, size: 20 },
  { left: 33, delay: -12, duration: 19, size: 16 },
  { left: 52, delay: -3, duration: 23, size: 22 },
  { left: 67, delay: -15, duration: 18, size: 18 },
  { left: 79, delay: -9, duration: 20, size: 28 },
  { left: 91, delay: -1, duration: 22, size: 18 },
];

const confetti = Array.from({ length: 30 }, (_, index) => ({
  left: (index * 37 + 11) % 100,
  delay: (index % 8) * 0.32,
  duration: 3.4 + (index % 5) * 0.55,
  kind: index % 3 === 0 ? "cube" : index % 3 === 1 ? "leaf" : "heart",
  color: ["#ffd166", "#ef4f5f", "#8fd3c1", "#c9a7f0", "#ff9f8a"][index % 5] ?? "#ffd166",
  spin: index % 2 === 0 ? 1 : -1,
}));

function teaTitle(tea: string | null | undefined): string {
  if (!tea) return "Mix";
  return `${tea[0]?.toUpperCase() ?? ""}${tea.slice(1)}`;
}

function splitFragment(word: string, fragment: string | null): [string, string, string] {
  if (!fragment) return [word, "", ""];
  const at = word.toLowerCase().indexOf(fragment.toLowerCase());
  if (at < 0) return [word, "", ""];
  return [
    word.slice(0, at),
    word.slice(at, at + fragment.length),
    word.slice(at + fragment.length),
  ];
}

function Word(props: { word: string; fragment: string | null }) {
  const parts = () => splitFragment(props.word, props.fragment);
  return (
    <span class="brew-word">
      {parts()[0]}
      <Show when={parts()[1]}>
        <mark>{parts()[1]}</mark>
      </Show>
      {parts()[2]}
    </span>
  );
}

function skillLabel(skill: number): string {
  if (skill < 0.3) return "Sleepy";
  if (skill < 0.55) return "Steady";
  if (skill < 0.8) return "Sharp";
  return "Scalding";
}

export function GameScreen(props: GameScreenProps) {
  const timers = new Set<number>();
  const later = (ms: number, run: () => void) => {
    const handle = window.setTimeout(() => {
      timers.delete(handle);
      run();
    }, ms);
    timers.add(handle);
  };
  onCleanup(() => {
    for (const handle of timers) window.clearTimeout(handle);
  });

  /* ---------------------------- game reads ---------------------------- */

  const game = () => props.game;
  const active = () => {
    const current = game();
    return current.mode === "mix" ? current.activeGame : current;
  };
  const tea = (): TeaName | null => {
    const current = game();
    return current.mode === "mix" ? current.currentTea : current.mode;
  };
  const theme = () => {
    const current = game();
    if (current.mode !== "mix") return current.mode;
    return (current.status === "intermission" ? current.upcomingTea : current.currentTea) ?? "mix";
  };
  const intermission = () => game().mode === "mix" && game().status === "intermission";
  const finished = () => game().status === "finished";
  const upcoming = () => {
    const current = game();
    return current.mode === "mix" ? current.upcomingTea : null;
  };
  const players = () => game().players as readonly SeatPlayer[];
  const playerName = (id: string | null | undefined) =>
    players().find((player) => player.id === id)?.name ?? "Nobody";
  const isMe = (id: string | null | undefined) => id === props.selfId;
  const roundNumber = () => {
    const current = game();
    if (current.mode === "black") return current.turnNumber;
    return current.roundNumber;
  };
  const fragment = () => active()?.fragment ?? null;
  const target = (): number | null => {
    const current = game();
    if (current.mode === "black") return null;
    return current.config.pointsToWin;
  };

  const remaining = () => {
    const current = game();
    if (current.mode === "mix") return mixTimeRemainingMs(current, props.clock);
    if (current.mode === "black") return getTimeRemainingMs(current, props.clock);
    return getRoundTimeRemainingMs(current, props.clock);
  };
  const duration = () => {
    const current = game();
    if (current.mode === "mix") {
      if (current.status === "intermission") return current.config.intermissionMs;
      const child = current.activeGame;
      if (!child) return 0;
      return child.mode === "black" ? child.turnDurationMs : child.config.roundTimeMs;
    }
    return current.mode === "black" ? current.turnDurationMs : current.config.roundTimeMs;
  };
  const fraction = () => {
    const total = duration();
    if (!total) return 0;
    const left = remaining() / total;
    // During the Mix intermission the mug refills for the next tea.
    return intermission() ? 1 - left : left;
  };
  const level = () => mugLevelY(finished() ? 0.06 : fraction());
  const playing = () => active()?.status === "playing" && !finished();
  const urgent = () => playing() && remaining() > 0 && remaining() <= 3_000;

  const blackTurn = () => {
    const child = active();
    return child?.mode === "black" && child.status === "playing" ? child.currentPlayerId : null;
  };
  const canSubmit = () => {
    const child = active();
    if (child?.status !== "playing" || finished()) return false;
    if (child.mode === "black") return child.currentPlayerId === props.selfId;
    return child.mode === "green" || !child.submittedPlayerIds.includes(props.selfId);
  };
  const hasSealed = (id: string) => {
    const child = active();
    if (!child || child.mode === "black" || child.mode === "green" || child.status !== "playing")
      return false;
    return child.submittedPlayerIds.includes(id);
  };

  /* ------------------------------ looks ------------------------------- */

  const looks = createMemo(() => {
    const map = new Map<string, { kind: "bot" | "human"; color: string }>();
    let bots = 0;
    let humans = 0;
    for (const player of players()) {
      if (player.kind === "bot") {
        map.set(player.id, { kind: "bot", color: botColors[bots % botColors.length] ?? "#8fd3c1" });
        bots += 1;
      } else if (player.id === props.selfId) {
        map.set(player.id, { kind: "human", color: scarfColors[0] ?? "#3f8a83" });
      } else {
        map.set(player.id, {
          kind: "human",
          color: scarfColors[1 + (humans % (scarfColors.length - 1))] ?? "#e05d5d",
        });
        humans += 1;
      }
    }
    return map;
  });

  /* ---------------------------- reactions ----------------------------- */

  const [reaction, setReaction] = createSignal<Reaction | null>(null);
  let reactionSeq = 0;
  function react(kind: ReactionKind, text: string, ms = 1_700): void {
    reactionSeq += 1;
    const id = reactionSeq;
    setReaction({ kind, text, id });
    later(ms, () => {
      if (reaction()?.id === id) setReaction(null);
    });
  }

  const [seatFx, setSeatFx] = createSignal<
    Record<string, { kind: "score" | "hurt"; amount: number; key: number }>
  >({});
  let fxSeq = 0;
  function flashSeat(id: string, kind: "score" | "hurt", amount: number): void {
    fxSeq += 1;
    const key = fxSeq;
    setSeatFx((current) => ({ ...current, [id]: { kind, amount, key } }));
    later(1_300, () =>
      setSeatFx((current) => {
        if (current[id]?.key !== key) return current;
        const { [id]: _done, ...rest } = current;
        return rest;
      }),
    );
  }

  const [splashes, setSplashes] = createSignal<{ id: number; x: number; color: string }[]>([]);
  let splashSeq = 0;
  function splash(color: string): void {
    splashSeq += 1;
    const id = splashSeq;
    const x = 36 + ((id * 23) % 17);
    setSplashes((current) => [...current, { id, x, color }]);
    later(1_100, () => setSplashes((current) => current.filter((entry) => entry.id !== id)));
  }

  // Points and hearts changing drives seat pops and sugar-cube splashes (works for solo and rooms).
  createEffect(
    on(players, (next, previous) => {
      if (!previous) return;
      const before = new Map(previous.map((player) => [player.id, player]));
      for (const player of next) {
        const old = before.get(player.id);
        if (!old) continue;
        if (player.points > old.points) {
          flashSeat(player.id, "score", player.points - old.points);
          splash(looks().get(player.id)?.color ?? "#fff");
          const currentTea = tea();
          if (currentTea !== "black") {
            if (!isMe(player.id)) react("meh", `${player.name} takes the point.`, 1_300);
            else if (reaction()?.kind !== "nice") react("nice", "That round is yours! +1");
          }
        }
        if (player.hp !== undefined && old.hp !== undefined && player.hp < old.hp) {
          flashSeat(player.id, "hurt", player.hp - old.hp);
        }
      }
    }),
  );

  // Local effects tell us exactly how our own submission landed.
  createEffect(
    on(
      () => props.pulse.seq,
      () => {
        for (const effect of props.pulse.effects) {
          if (effect.type !== "submission-recorded") continue;
          const submission = effect.submission as RoundSubmission;
          if (!isMe(submission.playerId)) continue;
          const currentTea = tea();
          const word = submission.validWords[0];
          if (currentTea === "green") {
            if (word) react("nice", `“${word}” — first to the pot! +1`);
            else react("oops", `“${submission.text}” won't brew. Again!`, 1_300);
          } else if (currentTea === "red") {
            if (word) react("sealed", `Sealed: ${word.length} letters. Paws crossed!`, 2_400);
            else react("oops", `“${submission.text}” didn't count. Sit tight…`, 2_200);
          } else if (currentTea === "yellow") {
            react("sealed", "Message sealed. Scores spill at the bell!", 2_400);
          }
        }
      },
      { defer: true },
    ),
  );

  // Black tea keeps its last verdict in state, which also arrives in room snapshots.
  const blackVerdict = createMemo(() => {
    const child = active();
    if (child?.mode !== "black" || !child.lastFeedback) return null;
    const feedback = child.lastFeedback;
    const word = "word" in feedback ? feedback.word : "";
    return {
      key: `${child.turnNumber}|${feedback.kind}|${feedback.playerId}|${word}|${child.usedWords.length}`,
      feedback,
      word,
    };
  });
  // Memoised so the reaction only fires when the verdict itself changes, not on every game update.
  const verdictKey = createMemo(() => blackVerdict()?.key);
  createEffect(
    on(
      verdictKey,
      () => {
        const verdict = blackVerdict();
        if (!verdict || !isMe(verdict.feedback.playerId)) return;
        const fragmentText = (fragment() ?? "").toUpperCase();
        switch (verdict.feedback.kind) {
          case "valid":
            react("nice", `“${verdict.word}” — cup passed! +1`);
            break;
          case "invalid":
            react("oops", `“${verdict.word}” isn't a ${fragmentText} word.`, 1_400);
            break;
          case "reused":
            react("oops", `“${verdict.word}” was already used!`, 1_400);
            break;
          case "timeout":
            react("ouch", "Too slow! The cup burned a heart.", 1_900);
            break;
          case "eliminated":
            react("ouch", "Out of hearts… sip and watch.", 2_400);
            break;
        }
      },
      { defer: true },
    ),
  );

  // A little quip whenever fresh leaves drop (or the hot cup reaches you).
  const roundKey = createMemo(() => `${theme()}|${roundNumber()}|${fragment() ?? ""}`);
  createEffect(
    on(
      roundKey,
      () => {
        const currentTea = tea();
        if (!currentTea || !playing() || reaction()) return;
        if (currentTea === "black" && blackTurn() !== props.selfId) return;
        const lines = quips[currentTea];
        react("quip", lines[roundNumber() % lines.length] ?? "Go!", 1_300);
      },
      { defer: false },
    ),
  );

  let orderRow: HTMLDivElement | undefined;
  createEffect(
    on(reaction, (current) => {
      if (current?.kind === "oops" && orderRow && !reducedMotion()) {
        orderRow.animate(
          [
            { transform: "translateX(0)" },
            { transform: "translateX(-10px) rotate(-1deg)" },
            { transform: "translateX(9px) rotate(1deg)" },
            { transform: "translateX(-6px)" },
            { transform: "translateX(4px)" },
            { transform: "translateX(0)" },
          ],
          { duration: 420, easing: "ease-out" },
        );
      }
    }),
  );
  const reducedMotion = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const foxMood = (): FoxMood => {
    if (finished()) return isMe(game().winnerId) ? "party" : "sad";
    if (intermission()) return "happy";
    const current = reaction();
    if (current && current.kind !== "quip") {
      if (current.kind === "nice") return "happy";
      if (current.kind === "sealed") return "sealed";
      if (current.kind === "oops") return "oops";
      return "sad";
    }
    if (hasSealed(props.selfId)) return "sealed";
    if (urgent()) return "panic";
    if (playing() && fraction() < 0.45) return "worried";
    return "calm";
  };
  const bubbleText = () => {
    if (finished()) return isMe(game().winnerId) ? "We did it! Tea's on me." : "Next pot is ours.";
    if (intermission()) return `Ooh, ${teaTitle(upcoming())} next!`;
    return reaction()?.text ?? null;
  };

  /* ------------------------------ seats ------------------------------- */

  const seatMood = (player: SeatPlayer): BotMood => {
    if (player.alive === false) return "out";
    const fx = seatFx()[player.id];
    if (fx?.kind === "hurt") return "hurt";
    if (fx?.kind === "score") return "happy";
    if (blackTurn() === player.id) return "thinking";
    return "idle";
  };
  const foxSeatMood = (mood: BotMood): FoxMood =>
    mood === "out"
      ? "sad"
      : mood === "hurt"
        ? "oops"
        : mood === "happy"
          ? "happy"
          : mood === "thinking"
            ? "worried"
            : "calm";
  const heat = () => Math.max(0, Math.min(1, 1 - fraction()));
  const maxHp = createMemo(() => {
    const current = game();
    if (current.mode === "mix") return current.config.baseHp;
    if (current.mode === "black") return current.config.initialHp;
    return 0;
  });

  /* ------------------------------ text -------------------------------- */

  const headingTitle = () => {
    const current = game();
    if (finished())
      return isMe(current.winnerId) ? "You win the pot!" : `${playerName(current.winnerId)} wins.`;
    if (intermission()) return `Next up: ${teaTitle(upcoming())} tea`;
    const currentTea = tea();
    if (!currentTea) return "Brewing…";
    const turn = blackTurn();
    if (currentTea === "black" && turn)
      return isMe(turn) ? "Your turn — it's hot!" : `${playerName(turn)} has the cup…`;
    return teaCopy[currentTea].title;
  };
  const tileKey = () => {
    if (finished()) return `end:GG`;
    if (intermission()) return null;
    const current = fragment();
    return current ? `${roundNumber()}:${current.toUpperCase()}` : null;
  };
  const tagLabel = () => {
    if (finished()) return "fin";
    return (remaining() / 1_000).toFixed(1);
  };
  const subline = () => {
    const current = game();
    if (finished()) return `${current.mode === "mix" ? "Mix" : teaTitle(current.mode)} Tea`;
    const teaName = intermission()
      ? "Mix"
      : `${current.mode === "mix" ? "Mix · " : ""}${teaTitle(tea())} Tea`;
    const round = `${current.mode === "black" ? "Turn" : "Round"} ${roundNumber()}`;
    return `${teaName} · ${round} · ${targetText()}`;
  };
  const targetText = () => {
    const goal = target();
    return goal === null ? "last one standing wins" : `first to ${goal}`;
  };
  const rankedPlayers = createMemo(() => {
    const winnerId = game().winnerId;
    return [...players()].sort((a, b) => {
      if (a.id === winnerId) return -1;
      if (b.id === winnerId) return 1;
      if ((a.alive ?? true) !== (b.alive ?? true)) return a.alive === false ? 1 : -1;
      return b.points - a.points || (b.hp ?? 0) - (a.hp ?? 0);
    });
  });

  /* --------------------------- input hints ---------------------------- */

  const entryWords = () =>
    props.entry
      .split(/[\s,]+/)
      .map((word) => word.trim())
      .filter(Boolean);
  const hints = () => {
    const list: { text: string; good?: boolean }[] = [];
    const frag = fragment();
    const currentTea = tea();
    if (!playing() || !currentTea) return list;
    if (!canSubmit()) {
      if (currentTea === "black") {
        const turn = blackTurn();
        list.push({ text: `Waiting for ${playerName(turn)}…` });
      } else if (hasSealed(props.selfId)) {
        list.push({ text: "✉ Sealed until the bell" });
      }
      return list;
    }
    const typed = props.entry.trim();
    if (!typed) {
      list.push({ text: "Press Enter to steep" });
      return list;
    }
    if (currentTea === "yellow") {
      const words = entryWords();
      const matching = frag ? words.filter((word) => word.toLowerCase().includes(frag)).length : 0;
      list.push({ text: `${words.length} ${words.length === 1 ? "word" : "words"}` });
      if (frag)
        list.push({
          text: `${matching} with ${frag.toUpperCase()}`,
          good: matching > 0 && matching === words.length,
        });
    } else {
      if (frag) {
        const has = typed.toLowerCase().includes(frag);
        list.push({
          text: has ? `✓ has ${frag.toUpperCase()}` : `needs ${frag.toUpperCase()}`,
          good: has,
        });
      }
      if (currentTea === "red") list.push({ text: `${typed.length} letters` });
    }
    return list;
  };
  const placeholder = () => {
    if (finished()) return "That's the last sip.";
    if (intermission()) return "The kettle's whistling…";
    if (canSubmit()) return tea() === "yellow" ? "word, word, word…" : "type a word…";
    if (tea() === "black") return "Wait for the hot cup…";
    return "Sealed — wait for the bell";
  };

  /* --------------------------- tea leaves ----------------------------- */

  const leafReading = createMemo(() => {
    const current = game();
    if (current.mode === "mix") {
      const last = current.roundResults.at(-1);
      if (!last) return null;
      return {
        key: `mix-${last.round}`,
        title: last.winnerId
          ? isMe(last.winnerId)
            ? `You take the ${last.tea} round!`
            : `${playerName(last.winnerId)} takes the ${last.tea} round.`
          : last.tea === "black"
            ? "The hot cup went cold. No points."
            : `Nobody won the ${last.tea} round.`,
        tea: last.tea as string,
        fragment: null as string | null,
        submissions: [] as readonly RoundResult["submissions"][number][],
        deltas: Object.entries(last.deltas).filter(
          ([, delta]) => delta.points !== 0 || delta.hp !== 0,
        ),
      };
    }
    if (current.mode === "black") {
      const last = current.lastRoundResult;
      if (!last) return null;
      const feedback = current.lastFeedback;
      const cold =
        feedback && (feedback.kind === "timeout" || feedback.kind === "eliminated")
          ? feedback.kind === "eliminated"
            ? `${isMe(feedback.playerId) ? "You're" : `${playerName(feedback.playerId)} is`} out of hearts!`
            : `${isMe(feedback.playerId) ? "You" : playerName(feedback.playerId)} let the cup go cold.`
          : "The cup went cold.";
      return {
        key: `black-${last.round}-${last.winnerId ?? "none"}`,
        title: last.winnerId
          ? `${isMe(last.winnerId) ? "You" : playerName(last.winnerId)} passed the cup.`
          : cold,
        tea: "black",
        fragment: last.fragment,
        submissions: last.submissions as readonly RoundResult["submissions"][number][],
        deltas: [] as [string, { points: number; hp: number }][],
      };
    }
    const last = current.roundResults.at(-1);
    if (!last) return null;
    return {
      key: `${current.mode}-${last.round}`,
      title: last.winnerId
        ? isMe(last.winnerId)
          ? "You take the point!"
          : `${playerName(last.winnerId)} takes the point.`
        : "Nobody brewed a point.",
      tea: current.mode as string,
      fragment: last.fragment,
      submissions: [...last.submissions].sort((a, b) => b.score - a.score),
      deltas: [] as [string, { points: number; hp: number }][],
    };
  });

  /* ------------------------------ overlay ----------------------------- */

  const [overDismissed, setOverDismissed] = createSignal(false);
  createEffect(
    on(finished, (isFinished) => {
      if (!isFinished) setOverDismissed(false);
    }),
  );
  const podium = () => {
    const ranked = rankedPlayers();
    return [
      { player: ranked[1], place: 2 },
      { player: ranked[0], place: 1 },
      { player: ranked[2], place: 3 },
    ].filter((entry): entry is { player: SeatPlayer; place: number } => Boolean(entry.player));
  };

  function Avatar(avatarProps: { player: SeatPlayer; mood: BotMood }) {
    const look = () => looks().get(avatarProps.player.id);
    return (
      <Show
        when={look()?.kind === "bot"}
        fallback={
          <FoxAvatar mood={foxSeatMood(avatarProps.mood)} scarf={look()?.color ?? "#3f8a83"} />
        }
      >
        <TeapotBot color={look()?.color ?? "#8fd3c1"} mood={avatarProps.mood} />
      </Show>
    );
  }

  return (
    <div
      class="brew"
      data-tea={theme()}
      classList={{ "brew-urgent": urgent(), "brew-finished": finished() }}
    >
      <div class="brew-backdrop" aria-hidden="true">
        <For each={backdropLeaves}>
          {(leaf) => (
            <span
              class="brew-fall"
              style={{
                left: `${leaf.left}%`,
                width: `${leaf.size}px`,
                "animation-delay": `${leaf.delay}s`,
                "animation-duration": `${leaf.duration}s`,
              }}
            >
              <Leaf color="var(--leaf)" />
            </span>
          )}
        </For>
      </div>

      <header class="brew-top">
        <div class="brew-brand">
          <span class="brew-mark" aria-hidden="true">
            ✳
          </span>
          <span>Redtea</span>
        </div>
        <div class="brew-top-actions">
          <Show when={props.connectionState !== "connected"}>
            <span class="brew-pill brew-pill-warn" role="status">
              Reconnecting…
            </span>
          </Show>
          <Show when={props.room}>
            <span class="brew-room">Room {props.room?.room.code}</span>
          </Show>
          <button class="brew-leave" type="button" onClick={() => props.onLeave()}>
            <span aria-hidden="true">✕</span> Leave table
          </button>
        </div>
      </header>

      <main class="brew-main">
        <section class="brew-stage-col" aria-label={`${teaTitle(tea())} tea round`}>
          <div class="brew-heading">
            <h2>{headingTitle()}</h2>
            <p class="brew-subline">{subline()}</p>
          </div>

          <div class="brew-stage">
            <div
              class="sr-only"
              role="progressbar"
              aria-label="Time left"
              aria-valuemin="0"
              aria-valuemax={duration()}
              aria-valuenow={Math.round(remaining())}
            />
            <MugBack level={level()} boiling={urgent()} />
            <span
              class="brew-clock"
              classList={{ "brew-clock-urgent": urgent() }}
              aria-hidden="true"
            >
              {tagLabel()}
              <small>s</small>
            </span>
            <div
              class="brew-tiles"
              style={{
                top: `${(level() / MUG.height) * 100}%`,
                left: `${(MUG.cx / MUG.width) * 100}%`,
              }}
              role="status"
              aria-live="polite"
              aria-label={
                fragment() ? `Find a word containing ${fragment()?.toUpperCase()}` : "No fragment"
              }
            >
              <Show when={tileKey()} keyed>
                {(key) => (
                  <For each={(key.split(":")[1] ?? "").split("")}>
                    {(letter, index) => (
                      <span
                        class="brew-tile"
                        style={{
                          "--i": index(),
                          "--tilt": `${tileTilts[index() % tileTilts.length] ?? 0}deg`,
                        }}
                      >
                        <span class="brew-tile-face">{letter}</span>
                      </span>
                    )}
                  </For>
                )}
              </Show>
            </div>
            <MugFront
              level={level()}
              label={tagLabel()}
              tea={(intermission() ? upcoming() : tea()) ?? "mix"}
              urgent={urgent()}
            />
            <svg class="mug-layer fox-layer" viewBox="0 0 660 470" aria-hidden="true">
              <g transform="translate(478 214) scale(0.9)">
                <Fox mood={foxMood()} />
              </g>
            </svg>
            <Show when={bubbleText()} keyed>
              {(text) => (
                <div
                  class="brew-bubble"
                  classList={{
                    "brew-bubble-good": reaction()?.kind === "nice" || finished(),
                    "brew-bubble-bad": reaction()?.kind === "oops" || reaction()?.kind === "ouch",
                  }}
                  aria-hidden="true"
                >
                  {text}
                </div>
              )}
            </Show>
            <For each={splashes()}>
              {(drop) => (
                <div
                  class="brew-splash"
                  style={{ left: `${drop.x}%`, top: `${(level() / MUG.height) * 100}%` }}
                  aria-hidden="true"
                >
                  <span class="brew-splash-cube">
                    <SugarCube full />
                  </span>
                  <span class="brew-splash-ring" style={{ "border-color": drop.color }} />
                  <span class="brew-splash-drop d1" />
                  <span class="brew-splash-drop d2" />
                  <span class="brew-splash-drop d3" />
                </div>
              )}
            </For>
            <Show when={intermission()}>
              <div class="brew-wheel" aria-hidden="true">
                <TeaWheel tea={upcoming()} />
              </div>
            </Show>
            <Show when={tea() && !intermission() && !finished()}>
              <aside class="brew-note" aria-label="House rule">
                <strong>House rule</strong>
                {teaCopy[tea() ?? "red"].note}
              </aside>
            </Show>
          </div>

          <form
            class="brew-order"
            classList={{ "brew-order-locked": !canSubmit() }}
            onSubmit={(event) => props.onSubmit(event)}
          >
            <label class="brew-order-label" for="word-entry">
              {teaCopy[(intermission() ? upcoming() : tea()) ?? "red"].label}
            </label>
            <div class="brew-order-row" ref={orderRow}>
              <Show
                when={tea() === "yellow"}
                fallback={
                  <input
                    ref={(element) => props.inputRef(element)}
                    id="word-entry"
                    type="text"
                    autocomplete="off"
                    autocapitalize="none"
                    spellcheck={false}
                    placeholder={placeholder()}
                    value={props.entry}
                    onInput={(event) => props.onEntry(event.currentTarget.value)}
                    readonly={!canSubmit()}
                  />
                }
              >
                <textarea
                  ref={(element) => props.inputRef(element)}
                  id="word-entry"
                  rows="2"
                  autocomplete="off"
                  autocapitalize="none"
                  spellcheck={false}
                  placeholder={placeholder()}
                  value={props.entry}
                  onInput={(event) => props.onEntry(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  readonly={!canSubmit()}
                />
              </Show>
              <button class="brew-steep" type="submit" disabled={!canSubmit()}>
                Steep <span aria-hidden="true">↵</span>
              </button>
            </div>
            <div class="brew-hints">
              <For each={hints()}>
                {(hint) => (
                  <span class="brew-hint" classList={{ "brew-hint-good": hint.good === true }}>
                    {hint.text}
                  </span>
                )}
              </For>
              <Show when={props.notice}>
                <span class="brew-hint brew-hint-warn" role="alert">
                  {props.notice}
                </span>
              </Show>
              <span class="sr-only" aria-live="polite">
                {reaction()?.kind === "quip" ? "" : (reaction()?.text ?? "")}
              </span>
            </div>
          </form>
        </section>

        <aside class="brew-side">
          <section class="brew-card brew-bench" aria-label="Scoreboard">
            <div class="brew-card-head">
              <h3>The bench</h3>
            </div>
            <ul class="brew-seats">
              <For each={players()}>
                {(player) => {
                  const mood = () => seatMood(player);
                  const fx = () => seatFx()[player.id];
                  return (
                    <li
                      class="brew-seat"
                      classList={{
                        "brew-seat-hot": blackTurn() === player.id,
                        "brew-seat-out": player.alive === false,
                        "brew-seat-me": isMe(player.id),
                        "brew-seat-hurt": fx()?.kind === "hurt",
                        "brew-seat-scored": fx()?.kind === "score",
                      }}
                      style={{ "--heat": blackTurn() === player.id ? heat() : 0 }}
                    >
                      <span class="brew-seat-avatar">
                        <Avatar player={player} mood={mood()} />
                        <Show when={blackTurn() === player.id}>
                          <span class="brew-seat-cup">
                            <HotCup />
                          </span>
                        </Show>
                      </span>
                      <span class="brew-seat-name">
                        <strong>
                          {player.name}
                          <Show when={isMe(player.id)}>
                            <em class="brew-you">you</em>
                          </Show>
                        </strong>
                        <small>
                          <Show
                            when={player.kind === "bot"}
                            fallback={
                              props.room?.players.find((entry) => entry.id === player.id)
                                ?.connected === false
                                ? "Stepped out"
                                : "Fox"
                            }
                          >
                            Teapot · {skillLabel(player.skill)}
                          </Show>
                          <Show when={hasSealed(player.id)}>
                            <span class="brew-sealed-badge">✉ sealed</span>
                          </Show>
                        </small>
                        <Show when={player.hp !== undefined && maxHp() > 0}>
                          <span class="brew-hearts" role="img" aria-label={`${player.hp} hearts`}>
                            <For each={Array.from({ length: maxHp() }, (_, i) => i)}>
                              {(slot) => <Heart full={slot < (player.hp ?? 0)} />}
                            </For>
                          </span>
                        </Show>
                      </span>
                      <span
                        class="brew-seat-score"
                        role="img"
                        aria-label={`${player.points} points`}
                      >
                        <Show
                          when={(target() ?? 99) <= 8}
                          fallback={
                            <span class="brew-score-num">
                              {player.points}
                              <small>{target() === null ? " words" : ` / ${target()}`}</small>
                            </span>
                          }
                        >
                          <span class="brew-cubes">
                            <For each={Array.from({ length: target() ?? 0 }, (_, i) => i)}>
                              {(slot) => <SugarCube full={slot < player.points} />}
                            </For>
                          </span>
                        </Show>
                      </span>
                      <Show when={fx()} keyed>
                        {(effect) => (
                          <span
                            class="brew-seat-pop"
                            classList={{ "brew-seat-pop-bad": effect.kind === "hurt" }}
                            aria-hidden="true"
                          >
                            {effect.kind === "hurt" ? "−1 ♥" : `+${effect.amount}`}
                          </span>
                        )}
                      </Show>
                    </li>
                  );
                }}
              </For>
            </ul>
          </section>

          <section class="brew-card brew-leaves" aria-live="polite" aria-label="Last round">
            <div class="brew-card-head">
              <h3>The leaves say…</h3>
            </div>
            <Show
              when={leafReading()}
              keyed
              fallback={<p class="brew-muted">No leaves to read yet. Brew a round!</p>}
            >
              {(reading) => (
                <div class="brew-reading">
                  <p class="brew-reading-title">{reading.title}</p>
                  <Show when={reading.submissions.length}>
                    <ul class="brew-reading-list">
                      <For each={reading.submissions}>
                        {(submission) => (
                          <li classList={{ "brew-reading-none": submission.score === 0 }}>
                            <strong>
                              {isMe(submission.playerId) ? "You" : playerName(submission.playerId)}
                            </strong>
                            <span>
                              <Show
                                when={submission.validWords.length}
                                fallback={<s>{submission.text || "nothing"}</s>}
                              >
                                <For each={submission.validWords}>
                                  {(word) => <Word word={word} fragment={reading.fragment} />}
                                </For>
                              </Show>
                            </span>
                            <small>
                              {reading.tea === "red"
                                ? `${submission.validWords[0]?.length ?? 0} letters`
                                : reading.tea === "yellow"
                                  ? `${submission.score} ${submission.score === 1 ? "word" : "words"}`
                                  : submission.score
                                    ? "✓"
                                    : "✗"}
                            </small>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                  <Show when={reading.deltas.length}>
                    <div class="brew-deltas">
                      <For each={reading.deltas}>
                        {([id, delta]) => (
                          <span class="brew-delta">
                            {isMe(id) ? "You" : playerName(id)}
                            <Show when={delta.points}>
                              <b>{delta.points > 0 ? `+${delta.points}` : delta.points}</b>
                            </Show>
                            <Show when={delta.hp}>
                              <b class="brew-delta-bad">{delta.hp} ♥</b>
                            </Show>
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </Show>
          </section>
        </aside>
      </main>

      <Show when={finished() && overDismissed()}>
        <button class="brew-results-fab" type="button" onClick={() => setOverDismissed(false)}>
          ✦ Results
        </button>
      </Show>

      <Show when={finished() && !overDismissed()}>
        <div class="brew-over" role="dialog" aria-modal="true" aria-labelledby="brew-over-title">
          <div class="brew-confetti" aria-hidden="true">
            <For each={confetti}>
              {(piece) => (
                <span
                  class={`brew-confetto brew-confetto-${piece.kind}`}
                  style={{
                    left: `${piece.left}%`,
                    "animation-delay": `${piece.delay}s`,
                    "animation-duration": `${piece.duration}s`,
                    "--spin": piece.spin,
                    "--color": piece.color,
                  }}
                >
                  <Show
                    when={piece.kind === "cube"}
                    fallback={
                      <Show when={piece.kind === "leaf"} fallback={<Heart full />}>
                        <Leaf color={piece.color} />
                      </Show>
                    }
                  >
                    <SugarCube full />
                  </Show>
                </span>
              )}
            </For>
          </div>
          <div class="brew-over-card">
            <p class="brew-over-tea">{game().mode === "mix" ? "Mix" : teaTitle(game().mode)} Tea</p>
            <h2 id="brew-over-title">
              {isMe(game().winnerId)
                ? "You win the pot!"
                : `${playerName(game().winnerId)} wins the pot!`}
            </h2>
            <div class="brew-podium">
              <For each={podium()}>
                {(entry) => (
                  <div class={`brew-podium-spot brew-place-${entry.place}`}>
                    <span class="brew-podium-avatar">
                      <Show when={entry.place === 1}>
                        <svg class="brew-crown" viewBox="0 0 40 26" aria-hidden="true">
                          <path
                            d="M3 23 L6 6 L14 15 L20 3 L26 15 L34 6 L37 23 Z"
                            fill="#ffd166"
                            stroke="#4a2a24"
                            stroke-width="2.5"
                            stroke-linejoin="round"
                          />
                          <circle cx="20" cy="17" r="2.6" fill="#ef4f5f" />
                        </svg>
                      </Show>
                      <Avatar
                        player={entry.player}
                        mood={
                          entry.place === 1
                            ? "happy"
                            : entry.player.alive === false
                              ? "out"
                              : "idle"
                        }
                      />
                    </span>
                    <strong>{isMe(entry.player.id) ? "You" : entry.player.name}</strong>
                    <small>
                      {entry.player.points} {game().mode === "black" ? "words" : "pts"}
                    </small>
                    <span class="brew-podium-block">{entry.place}</span>
                  </div>
                )}
              </For>
            </div>
            <Show when={rankedPlayers().length > 3}>
              <ol class="brew-over-rest" start="4">
                <For each={rankedPlayers().slice(3)}>
                  {(player) => (
                    <li>
                      {isMe(player.id) ? "You" : player.name} · {player.points}
                    </li>
                  )}
                </For>
              </ol>
            </Show>
            <div class="brew-over-actions">
              <Show when={props.onPlayAgain}>
                {(brewAgain) => (
                  <button
                    class="brew-btn brew-btn-primary"
                    type="button"
                    onClick={() => brewAgain()()}
                  >
                    Brew again <span aria-hidden="true">↻</span>
                  </button>
                )}
              </Show>
              <button class="brew-btn" type="button" onClick={() => props.onLeave()}>
                Back to setup
              </button>
              <button class="brew-link" type="button" onClick={() => setOverDismissed(true)}>
                Peek at the table
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
