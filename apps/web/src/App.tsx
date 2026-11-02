import type {
  AnyRoundGameState,
  BlackEvent,
  BlackGameState,
  BlackPlayerState,
  GamePlayer,
  GreenConfig,
  GreenEvent,
  RedConfig,
  RedEvent,
  RoundModeEffect,
  RoundModeName,
  RoundResult,
  RoundSubmission,
  YellowConfig,
  YellowEvent,
} from "@redtea/engine";
import {
  createBlackGame,
  createGreenGame,
  createRedGame,
  createYellowGame,
  defaultBlackConfig,
  defaultGreenConfig,
  defaultRedConfig,
  defaultYellowConfig,
  getRoundTimeRemainingMs,
  getTimeRemainingMs,
  step,
  stepRoundGame,
} from "@redtea/engine";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { loadWordCatalog } from "./gameData";
import "./styles.css";

type TeaMode = "black" | RoundModeName;
type UiModeConfig = {
  botCount: number;
  botSkill: number;
  pointsToWin: number;
  roundTimeMs: number;
  allowWordReuse: boolean;
  ignoreInvalidWords: boolean;
};
type AnyGameState = BlackGameState | AnyRoundGameState;
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
  };
}

function roundResult(state: AnyGameState | null): RoundResult | null {
  if (!state) return null;
  if (state.mode === "black") return state.lastRoundResult as RoundResult | null;
  return state.roundResults.at(-1) ?? null;
}

function roundNumber(state: AnyGameState | null): number {
  if (!state) return 0;
  return state.mode === "black" ? state.turnNumber : state.roundNumber;
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1_000).toFixed(1);
}

export function App() {
  const [mode, setMode] = createSignal<TeaMode>("green");
  const [configs, setConfigs] = createSignal(initialUiConfigs());
  const [game, setGame] = createSignal<AnyGameState | null>(null);
  const [entry, setEntry] = createSignal("");
  const [clock, setClock] = createSignal(0);
  const [feed, setFeed] = createSignal<SubmissionFeedItem[]>([]);
  const [loadError, setLoadError] = createSignal("");
  const [wordCatalog, setWordCatalog] = createSignal<Awaited<
    ReturnType<typeof loadWordCatalog>
  > | null>(null);
  let inputRef: HTMLInputElement | HTMLTextAreaElement | undefined;

  const config = () => configs()[mode()];
  function updateConfig<K extends keyof UiModeConfig>(key: K, value: UiModeConfig[K]): void {
    setConfigs((current) => ({ ...current, [mode()]: { ...current[mode()], [key]: value } }));
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

  function applyTransition(
    nextState: AnyGameState,
    effects: readonly (RoundModeEffect | { type: string; [key: string]: unknown })[],
    now: number,
  ): void {
    setClock(now);
    setGame(nextState);
    recordEffects(effects);
  }

  function startGame(): void {
    const catalog = wordCatalog();
    if (!catalog) return;
    const selected = mode();
    const settings = configs()[selected];
    const players = makePlayers(settings.botCount, settings.botSkill);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
    let created: AnyGameState;
    if (selected === "black") {
      created = createBlackGame({
        players,
        catalog,
        seed,
        config: { initialTurnMs: settings.roundTimeMs },
      });
    } else if (selected === "green") {
      const config: Partial<GreenConfig> = {
        botCount: settings.botCount,
        pointsToWin: settings.pointsToWin,
        roundTimeMs: settings.roundTimeMs,
      };
      created = createGreenGame({ players, catalog, seed, config });
    } else if (selected === "red") {
      const config: Partial<RedConfig> = {
        botCount: settings.botCount,
        pointsToWin: settings.pointsToWin,
        roundTimeMs: settings.roundTimeMs,
        allowWordReuse: settings.allowWordReuse,
      };
      created = createRedGame({ players, catalog, seed, config });
    } else {
      const config: Partial<YellowConfig> = {
        botCount: settings.botCount,
        pointsToWin: settings.pointsToWin,
        roundTimeMs: settings.roundTimeMs,
        allowWordReuse: settings.allowWordReuse,
        ignoreInvalidWords: settings.ignoreInvalidWords,
      };
      created = createYellowGame({ players, catalog, seed, config });
    }
    const now = performance.now();
    const started =
      selected === "black"
        ? step(created as BlackGameState, { type: "START" }, now)
        : stepRoundGame(created as AnyRoundGameState, { type: "START" }, now);
    setGame(started.state);
    setClock(now);
    setEntry("");
    setFeed([]);
    requestAnimationFrame(() => inputRef?.focus());
  }

  function dispatch(event: BlackEvent | GreenEvent | RedEvent | YellowEvent): void {
    const current = game();
    if (!current) return;
    const now = performance.now();
    if (current.mode === "black") {
      const result = step(current, event as BlackEvent, now);
      applyTransition(result.state, result.effects, now);
    } else {
      const result = stepRoundGame(current, event as GreenEvent, now);
      applyTransition(result.state, result.effects, now);
    }
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    const current = game();
    if (current?.status !== "playing") return;
    const text = entry().trim();
    if (!text) return;
    setEntry("");
    if (current.mode === "black") {
      if (current.currentPlayerId === "you")
        dispatch({ type: "SUBMIT_WORD", playerId: "you", word: text });
    } else if (current.mode === "yellow") {
      dispatch({ type: "SUBMIT_MESSAGE", playerId: "you", message: text });
    } else {
      dispatch({ type: "SUBMIT_WORD", playerId: "you", word: text });
    }
    requestAnimationFrame(() => inputRef?.focus());
  }

  onMount(() => {
    void loadWordCatalog()
      .then(setWordCatalog)
      .catch((error: unknown) =>
        setLoadError(error instanceof Error ? error.message : "Could not load the game dictionary"),
      );
    const interval = window.setInterval(() => dispatch({ type: "TICK" }), 50);
    onCleanup(() => window.clearInterval(interval));
  });

  const remainingMs = () => {
    const current = game();
    if (!current) return 0;
    return current.mode === "black"
      ? getTimeRemainingMs(current, clock())
      : getRoundTimeRemainingMs(current, clock());
  };
  const roundDuration = () => {
    const current = game();
    return current?.mode === "black" ? current.turnDurationMs : (current?.config.roundTimeMs ?? 0);
  };
  const currentPlayer = () => {
    const current = game();
    if (current?.mode !== "black") return null;
    return current.players.find(({ id }) => id === current.currentPlayerId) ?? null;
  };
  const canHumanSubmit = () => {
    const current = game();
    if (current?.status !== "playing") return false;
    if (current.mode === "black") return current.currentPlayerId === "you";
    return current.mode === "green" || !current.submittedPlayerIds.includes("you");
  };
  const statusText = () => {
    const current = game();
    if (!current) return "Ready when you are";
    if (current.status === "finished") return "GAME OVER";
    if (current.mode === "black")
      return currentPlayer()?.name === "You"
        ? "YOUR TURN"
        : `${currentPlayer()?.name ?? "BOT"}'S TURN`;
    return `${current.mode.toUpperCase()} · ROUND ${current.roundNumber}`;
  };
  const result = () => roundResult(game());
  const playerName = (id: string | null) =>
    game()?.players.find(({ id: playerId }) => playerId === id)?.name ?? "No one";
  const completedCount = () => {
    const current = game();
    if (!current) return 0;
    return current.mode === "black" ? current.usedWords.length : current.roundResults.length;
  };
  const pointsTarget = () => {
    const current = game();
    return current && current.mode !== "black" ? current.config.pointsToWin : "last player";
  };
  const activePlayer = (playerId: string) => {
    const current = game();
    return current?.mode === "black" && current.currentPlayerId === playerId;
  };
  const resultTitle = () => {
    const last = result();
    if (!last) return "No round played yet";
    return last.winnerId ? `${playerName(last.winnerId)} takes the point` : "No point this round";
  };

  return (
    <main class="page" data-tea={game()?.mode ?? mode()}>
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

      <Show
        when={!game()}
        fallback={
          <section class="game-layout" aria-label={`${game()?.mode} Tea game`}>
            <div class="game-column">
              <div class="round-heading">
                <div>
                  <p class="eyebrow">Solo mode · {game()?.mode} Tea</p>
                  <h2>
                    {game()?.mode === "black" ? "Keep the word moving." : "Find your winning word."}
                  </h2>
                </div>
                <span class="live-pill">
                  <span />
                  {statusText()}
                </span>
              </div>

              <section class="fragment-card" aria-live="polite">
                <div class="fragment-label">Find a word containing</div>
                <div
                  class="fragment"
                  role="status"
                  aria-label={`Fragment ${game()?.fragment ?? "—"}`}
                >
                  {game()?.fragment ?? "…"}
                </div>
                <div class="fragment-footer">
                  <span>Round {roundNumber(game())}</span>
                  <span>{completedCount()} completed</span>
                </div>
              </section>

              <section class="timer-panel" aria-label="Round countdown">
                <div class="timer-topline">
                  <span>
                    {game()?.mode === "black" ? statusText() : "Round closes in"}
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
                    {game()?.mode === "green"
                      ? "First valid word wins"
                      : "One point for the round winner"}
                  </span>
                  <span>Target {pointsTarget()}</span>
                </div>
              </section>

              <form class="answer-form" onSubmit={submit}>
                <label for="word-entry">
                  {game()?.mode === "yellow" ? "Your one message this round" : "Your word"}
                </label>
                <div class="input-wrap">
                  <Show
                    when={game()?.mode === "yellow"}
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
                    : game()?.mode === "yellow"
                      ? "Repeated words in your message count once."
                      : game()?.mode === "red"
                        ? "Your longest valid word counts."
                        : game()?.mode === "green"
                          ? "Keep trying until someone finds a valid word."
                          : "Two missed turns and you’re out."}
                </p>
              </form>

              <div class="game-actions">
                <button class="restart-button" type="button" onClick={() => setGame(null)}>
                  Back to setup
                </button>
                <p>
                  {game()?.mode === "black"
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
                              ? "You"
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
                    {game()?.mode === "green"
                      ? "First valid word wins. Words cannot be reused."
                      : game()?.mode === "red"
                        ? "Longest valid word wins. Ties go to the earliest submission."
                        : game()?.mode === "yellow"
                          ? "Send one message with several words. Ties go to the earliest message."
                          : "Play a valid word before the timer runs out. Miss twice and you’re eliminated."}
                  </p>
                </div>
              </section>
            </aside>
          </section>
        }
      >
        <section class="setup-layout" aria-label="Choose tea mode and game settings">
          <div class="setup-intro">
            <p class="eyebrow">Choose your brew</p>
            <h2>
              Pick a mode.
              <br />
              <em>Play a quick round.</em>
            </h2>
            <p class="setup-copy">
              Word games for one, with a table of bots to race, outscore, or outlast.
            </p>
          </div>
          <div class="setup-panel">
            <div class="mode-grid">
              <For each={teaModes}>
                {(tea) => (
                  <button
                    type="button"
                    class={`mode-card ${mode() === tea.id ? "selected" : ""}`}
                    onClick={() => setMode(tea.id)}
                    aria-pressed={mode() === tea.id}
                  >
                    <span class="mode-glyph">{tea.glyph}</span>
                    <span>
                      <strong>{tea.label} Tea</strong>
                      <small>{tea.desc}</small>
                    </span>
                    <i>{mode() === tea.id ? "✓" : ""}</i>
                  </button>
                )}
              </For>
            </div>
            <div class="config-grid">
              <label class="setting-control">
                <span>
                  <strong>Tea bots</strong>
                  <small>Compete against 1 to 3 bots</small>
                </span>
                <select
                  value={config().botCount}
                  onChange={(event) => updateConfig("botCount", Number(event.currentTarget.value))}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </label>
              <label class="setting-control skill-control">
                <span>
                  <strong>Bot skill</strong>
                  <small>Speed and word choice</small>
                </span>
                <output>{Math.round(config().botSkill * 100)}%</output>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={config().botSkill}
                  onInput={(event) => updateConfig("botSkill", Number(event.currentTarget.value))}
                />
              </label>
              <Show when={mode() !== "black"}>
                <label class="setting-control">
                  <span>
                    <strong>Points to win</strong>
                    <small>{mode() === "green" ? "Default: 30" : "Default: 4"}</small>
                  </span>
                  <input
                    class="number-setting"
                    type="number"
                    min="1"
                    max="99"
                    value={config().pointsToWin}
                    onInput={(event) =>
                      updateConfig(
                        "pointsToWin",
                        Math.max(1, Number(event.currentTarget.value) || 1),
                      )
                    }
                  />
                </label>
              </Show>
              <label class="setting-control">
                <span>
                  <strong>{mode() === "black" ? "Turn time" : "Time per round"}</strong>
                  <small>Seconds before the round moves on</small>
                </span>
                <span class="time-setting">
                  <input
                    class="number-setting"
                    type="number"
                    min={mode() === "black" ? 5 : 1}
                    max="120"
                    value={config().roundTimeMs / 1_000}
                    onInput={(event) =>
                      updateConfig(
                        "roundTimeMs",
                        Math.max(
                          mode() === "black" ? 5_000 : 1_000,
                          Number(event.currentTarget.value) * 1_000 || 1_000,
                        ),
                      )
                    }
                  />
                  <small>sec</small>
                </span>
              </label>
              <Show when={mode() === "red" || mode() === "yellow"}>
                <label class="check-setting">
                  <input
                    type="checkbox"
                    checked={config().allowWordReuse}
                    onChange={(event) =>
                      updateConfig("allowWordReuse", event.currentTarget.checked)
                    }
                  />
                  <span>
                    <strong>Allow word reuse</strong>
                    <small>Words used in earlier rounds are allowed</small>
                  </span>
                </label>
              </Show>
              <Show when={mode() === "yellow"}>
                <label class="check-setting">
                  <input
                    type="checkbox"
                    checked={config().ignoreInvalidWords}
                    onChange={(event) =>
                      updateConfig("ignoreInvalidWords", event.currentTarget.checked)
                    }
                  />
                  <span>
                    <strong>Ignore invalid words</strong>
                    <small>Turn off to subtract one per invalid word</small>
                  </span>
                </label>
              </Show>
            </div>
            <div class="setup-footer">
              <p>{loadError() || (wordCatalog() ? "Dictionary ready" : "Loading dictionary…")}</p>
              <button
                class="apply-button start-button"
                type="button"
                disabled={!wordCatalog()}
                onClick={startGame}
              >
                Start {mode()[0]?.toUpperCase()}
                {mode().slice(1)} Tea <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </section>
      </Show>

      <footer class="footer">
        <span>BREWED FOR WORD LOVERS</span>
        <span>
          One fragment at a time <i>✳</i>
        </span>
      </footer>
    </main>
  );
}
