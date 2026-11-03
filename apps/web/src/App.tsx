import type {
  BlackPlayerState,
  GamePlayer,
  MixConfig,
  RoundModeEffect,
  RoundResult,
  RoundSubmission,
} from "@redtea/engine";
import {
  defaultBlackConfig,
  defaultGreenConfig,
  defaultMixConfig,
  defaultRedConfig,
  defaultYellowConfig,
  getRoundTimeRemainingMs,
  getTimeRemainingMs,
  mixTimeRemainingMs,
} from "@redtea/engine";
import { clientMessageSchema } from "@redtea/protocol";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import blackTeaFox from "./assets/black-tea-fox.svg";
import nervousFoxPortrait from "./assets/fox-face-portrait-nervous.svg";
import foxFacePortrait from "./assets/fox-face-portrait-static.svg";
import scaredFoxPortrait from "./assets/fox-face-portrait-scared.svg";
import greenTeaFox from "./assets/green-tea-fox.svg";
import mixTeaFox from "./assets/mix-tea-fox.svg";
import redTeaFox from "./assets/red-tea-fox.svg";
import yellowTeaFox from "./assets/yellow-tea-fox.svg";
import {
  type AnyGameState,
  type GameConnection,
  type GameMode,
  LocalConnection,
  RemoteConnection,
  type RoomView,
} from "./connection";
import { loadWordCatalog } from "./gameData";
import "./styles.css";

type TeaMode = GameMode;
const teaAnimations: Partial<Record<TeaMode, string>> = {
  black: blackTeaFox,
  green: greenTeaFox,
  mix: mixTeaFox,
  red: redTeaFox,
  yellow: yellowTeaFox,
};

type UiModeConfig = {
  botCount: number;
  botSkill: number;
  pointsToWin: number;
  roundTimeMs: number;
  allowWordReuse: boolean;
  ignoreInvalidWords: boolean;
  mixConfig?: MixConfig;
};
type SubmissionFeedItem = {
  id: number;
  playerId: string;
  text: string;
  validWords: readonly string[];
  invalidWords: readonly string[];
  round: number;
  at: number;
};

const teaModes: { id: TeaMode; label: string; title: string; desc: string; glyph: string }[] = [
  {
    id: "mix",
    label: "Mix",
    title: "Let the kettle decide",
    desc: "A different tea challenge can arrive each round.",
    glyph: "✳",
  },
  {
    id: "black",
    label: "Black",
    title: "Keep it moving",
    desc: "Take turns before the timer runs out.",
    glyph: "♟",
  },
  {
    id: "green",
    label: "Green",
    title: "Race the clock",
    desc: "Be first with a valid word.",
    glyph: "↗",
  },
  {
    id: "red",
    label: "Red",
    title: "Find the longest",
    desc: "Longest valid word takes the point.",
    glyph: "↕",
  },
  {
    id: "yellow",
    label: "Yellow",
    title: "Make a list",
    desc: "One message. More valid words wins.",
    glyph: "≋",
  },
];

const teaHowItWorks: Record<
  TeaMode,
  { eyebrow: string; heading: string; body: string; rule: string }
> = {
  red: {
    eyebrow: "Longest word wins",
    heading: "Find the longest word.",
    body: "A fragment appears. Type a valid word that contains it before the timer runs out. The longest answer at the end of the round takes the point.",
    rule: "Ties go to the earliest submission.",
  },
  black: {
    eyebrow: "Take turns",
    heading: "Keep the word moving.",
    body: "The turn passes around the table. Submit a word that contains the fragment before the timer expires, or lose a heart. Miss twice and you are out.",
    rule: "No word can be used twice.",
  },
  green: {
    eyebrow: "Race the clock",
    heading: "Be first with a valid word.",
    body: "Everyone sees the same fragment. The first player to send a valid answer wins the round, so trust your instincts and type fast.",
    rule: "The first valid answer takes the point.",
  },
  yellow: {
    eyebrow: "Make a list",
    heading: "Pack one message with words.",
    body: "Send one message containing as many valid words as you can find. When the round closes, every word is checked and the best list wins.",
    rule: "Repeated words only count once.",
  },
  mix: {
    eyebrow: "Let the kettle decide",
    heading: "A new tea every round.",
    body: "Mix pulls from the other tea modes as you play. The rules, pace, and kind of challenge can change between rounds.",
    rule: "At least two players are needed for Mix.",
  },
};

function makePlayers(botCount: number, skill: number): GamePlayer[] {
  return [
    { id: "you", name: "You", kind: "human", skill: 1 },
    ...Array.from({ length: botCount }, (_, index) => ({
      id: `bot-${index + 1}`,
      name: `Tea bot ${index + 1}`,
      kind: "bot" as const,
      skill,
    })),
  ];
}

function initialUiConfigs(): Record<TeaMode, UiModeConfig> {
  return {
    black: {
      botCount: 2,
      botSkill: 0.65,
      pointsToWin: 0,
      roundTimeMs: defaultBlackConfig.initialTurnMs,
      allowWordReuse: false,
      ignoreInvalidWords: true,
    },
    green: {
      botCount: defaultGreenConfig.botCount,
      botSkill: 0.65,
      pointsToWin: defaultGreenConfig.pointsToWin,
      roundTimeMs: defaultGreenConfig.roundTimeMs,
      allowWordReuse: false,
      ignoreInvalidWords: true,
    },
    red: {
      botCount: defaultRedConfig.botCount,
      botSkill: 0.65,
      pointsToWin: defaultRedConfig.pointsToWin,
      roundTimeMs: defaultRedConfig.roundTimeMs,
      allowWordReuse: defaultRedConfig.allowWordReuse,
      ignoreInvalidWords: true,
    },
    yellow: {
      botCount: defaultYellowConfig.botCount,
      botSkill: 0.65,
      pointsToWin: defaultYellowConfig.pointsToWin,
      roundTimeMs: defaultYellowConfig.roundTimeMs,
      allowWordReuse: defaultYellowConfig.allowWordReuse,
      ignoreInvalidWords: defaultYellowConfig.ignoreInvalidWords,
    },
    mix: {
      botCount: 2,
      botSkill: 0.65,
      pointsToWin: defaultMixConfig.pointsToWin,
      roundTimeMs: defaultMixConfig.roundTimeMs,
      allowWordReuse: false,
      ignoreInvalidWords: defaultMixConfig.ignoreInvalidWords,
      mixConfig: { ...defaultMixConfig },
    },
  };
}

function roundResult(state: AnyGameState | null): RoundResult | null {
  if (!state) return null;
  if (state.mode === "black") return state.lastRoundResult as RoundResult | null;
  if (state.mode === "mix") return null;
  return state.roundResults.at(-1) ?? null;
}

function roundNumber(state: AnyGameState | null): number {
  if (!state) return 0;
  if (state.mode === "mix") return state.roundNumber;
  return state.mode === "black" ? state.turnNumber : state.roundNumber;
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1_000).toFixed(1);
}

export function App() {
  const [mode, setMode] = createSignal<TeaMode>("red");
  const [showModeIntro, setShowModeIntro] = createSignal(true);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [configs, setConfigs] = createSignal(initialUiConfigs());
  const [game, setGame] = createSignal<AnyGameState | null>(null);
  const [connection, setConnection] = createSignal<GameConnection>(new LocalConnection());
  const [room, setRoom] = createSignal<RoomView | undefined>();
  const [connectionState, setConnectionState] = createSignal<
    "connected" | "reconnecting" | "disconnected"
  >("connected");
  const [name, setName] = createSignal("Player");
  const [roomCodeEntry, setRoomCodeEntry] = createSignal("");
  const [lobbyError, setLobbyError] = createSignal("");
  const [entry, setEntry] = createSignal("");
  const [clock, setClock] = createSignal(0);
  const [feed, setFeed] = createSignal<SubmissionFeedItem[]>([]);
  const [, setLoadError] = createSignal("");
  const [wordCatalog, setWordCatalog] = createSignal<Awaited<
    ReturnType<typeof loadWordCatalog>
  > | null>(null);
  let inputRef: HTMLInputElement | HTMLTextAreaElement | undefined;
  let unsubscribeActive = () => {};

  const config = () => configs()[mode()];
  const botAbilityFox = () => {
    const skill = config().botSkill;
    if (skill >= 0.75) return scaredFoxPortrait;
    if (skill >= 0.4) return nervousFoxPortrait;
    return foxFacePortrait;
  };

  function updateConfig<K extends keyof UiModeConfig>(key: K, value: UiModeConfig[K]): void {
    setConfigs((current) => ({ ...current, [mode()]: { ...current[mode()], [key]: value } }));
  }

  function updateRoundTime(secondsValue: number): void {
    const seconds = Number.isFinite(secondsValue) ? Math.min(120, Math.max(1, secondsValue)) : 1;
    const milliseconds = Math.max(mode() === "black" ? 5_000 : 1_000, seconds * 1_000);
    if (mode() === "mix") changeMixSetting("roundTimeMs", milliseconds);
    else updateConfig("roundTimeMs", milliseconds);
  }

  function updatePointsTarget(pointsValue: number): void {
    const points = Math.min(99, Math.max(1, Number(pointsValue) || 1));
    if (mode() === "mix") changeMixSetting("pointsToWin", points);
    else updateConfig("pointsToWin", points);
  }

  function recordEffects(
    effects: readonly (RoundModeEffect | { type: string; [key: string]: unknown })[],
  ): void {
    const current = game();
    if (!current) return;
    const items: SubmissionFeedItem[] = [];
    for (const effect of effects) {
      if (effect.type === "submission-recorded") {
        const submission = effect.submission as RoundSubmission;
        items.push({
          id: performance.now() + items.length,
          playerId: submission.playerId,
          text: submission.text,
          validWords: submission.validWords,
          invalidWords: submission.invalidWords,
          round: Number(effect.round),
          at: Number(submission.submittedAt),
        });
      } else if (effect.type === "word-accepted") {
        items.push({
          id: performance.now() + items.length,
          playerId: String(effect.playerId),
          text: String(effect.word),
          validWords: [String(effect.word)],
          invalidWords: [],
          round:
            current.mode === "black"
              ? (current.lastRoundResult?.round ?? current.turnNumber)
              : current.roundNumber,
          at: clock(),
        });
      }
    }
    if (items.length) setFeed((currentFeed) => [...items, ...currentFeed].slice(0, 40));
  }

  function subscribeConnection(active: GameConnection): void {
    unsubscribeActive();
    unsubscribeActive = active.subscribe((update) => {
      setClock(update.now);
      setGame(update.game);
      setRoom(update.room);
      if (update.room) setShowModeIntro(false);
      setLobbyError(update.error ?? "");
      setConnectionState(update.connectionState);
      if (update.effects.length) recordEffects(update.effects);
    });
  }

  function activateRemote(
    resume?: ConstructorParameters<typeof RemoteConnection>[0],
  ): RemoteConnection {
    unsubscribeActive();
    const remote = new RemoteConnection(resume);
    connection().close();
    setConnection(remote);
    subscribeConnection(remote);
    return remote;
  }

  function startRoomConnection(create: boolean): void {
    setLobbyError("");
    const remote = activateRemote();
    if (create) remote.createRoom(name());
    else remote.joinRoom(roomCodeEntry(), name());
  }

  function configureRoom(selected: TeaMode): void {
    const settings = configs()[selected];
    connection().configureRoom(
      selected,
      selectedEngineConfig(selected, settings),
      settings.botCount,
    );
  }

  function changeRoomSetting<K extends keyof UiModeConfig>(
    selected: TeaMode,
    key: K,
    value: UiModeConfig[K],
  ): void {
    const settings = { ...configs()[selected], [key]: value };
    setConfigs((current) => ({ ...current, [selected]: settings }));
    connection().configureRoom(
      selected,
      selectedEngineConfig(selected, settings),
      settings.botCount,
    );
  }

  function changeMixSetting<K extends keyof MixConfig>(key: K, value: MixConfig[K]): void {
    const current = configs().mix;
    const settings = {
      ...current,
      mixConfig: { ...(current.mixConfig ?? defaultMixConfig), [key]: value },
    };
    setConfigs((all) => ({ ...all, mix: settings }));
    connection().configureRoom("mix", selectedEngineConfig("mix", settings), settings.botCount);
  }

  function leaveRoom(): void {
    connection().close();
    const local = new LocalConnection();
    setConnection(local);
    setRoom(undefined);
    setGame(null);
    setFeed([]);
    local.subscribe((update) => {
      setClock(update.now);
      setGame(update.game);
    });
  }

  function backToSetup(): void {
    if (room()) leaveRoom();
    else setGame(null);
  }

  function selectedEngineConfig(
    selected: TeaMode,
    settings: UiModeConfig,
  ): Record<string, number | boolean> {
    if (selected === "black") return { initialTurnMs: settings.roundTimeMs };
    if (selected === "mix") return { ...(settings.mixConfig ?? defaultMixConfig) };
    const shared = {
      botCount: settings.botCount,
      pointsToWin: settings.pointsToWin,
      roundTimeMs: settings.roundTimeMs,
    };
    if (selected === "green") return shared;
    if (selected === "red") return { ...shared, allowWordReuse: settings.allowWordReuse };
    return {
      ...shared,
      allowWordReuse: settings.allowWordReuse,
      ignoreInvalidWords: settings.ignoreInvalidWords,
    };
  }

  function startGame(): void {
    const catalog = wordCatalog();
    if (!catalog) return;
    setSettingsOpen(false);
    const selected = mode();
    const settings = configs()[selected];
    if (
      selected === "mix" &&
      !["black", "green", "red", "yellow"].some(
        (tea) => settings.mixConfig?.[`${tea}Enabled` as keyof MixConfig],
      )
    ) {
      setLobbyError("Keep at least one tea enabled to start Mix.");
      return;
    }
    const players = makePlayers(settings.botCount, settings.botSkill);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
    connection().start({
      mode: selected,
      players,
      catalog,
      seed,
      config: selectedEngineConfig(selected, settings),
    });
    setEntry("");
    setFeed([]);
    requestAnimationFrame(() => inputRef?.focus());
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    const current = game();
    if (current?.status !== "playing") return;
    const text = entry().trim();
    if (!text) return;
    if (connectionState() !== "connected") {
      setLobbyError("Reconnecting… your draft is still here. Submit it when you’re back online.");
      return;
    }
    setEntry("");
    const selectedMode = current.mode === "mix" ? (current.currentTea ?? "green") : current.mode;
    const active = activeGame();
    if (active?.mode !== "black" || active.currentPlayerId === connection().playerId())
      connection().submit(selectedMode, text);
    requestAnimationFrame(() => inputRef?.focus());
  }

  onMount(() => {
    void loadWordCatalog()
      .then(setWordCatalog)
      .catch((error: unknown) =>
        setLoadError(error instanceof Error ? error.message : "Could not load the game dictionary"),
      );
    subscribeConnection(connection());
    try {
      const savedRaw = JSON.parse(sessionStorage.getItem("redtea.session") ?? "null") as unknown;
      const saved =
        typeof savedRaw === "object" &&
        savedRaw !== null &&
        "token" in savedRaw &&
        typeof savedRaw.token === "string" &&
        savedRaw.token.length >= 16 &&
        savedRaw.token.length <= 128 &&
        "roomCode" in savedRaw &&
        typeof savedRaw.roomCode === "string" &&
        /^[A-Z0-9]{5}$/.test(savedRaw.roomCode)
          ? { token: savedRaw.token, roomCode: savedRaw.roomCode }
          : undefined;
      const pendingRaw = JSON.parse(
        sessionStorage.getItem("redtea.pendingRoomAction") ?? "null",
      ) as unknown;
      const pendingParsed = clientMessageSchema.safeParse(pendingRaw);
      const pendingRoomAction =
        pendingParsed.success &&
        (pendingParsed.data.type === "create_room" || pendingParsed.data.type === "join_room")
          ? pendingParsed.data
          : undefined;
      if (savedRaw !== null && !saved) sessionStorage.removeItem("redtea.session");
      if (pendingRaw !== null && !pendingRoomAction)
        sessionStorage.removeItem("redtea.pendingRoomAction");
      if ((saved?.token && saved.roomCode) || pendingRoomAction)
        activateRemote({
          ...(saved?.token && saved.roomCode
            ? { token: saved.token, roomCode: saved.roomCode }
            : {}),
          ...(pendingRoomAction ? { pendingRoomAction } : {}),
        });
    } catch {
      try {
        sessionStorage.removeItem("redtea.session");
        sessionStorage.removeItem("redtea.pendingRoomAction");
      } catch {
        // Storage may be disabled; the room can still be used for this tab session.
      }
    }
    const interval = window.setInterval(() => connection().tick(), 50);
    onCleanup(() => {
      window.clearInterval(interval);
      unsubscribeActive();
    });
  });

  const remainingMs = () => {
    const current = game();
    if (!current) return 0;
    if (current.mode === "mix") return mixTimeRemainingMs(current, clock());
    return current.mode === "black"
      ? getTimeRemainingMs(current, clock())
      : getRoundTimeRemainingMs(current, clock());
  };
  const roundDuration = () => {
    const current = game();
    if (current?.mode === "mix" && current.status === "intermission")
      return current.config.intermissionMs;
    if (current?.mode === "mix")
      return current.currentTea
        ? current.config[`${current.currentTea}TimeMs`] || current.config.roundTimeMs
        : 0;
    return current?.mode === "black" ? current.turnDurationMs : (current?.config.roundTimeMs ?? 0);
  };
  const currentPlayer = () => {
    const current = activeGame();
    if (current?.mode !== "black") return null;
    return current.players.find(({ id }) => id === current.currentPlayerId) ?? null;
  };
  const canHumanSubmit = () => {
    const current = activeGame();
    if (current?.status !== "playing") return false;
    const selfId = connection().playerId();
    if (current.mode === "black") return current.currentPlayerId === selfId;
    return current.mode === "green" || !current.submittedPlayerIds.includes(selfId);
  };
  const statusText = () => {
    const current = game();
    if (!current) return "Ready when you are";
    if (current.status === "finished") return "GAME OVER";
    if (current.mode === "mix")
      return current.status === "intermission"
        ? `NEXT UP · ${current.upcomingTea?.toUpperCase()} TEA`
        : `${current.currentTea?.toUpperCase() ?? "MIX"} · ROUND ${current.roundNumber}`;
    if (current.mode === "black")
      return currentPlayer()?.name === "You"
        ? "YOUR TURN"
        : `${currentPlayer()?.name ?? "BOT"}'S TURN`;
    return `${current.mode.toUpperCase()} · ROUND ${current.roundNumber}`;
  };
  const result = () => roundResult(game());
  const mixResult = () => {
    const current = game();
    return current?.mode === "mix" ? current.roundResults.at(-1) : null;
  };
  const playerName = (id: string | null) =>
    game()?.players.find(({ id: playerId }) => playerId === id)?.name ?? "No one";
  const completedCount = () => {
    const current = game();
    if (!current) return 0;
    return current.mode === "black" ? current.usedWords.length : current.roundResults.length;
  };
  const pointsTarget = () => {
    const current = game();
    return current?.mode === "mix"
      ? current.config.pointsToWin
      : current && current.mode !== "black"
        ? current.config.pointsToWin
        : "last player";
  };
  const activePlayer = (playerId: string) => {
    const current = activeGame();
    return current?.mode === "black" && current.currentPlayerId === playerId;
  };
  const resultTitle = () => {
    const mixLast = mixResult();
    if (mixLast)
      return mixLast.winnerId
        ? `${playerName(mixLast.winnerId)} takes the ${mixLast.tea} round`
        : `${mixLast.tea} round ends with no point`;
    const last = result();
    if (!last) return "No round played yet";
    return last.winnerId ? `${playerName(last.winnerId)} takes the point` : "No point this round";
  };
  function activeGame() {
    const current = game();
    return current?.mode === "mix" ? current.activeGame : current;
  }
  const teaTheme = () => {
    const current = game();
    return current?.mode === "mix"
      ? ((current.status === "intermission" ? current.upcomingTea : current.currentTea) ?? "mix")
      : (current?.mode ?? mode());
  };
  const activeTea = () => {
    const current = game();
    return current?.mode === "mix" ? current.currentTea : current?.mode;
  };
  const upcomingTea = () => {
    const current = game();
    return current?.mode === "mix" ? current.upcomingTea : null;
  };

  return (
    <main
      class="page"
      classList={{ "mode-intro-page": !game() && showModeIntro() && !room() }}
      data-tea={teaTheme()}
    >
      <Show when={game() || !showModeIntro() || room()}>
        <header class="topbar">
          <div class="brand-lockup">
            <span class="brand-mark" aria-hidden="true">
              ✳
            </span>
            <div>
              <p class="eyebrow">A word game steeped in speed</p>
              <h1>Redtea</h1>
            </div>
          </div>
          <div class="theme-strip" role="img" aria-label="Tea mode palettes">
            <For each={teaModes}>
              {(tea) => <span class={`theme-dot ${tea.id}`} title={`${tea.label} tea`} />}
            </For>
          </div>
        </header>
      </Show>

      <Show
        when={!game()}
        fallback={
          <section class="game-layout" aria-label={`${activeTea()} Tea game`}>
            <div class="game-column">
              <div class="round-heading">
                <div>
                  <p class="eyebrow">
                    {room() ? "Multiplayer room" : "Solo mode"} ·{" "}
                    {game()?.mode === "mix" ? "Mix" : game()?.mode} Tea
                  </p>
                  <h2>
                    {game()?.mode === "black" || (game()?.mode === "mix" && activeTea() === "black")
                      ? "Keep the word moving."
                      : "Find your winning word."}
                  </h2>
                </div>
                <span class="live-pill">
                  <span />
                  {connectionState() === "reconnecting" ? "RECONNECTING…" : statusText()}
                </span>
              </div>

              <section class="fragment-card" aria-live="polite">
                <div class="fragment-label">
                  {game()?.mode === "mix" && game()?.status === "intermission"
                    ? "Next round"
                    : "Find a word containing"}
                </div>
                <div
                  class="fragment"
                  role="status"
                  aria-label={`Fragment ${activeGame()?.fragment ?? "—"}`}
                >
                  {game()?.mode === "mix" && game()?.status === "intermission"
                    ? `${upcomingTea()?.toUpperCase()} TEA`
                    : (activeGame()?.fragment ?? "…")}
                </div>
                <div class="fragment-footer">
                  <span>Round {roundNumber(game())}</span>
                  <span>{completedCount()} completed</span>
                </div>
              </section>

              <section class="timer-panel" aria-label="Round countdown">
                <div class="timer-topline">
                  <span>
                    {game()?.mode === "black" || (game()?.mode === "mix" && activeTea() === "black")
                      ? statusText()
                      : game()?.mode === "mix" && game()?.status === "intermission"
                        ? "Next round begins in"
                        : "Round closes in"}
                    <strong>
                      {seconds(remainingMs())}
                      <small>s</small>
                    </strong>
                  </span>
                </div>
                <div
                  class="timer-track"
                  role="progressbar"
                  aria-valuemin="0"
                  aria-valuemax={roundDuration()}
                  aria-valuenow={remainingMs()}
                >
                  <div
                    class="timer-fill"
                    classList={{ urgent: remainingMs() <= 3_000 }}
                    style={{
                      width: `${roundDuration() ? (remainingMs() / roundDuration()) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div class="timer-caption">
                  <span>
                    {activeTea() === "green"
                      ? "First valid word wins"
                      : "One point for the round winner"}
                  </span>
                  <span>Target {pointsTarget()}</span>
                </div>
              </section>

              <form class="answer-form" onSubmit={submit}>
                <label for="word-entry">
                  {activeTea() === "yellow" ? "Your one message this round" : "Your word"}
                </label>
                <div class="input-wrap">
                  <Show
                    when={activeTea() === "yellow"}
                    fallback={
                      <input
                        ref={(element) => {
                          inputRef = element;
                        }}
                        id="word-entry"
                        type="text"
                        autocomplete="off"
                        autocapitalize="none"
                        spellcheck={false}
                        placeholder={canHumanSubmit() ? "Type fast…" : "Round in progress…"}
                        value={entry()}
                        onInput={(event) => setEntry(event.currentTarget.value)}
                        readonly={!canHumanSubmit()}
                      />
                    }
                  >
                    <textarea
                      ref={(element) => {
                        inputRef = element;
                      }}
                      id="word-entry"
                      rows="2"
                      autocomplete="off"
                      autocapitalize="none"
                      spellcheck={false}
                      placeholder={
                        canHumanSubmit()
                          ? "Several words, separated by spaces or commas…"
                          : "Message submitted"
                      }
                      value={entry()}
                      onInput={(event) => setEntry(event.currentTarget.value)}
                      readonly={!canHumanSubmit()}
                    />
                  </Show>
                  <button class="submit-button" type="submit" disabled={!canHumanSubmit()}>
                    Submit <span aria-hidden="true">↵</span>
                  </button>
                </div>
                <p class="feedback" id="feedback" aria-live="polite">
                  {game()?.status === "finished"
                    ? `${playerName(game()?.winnerId ?? null)} wins the game.`
                    : activeTea() === "yellow"
                      ? "Repeated words in your message count once."
                      : activeTea() === "red"
                        ? "Your longest valid word counts."
                        : activeTea() === "green"
                          ? "Keep trying until someone finds a valid word."
                          : "Two missed turns and you’re out."}
                </p>
              </form>

              <div class="game-actions">
                <button class="restart-button" type="button" onClick={backToSetup}>
                  Back to setup
                </button>
                <p>
                  {activeTea() === "black"
                    ? "Words cannot be reused."
                    : "Bot plays appear in the live feed."}
                </p>
              </div>
              <Show when={game()?.status === "finished"}>
                <div class="winner-banner" role="status">
                  <span aria-hidden="true">✦</span>
                  <strong>{playerName(game()?.winnerId ?? null)} wins the game.</strong>
                </div>
              </Show>
              <section class="round-result-card" aria-live="polite">
                <p class="eyebrow">Last round</p>
                <h3>{resultTitle()}</h3>
                <Show when={mixResult()}>
                  <p class="muted-copy">
                    The table moves on to the announced tea after a short pause.
                  </p>
                </Show>
                <Show
                  when={result()?.submissions.length}
                  fallback={
                    <p class="muted-copy">Submissions will appear here when the round ends.</p>
                  }
                >
                  <ul class="result-submissions">
                    <For each={result()?.submissions ?? []}>
                      {(submission) => (
                        <li>
                          <strong>{playerName(submission.playerId)}</strong>
                          <span>
                            {submission.validWords.length
                              ? submission.validWords.join(", ")
                              : submission.text || "No submission"}
                          </span>
                          <small>
                            {submission.score} {submission.score === 1 ? "word" : "words"}
                          </small>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </section>
            </div>

            <aside class="side-column">
              <section class="players-card">
                <div class="card-heading">
                  <div>
                    <p class="eyebrow">At the table</p>
                    <h3>Scoreboard</h3>
                  </div>
                  <span class="player-count">{game()?.players.length ?? 0}</span>
                </div>
                <ul class="player-list">
                  <For each={game()?.players ?? []}>
                    {(player) => (
                      <li
                        class="player-row"
                        classList={{
                          active: activePlayer(player.id),
                          eliminated: "alive" in player && !player.alive,
                        }}
                      >
                        <span class={`avatar ${player.kind}`} aria-hidden="true">
                          {player.kind === "human" ? "Y" : "✳"}
                        </span>
                        <div class="player-name">
                          <strong>{player.name}</strong>
                          <small>
                            {player.kind === "human"
                              ? player.id === connection().playerId()
                                ? "You"
                                : "Player"
                              : `Skill ${Math.round(player.skill * 100)}%`}
                          </small>
                        </div>
                        <div class="player-stats">
                          <Show when={"hp" in player}>
                            <small>{(player as BlackPlayerState).hp} HP</small>
                          </Show>
                          <strong>
                            {player.points}
                            <small> pt</small>
                          </strong>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </section>

              <section class="feed-card">
                <div class="card-heading">
                  <div>
                    <p class="eyebrow">Live table</p>
                    <h3>Submissions</h3>
                  </div>
                  <span class="feed-live">
                    <i /> LIVE
                  </span>
                </div>
                <Show
                  when={feed().length}
                  fallback={<p class="muted-copy">Bot plays show up here as they happen.</p>}
                >
                  <ul class="submission-feed">
                    <For each={feed()}>
                      {(item) => (
                        <li>
                          <span class={`feed-marker ${item.validWords.length ? "good" : "bad"}`} />
                          <div>
                            <strong>{playerName(item.playerId)}</strong>
                            <p>{item.text || "No word"}</p>
                            <small>
                              {item.validWords.length
                                ? `${item.validWords.length} valid`
                                : "No valid words"}{" "}
                              · round {item.round}
                            </small>
                          </div>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </section>

              <section class="rules-card">
                <span class="rules-star" aria-hidden="true">
                  ✦
                </span>
                <div>
                  <h3>{game()?.mode} Tea rules</h3>
                  <p>
                    {game()?.mode === "mix" && activeTea() === "black"
                      ? "The bomb passes between living players. The first timeout costs 1 HP and ends the Black sequence."
                      : activeTea() === "green"
                        ? "First valid word wins. Words cannot be reused."
                        : activeTea() === "red"
                          ? "Longest valid word wins. Ties go to the earliest submission."
                          : activeTea() === "yellow"
                            ? "Send one message with several words. Ties go to the earliest message."
                            : "Play a valid word before the timer runs out. Miss twice and you’re eliminated."}
                  </p>
                </div>
              </section>
            </aside>
          </section>
        }
      >
        <Show when={showModeIntro() && !room()}>
          <section class="mode-intro-screen" aria-label={`${mode()} tea introduction`}>
            <button
              class="intro-settings-button"
              type="button"
              aria-label="Open settings"
              aria-expanded={settingsOpen()}
              title="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9.7 3.4.6-1.1h3.4l.6 1.1c.4.1.8.3 1.2.5l1.2-.3 2.4 2.4-.3 1.2c.2.4.4.8.5 1.2l1.1.6v3.4l-1.1.6c-.1.4-.3.8-.5 1.2l.3 1.2-2.4 2.4-1.2-.3c-.4.2-.8.4-1.2.5l-.6 1.1h-3.4l-.6-1.1c-.4-.1-.8-.3-1.2-.5l-1.2.3-2.4-2.4.3-1.2c-.2-.4-.4-.8-.5-1.2l-1.1-.6V9l1.1-.6c.1-.4.3-.8.5-1.2l-.3-1.2 2.4-2.4 1.2.3c.4-.2.8-.4 1.2-.5Z" />
                <circle cx="12" cy="10.7" r="3.1" />
              </svg>
            </button>
            <div class="mode-intro-content">
              <h1 class="mode-intro-title">
                <span class="mode-selector">
                  <select
                    aria-label="Choose tea mode"
                    value={mode()}
                    onChange={(event) => setMode(event.currentTarget.value as TeaMode)}
                  >
                    <For each={teaModes}>
                      {(tea) => <option value={tea.id}>{tea.label} Tea</option>}
                    </For>
                  </select>
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m5 7.5 5 5 5-5" />
                  </svg>
                </span>
              </h1>
              <div class="mode-intro-art" aria-hidden="true">
                <Show
                  when={teaAnimations[mode()]}
                  fallback={
                    <div class={`mode-art-symbol ${mode()}`}>
                      {teaModes.find((tea) => tea.id === mode())?.glyph}
                    </div>
                  }
                >
                  {(animation) => (
                    <img
                      class="tea-fox"
                      src={animation()}
                      width="680"
                      height="490"
                      alt={`A fox sitting and sipping ${mode()} tea`}
                    />
                  )}
                </Show>
              </div>
              <section class="how-it-works-card">
                <h2 class="how-it-works-label">How this works</h2>
                <p class="how-it-works-body">{teaHowItWorks[mode()].body}</p>
              </section>
              <button
                class="continue-button"
                type="button"
                disabled={!wordCatalog()}
                onClick={startGame}
              >
                Start <span aria-hidden="true">→</span>
              </button>
            </div>
            <Show when={settingsOpen()}>
              <div class="settings-backdrop" role="presentation">
                <section
                  class="settings-popover"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="settings-title"
                >
                  <div class="settings-popover-heading">
                    <h2 id="settings-title">Settings</h2>
                    <button
                      class="settings-close-button"
                      type="button"
                      aria-label="Close settings"
                      onClick={() => setSettingsOpen(false)}
                    >
                      ×
                    </button>
                  </div>
                  <div class="settings-popover-list">
                    <label class="settings-slider-row">
                      <span class="settings-range-heading">
                        <span>Tea</span>
                        <output>
                          {teaModes.find((tea) => tea.id === mode())?.label ?? "Red"} Tea
                        </output>
                      </span>
                      <input
                        class="settings-range"
                        aria-label="Tea"
                        type="range"
                        min="0"
                        max={teaModes.length - 1}
                        step="1"
                        value={Math.max(
                          0,
                          teaModes.findIndex((tea) => tea.id === mode()),
                        )}
                        style={"--range-fox: url(" + foxFacePortrait + ")"}
                        onInput={(event) => {
                          const tea = teaModes[Number(event.currentTarget.value)];
                          if (tea) setMode(tea.id);
                        }}
                      />
                    </label>
                    <label class="settings-slider-row">
                      <span class="settings-range-heading">
                        <span>Time</span>
                        <output>
                          {Math.round(
                            (mode() === "mix"
                              ? (config().mixConfig?.roundTimeMs ?? config().roundTimeMs)
                              : config().roundTimeMs) / 1_000,
                          )}{" "}
                          sec
                        </output>
                      </span>
                      <input
                        class="settings-range"
                        aria-label="Time in seconds"
                        type="range"
                        min={mode() === "black" ? 5 : 1}
                        max="120"
                        step="1"
                        value={
                          mode() === "mix"
                            ? (config().mixConfig?.roundTimeMs ?? config().roundTimeMs) / 1_000
                            : config().roundTimeMs / 1_000
                        }
                        style={"--range-fox: url(" + foxFacePortrait + ")"}
                        onInput={(event) => updateRoundTime(Number(event.currentTarget.value))}
                      />
                    </label>
                    <label class="settings-slider-row">
                      <span class="settings-range-heading">
                        <span>Bots</span>
                        <output>{config().botCount}</output>
                      </span>
                      <input
                        class="settings-range"
                        aria-label="Bots"
                        type="range"
                        min="1"
                        max="3"
                        step="1"
                        value={config().botCount}
                        style={"--range-fox: url(" + foxFacePortrait + ")"}
                        onInput={(event) =>
                          updateConfig("botCount", Number(event.currentTarget.value))
                        }
                      />
                    </label>
                    <label class="settings-range-row">
                      <span class="settings-range-heading">
                        <span>Bot ability</span>
                        <img src={botAbilityFox()} alt="" aria-hidden="true" />
                        <output>{Math.round(config().botSkill * 100)}%</output>
                      </span>
                      <input
                        class="settings-range"
                        aria-label="Bot ability"
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={config().botSkill}
                        style={"--range-fox: url(" + botAbilityFox() + ")"}
                        onInput={(event) =>
                          updateConfig("botSkill", Number(event.currentTarget.value))
                        }
                      />
                    </label>
                    <Show when={mode() !== "black"}>
                      <label class="settings-slider-row">
                        <span class="settings-range-heading">
                          <span>Points to win</span>
                          <output>
                            {mode() === "mix"
                              ? (config().mixConfig?.pointsToWin ?? defaultMixConfig.pointsToWin)
                              : config().pointsToWin}
                          </output>
                        </span>
                        <input
                          class="settings-range"
                          aria-label="Points to win"
                          type="range"
                          min="1"
                          max="99"
                          step="1"
                          value={
                            mode() === "mix"
                              ? (config().mixConfig?.pointsToWin ?? defaultMixConfig.pointsToWin)
                              : config().pointsToWin
                          }
                          style={"--range-fox: url(" + foxFacePortrait + ")"}
                          onInput={(event) => updatePointsTarget(Number(event.currentTarget.value))}
                        />
                      </label>
                    </Show>
                    <Show when={mode() === "red" || mode() === "yellow" || mode() === "mix"}>
                      <label class="settings-slider-row">
                        <span class="settings-range-heading">
                          <span>Allow word reuse</span>
                          <output>
                            {(
                              mode() === "mix"
                                ? (config().mixConfig?.reuseWordsPerTea ?? false)
                                : config().allowWordReuse
                            )
                              ? "On"
                              : "Off"}
                          </output>
                        </span>
                        <input
                          class="settings-range"
                          aria-label="Allow word reuse"
                          type="range"
                          min="0"
                          max="1"
                          step="1"
                          value={
                            mode() === "mix"
                              ? config().mixConfig?.reuseWordsPerTea
                                ? 1
                                : 0
                              : config().allowWordReuse
                                ? 1
                                : 0
                          }
                          style={"--range-fox: url(" + foxFacePortrait + ")"}
                          onInput={(event) => {
                            const allowReuse = Number(event.currentTarget.value) === 1;
                            if (mode() === "mix") changeMixSetting("reuseWordsPerTea", allowReuse);
                            else updateConfig("allowWordReuse", allowReuse);
                          }}
                        />
                      </label>
                    </Show>
                  </div>
                  <button
                    class="settings-done-button"
                    type="button"
                    onClick={() => setSettingsOpen(false)}
                  >
                    Done
                  </button>
                </section>
              </div>
            </Show>
          </section>
        </Show>
        <Show when={!showModeIntro() || room()}>
          <section class="setup-layout" aria-label="Choose tea mode and game settings">
            <section class="lobby-card" aria-label="Multiplayer room">
              <div class="card-heading">
                <div>
                  <p class="eyebrow">Play together</p>
                  <h3>Multiplayer room</h3>
                </div>
                <Show when={room()}>
                  <strong>Code {room()?.room.code}</strong>
                </Show>
              </div>
              <Show
                when={!room()}
                fallback={
                  <div class="lobby-content">
                    <p>
                      Share code <strong>{room()?.room.code}</strong> with a friend.
                    </p>
                    <Show when={connectionState() === "reconnecting"}>
                      <p class="connection-notice" role="status">
                        Reconnecting… your current input stays on this device.
                      </p>
                    </Show>
                    <Show when={room()?.room.phase === "countdown"}>
                      <div class="join-countdown" role="status" aria-live="polite">
                        <strong>
                          Join window ·{" "}
                          {Math.max(
                            0,
                            Math.ceil(
                              ((room()?.room.countdownEndsAt ?? clock()) - clock()) / 1_000,
                            ),
                          )}
                          s
                        </strong>
                        <p>There’s still time to pull up a seat.</p>
                      </div>
                    </Show>
                    <ul class="lobby-player-list">
                      <For each={room()?.players ?? []}>
                        {(player) => (
                          <li>
                            {player.name} {player.id === room()?.room.hostId ? "· host" : ""} ·{" "}
                            {player.connected
                              ? player.ready
                                ? "ready"
                                : "not ready"
                              : "disconnected"}
                          </li>
                        )}
                      </For>
                    </ul>
                    <Show when={connection().playerId() !== room()?.room.hostId}>
                      <button
                        class="restart-button"
                        type="button"
                        disabled={connectionState() !== "connected"}
                        onClick={() =>
                          connection().setReady(
                            !(
                              room()?.players.find(
                                (player) => player.id === connection().playerId(),
                              )?.ready ?? false
                            ),
                          )
                        }
                      >
                        {room()?.players.find((player) => player.id === connection().playerId())
                          ?.ready
                          ? "Not ready"
                          : "Ready"}
                      </button>
                    </Show>
                    <Show when={connection().playerId() === room()?.room.hostId}>
                      <div class="lobby-controls">
                        <label>
                          Mode{" "}
                          <select
                            value={room()?.room.mode}
                            disabled={connectionState() !== "connected"}
                            onChange={(event) => {
                              const next = event.currentTarget.value as TeaMode;
                              setMode(next);
                              configureRoom(next);
                            }}
                          >
                            <For each={teaModes}>
                              {(tea) => <option value={tea.id}>{tea.label}</option>}
                            </For>
                          </select>
                        </label>
                        <label>
                          Bot seats{" "}
                          <select
                            value={room()?.room.botCount}
                            disabled={connectionState() !== "connected"}
                            onChange={(event) => {
                              const bots = Number(event.currentTarget.value);
                              updateConfig("botCount", bots);
                              connection().configureRoom(
                                room()?.room.mode ?? mode(),
                                selectedEngineConfig(room()?.room.mode ?? mode(), {
                                  ...configs()[room()?.room.mode ?? mode()],
                                  botCount: bots,
                                }),
                                bots,
                              );
                            }}
                          >
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                          </select>
                        </label>
                        <Show
                          when={
                            (room()?.room.mode ?? mode()) !== "black" &&
                            (room()?.room.mode ?? mode()) !== "mix"
                          }
                        >
                          <label>
                            Points to win{" "}
                            <input
                              type="number"
                              disabled={connectionState() !== "connected"}
                              min="1"
                              max="99"
                              value={configs()[room()?.room.mode ?? mode()].pointsToWin}
                              onChange={(event) =>
                                changeRoomSetting(
                                  room()?.room.mode ?? mode(),
                                  "pointsToWin",
                                  Math.max(1, Number(event.currentTarget.value) || 1),
                                )
                              }
                            />
                          </label>
                        </Show>
                        <Show when={(room()?.room.mode ?? mode()) !== "mix"}>
                          <label>
                            Seconds per turn/round{" "}
                            <input
                              type="number"
                              disabled={connectionState() !== "connected"}
                              min={(room()?.room.mode ?? mode()) === "black" ? 5 : 1}
                              max="120"
                              value={configs()[room()?.room.mode ?? mode()].roundTimeMs / 1_000}
                              onChange={(event) =>
                                changeRoomSetting(
                                  room()?.room.mode ?? mode(),
                                  "roundTimeMs",
                                  Math.max(
                                    (room()?.room.mode ?? mode()) === "black" ? 5_000 : 1_000,
                                    Number(event.currentTarget.value) * 1_000 || 1_000,
                                  ),
                                )
                              }
                            />
                          </label>
                        </Show>
                        <Show
                          when={
                            (room()?.room.mode ?? mode()) === "mix" &&
                            (room()?.players.filter(
                              (player) => player.connected && player.kind === "human",
                            ).length ?? 0) +
                              (room()?.room.botCount ?? 0) <
                              2
                          }
                        >
                          <p class="feedback" role="status">
                            Mix needs at least two connected players or bots. Add a player or a bot
                            before starting.
                          </p>
                        </Show>
                        <button
                          class="submit-button"
                          type="button"
                          onClick={() => connection().startRoom()}
                          disabled={
                            room()?.room.phase === "countdown" ||
                            connectionState() !== "connected" ||
                            ((room()?.room.mode ?? mode()) === "mix" &&
                              (room()?.players.filter(
                                (player) => player.connected && player.kind === "human",
                              ).length ?? 0) +
                                (room()?.room.botCount ?? 0) <
                                2)
                          }
                        >
                          {room()?.room.phase === "countdown" ? "Starting soon…" : "Start game"}
                        </button>
                      </div>
                    </Show>
                    <button class="restart-button" type="button" onClick={leaveRoom}>
                      Leave room
                    </button>
                  </div>
                }
              >
                <div class="lobby-content">
                  <Show when={connectionState() === "reconnecting"}>
                    <p class="connection-notice" role="status">
                      Reconnecting to your room…
                    </p>
                  </Show>
                  <label class="setting-control">
                    <span>
                      <strong>Your name</strong>
                    </span>
                    <input
                      value={name()}
                      maxlength="24"
                      onInput={(event) => setName(event.currentTarget.value)}
                    />
                  </label>
                  <div class="lobby-controls">
                    <button
                      class="submit-button"
                      type="button"
                      disabled={connectionState() !== "connected"}
                      onClick={() => startRoomConnection(true)}
                    >
                      Create room
                    </button>
                    <input
                      aria-label="Room code"
                      disabled={connectionState() !== "connected"}
                      placeholder="Room code"
                      maxlength="5"
                      value={roomCodeEntry()}
                      onInput={(event) => setRoomCodeEntry(event.currentTarget.value.toUpperCase())}
                    />
                    <button
                      class="restart-button"
                      type="button"
                      disabled={roomCodeEntry().length !== 5 || connectionState() !== "connected"}
                      onClick={() => startRoomConnection(false)}
                    >
                      Join
                    </button>
                  </div>
                </div>
              </Show>
              <Show when={lobbyError()}>
                <p class="feedback" role="alert">
                  {lobbyError()}
                </p>
              </Show>
            </section>
          </section>
        </Show>
      </Show>

      <Show when={game() || !showModeIntro() || room()}>
        <footer class="footer">
          <span>BREWED FOR WORD LOVERS</span>
          <span>
            One fragment at a time <i>✳</i>
          </span>
        </footer>
      </Show>
    </main>
  );
}
