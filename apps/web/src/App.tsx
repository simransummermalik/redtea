import type { BlackGameState, GamePlayer, WordCatalog } from "@redtea/engine";
import { createBlackGame, getTimeRemainingMs, step } from "@redtea/engine";
import { createSignal, For, onCleanup, onMount } from "solid-js";
import { loadWordCatalog } from "./gameData";
import "./styles.css";

const teaThemes = ["black", "yellow", "red", "green", "mix"] as const;

function formatSeconds(milliseconds: number): string {
  return (milliseconds / 1_000).toFixed(1);
}

function createPlayers(botCount: number, skill: number): GamePlayer[] {
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

export function App() {
  const [game, setGame] = createSignal<BlackGameState | null>(null);
  const [entry, setEntry] = createSignal("");
  const [clock, setClock] = createSignal(0);
  const [botCount, setBotCount] = createSignal(2);
  const [botSkill, setBotSkill] = createSignal(0.65);
  const [loadError, setLoadError] = createSignal("");
  let wordCatalog: WordCatalog | undefined;
  let inputRef: HTMLInputElement | undefined;

  function dispatch(event: Parameters<typeof step>[1]): void {
    const now = performance.now();
    setClock(now);
    setGame((current) => (current ? step(current, event, now).state : current));
  }

  function startGame(): void {
    if (!wordCatalog) return;
    const next = createBlackGame({
      players: createPlayers(botCount(), botSkill()),
      catalog: wordCatalog,
      seed: crypto.getRandomValues(new Uint32Array(1))[0] ?? 1,
    });
    const now = performance.now();
    setClock(now);
    setGame(step(next, { type: "START" }, now).state);
    setEntry("");
    requestAnimationFrame(() => inputRef?.focus());
  }

  function submitWord(event: SubmitEvent): void {
    event.preventDefault();
    const state = game();
    if (state?.currentPlayerId !== "you" || state?.status !== "playing") return;
    const word = entry();
    setEntry("");
    dispatch({ type: "SUBMIT_WORD", playerId: "you", word });
    requestAnimationFrame(() => inputRef?.focus());
  }

  onMount(() => {
    void loadWordCatalog()
      .then((catalog) => {
        wordCatalog = catalog;
        startGame();
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Could not load the game dictionary");
      });
    const interval = window.setInterval(() => dispatch({ type: "TICK" }), 50);
    onCleanup(() => window.clearInterval(interval));
    requestAnimationFrame(() => inputRef?.focus());
  });

  const remainingMs = () => {
    const state = game();
    return state ? getTimeRemainingMs(state, clock()) : 0;
  };
  const timerWidth = () => {
    const state = game();
    return state?.turnDurationMs ? `${(remainingMs() / state.turnDurationMs) * 100}%` : "0%";
  };
  const currentPlayer = () => game()?.players.find(({ id }) => id === game()?.currentPlayerId);
  const isHumanTurn = () => currentPlayer()?.kind === "human";
  const feedbackText = () => {
    if (!game()) return loadError() || "Loading the word list…";
    const feedback = game()?.lastFeedback;
    if (!feedback) return "Type a word that contains the fragment.";
    switch (feedback.kind) {
      case "invalid":
        return feedback.playerId === "you"
          ? `“${feedback.word}” is not in the dictionary for this fragment.`
          : `${game()?.players.find(({ id }) => id === feedback.playerId)?.name} missed.`;
      case "reused":
        return `“${feedback.word}” has already been used this game.`;
      case "timeout":
        return `${game()?.players.find(({ id }) => id === feedback.playerId)?.name} ran out of time.`;
      case "eliminated":
        return `${game()?.players.find(({ id }) => id === feedback.playerId)?.name} is out.`;
      case "valid":
        return `${game()?.players.find(({ id }) => id === feedback.playerId)?.name} played ${feedback.word}.`;
    }
  };

  return (
    <main class="page" data-tea="black">
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
        <div class="theme-strip" aria-hidden="true">
          <For each={teaThemes}>
            {(theme) => <span class={`theme-dot ${theme}`} title={`${theme} tea`} />}
          </For>
        </div>
      </header>

      <section class="game-layout" aria-label="Black Tea game">
        <div class="game-column">
          <div class="round-heading">
            <div>
              <p class="eyebrow">Solo mode · Black Tea</p>
              <h2>Keep the word moving.</h2>
            </div>
            <span class="live-pill">
              <span /> {game()?.status === "finished" ? "GAME OVER" : "LIVE ROUND"}
            </span>
          </div>

          <section class="fragment-card" aria-live="polite">
            <div class="fragment-label">Find a word containing</div>
            <div class="fragment" role="status" aria-label={`Fragment ${game()?.fragment ?? "—"}`}>
              {game()?.fragment ?? "…"}
            </div>
            <div class="fragment-footer">
              <span>Turn {game()?.turnNumber ?? 0}</span>
              <span>{game()?.usedWords.length ?? 0} words played</span>
            </div>
          </section>

          <section class="timer-panel" aria-label="Turn countdown">
            <div class="timer-topline">
              <span>
                {isHumanTurn() ? "Your turn" : `${currentPlayer()?.name ?? "Waiting"}'s turn`}
              </span>
              <strong>
                {formatSeconds(remainingMs())}
                <small>s</small>
              </strong>
            </div>
            <div
              class="timer-track"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax={game()?.turnDurationMs ?? 0}
              aria-valuenow={remainingMs()}
            >
              <div
                class="timer-fill"
                classList={{ urgent: remainingMs() <= 3_000 }}
                style={{ width: timerWidth() }}
              />
            </div>
            <div class="timer-caption">
              <span>Time shrinks after every turn</span>
              <span>Min. 5 seconds</span>
            </div>
          </section>

          <form class="answer-form" onSubmit={submitWord}>
            <label for="word-entry">Your word</label>
            <div class="input-wrap">
              <input
                ref={inputRef}
                id="word-entry"
                type="text"
                autocomplete="off"
                autocapitalize="none"
                spellcheck={false}
                placeholder={isHumanTurn() ? "Type fast…" : "Bots are thinking…"}
                value={entry()}
                onInput={(event) => setEntry(event.currentTarget.value)}
                readonly={!isHumanTurn() || game()?.status !== "playing"}
                aria-describedby="feedback"
              />
              <button
                class="submit-button"
                type="submit"
                disabled={!isHumanTurn() || game()?.status !== "playing"}
              >
                Enter <span aria-hidden="true">↵</span>
              </button>
            </div>
            <p
              class="feedback"
              classList={{
                error: game()?.lastFeedback?.kind === "invalid",
                reused: game()?.lastFeedback?.kind === "reused",
                success: game()?.lastFeedback?.kind === "valid",
              }}
              id="feedback"
              aria-live="polite"
            >
              {feedbackText()}
            </p>
          </form>

          <div class="game-actions">
            <button class="restart-button" type="button" onClick={startGame}>
              Restart game
            </button>
            <p>Words cannot be reused. Two missed turns and you’re out.</p>
          </div>

          {game()?.status === "finished" && (
            <div class="winner-banner" role="status">
              <span aria-hidden="true">✦</span>
              <strong>
                {game()?.players.find(({ id }) => id === game()?.winnerId)?.name} wins the pot.
              </strong>
            </div>
          )}
        </div>

        <aside class="side-column">
          <section class="players-card">
            <div class="card-heading">
              <div>
                <p class="eyebrow">At the table</p>
                <h3>Players</h3>
              </div>
              <span class="player-count">{game()?.players.length ?? 0}</span>
            </div>
            <ul class="player-list">
              <For each={game()?.players ?? []}>
                {(player) => (
                  <li
                    class="player-row"
                    classList={{
                      active: game()?.currentPlayerId === player.id,
                      eliminated: !player.alive,
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
                      <span class="hp-pips" role="img" aria-label={`${player.hp} hit points`}>
                        <For
                          each={Array.from(
                            { length: game()?.config.initialHp ?? 0 },
                            (_, index) => index,
                          )}
                        >
                          {(index) => <i classList={{ spent: index >= player.hp }} />}
                        </For>
                      </span>
                      <small>{player.points} pt</small>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </section>

          <section class="settings-card">
            <div class="card-heading">
              <div>
                <p class="eyebrow">Make it yours</p>
                <h3>Game settings</h3>
              </div>
              <span class="settings-icon" aria-hidden="true">
                ⚙
              </span>
            </div>
            <label class="setting-control">
              <span>
                <strong>Tea bots</strong>
                <small>Compete against 1 to 3 bots</small>
              </span>
              <select
                value={botCount()}
                onChange={(event) => setBotCount(Number(event.currentTarget.value))}
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </label>
            <label class="setting-control skill-control">
              <span>
                <strong>Bot skill</strong>
                <small>Speed and accuracy</small>
              </span>
              <output>{Math.round(botSkill() * 100)}%</output>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={botSkill()}
                onInput={(event) => setBotSkill(Number(event.currentTarget.value))}
              />
            </label>
            <button class="apply-button" type="button" onClick={startGame}>
              Apply and restart
            </button>
          </section>

          <section class="rules-card">
            <span class="rules-star" aria-hidden="true">
              ✦
            </span>
            <div>
              <h3>Black Tea rules</h3>
              <p>
                Play a valid word before the timer runs out. Miss twice and you’re eliminated. Last
                player standing wins.
              </p>
            </div>
          </section>
        </aside>
      </section>

      <footer class="footer">
        <span>BREWED FOR WORD LOVERS</span>
        <span>
          One fragment at a time <i>✳</i>
        </span>
      </footer>
    </main>
  );
}
