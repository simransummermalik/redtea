import type { GamePlayer, MixConfig } from "@redtea/engine";
import {
  defaultBlackConfig,
  defaultGreenConfig,
  defaultMixConfig,
  defaultRedConfig,
  defaultYellowConfig,
} from "@redtea/engine";
import { clientMessageSchema } from "@redtea/protocol";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import blackTeaFox from "./assets/black-tea-fox.svg";
import babyFoxPortrait from "./assets/fox-face-portrait-baby.svg";
import middleAgedFoxPortrait from "./assets/fox-face-portrait-middle-aged.svg";
import nervousFoxPortrait from "./assets/fox-face-portrait-nervous.svg";
import scaredFoxPortrait from "./assets/fox-face-portrait-scared.svg";
import foxFacePortrait from "./assets/fox-face-portrait-static.svg";
import veryOldFoxPortrait from "./assets/fox-face-portrait-very-old.svg";
import foxesThree from "./assets/foxes-three.svg";
import foxesTwo from "./assets/foxes-two.svg";
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
import { type EffectPulse, GameScreen } from "./game/GameScreen";
import { loadWordCatalog } from "./gameData";
import { ToastViewport, useToast } from "./Toast";
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

const mixTeas = [
  { id: "black", label: "Black", tint: "#354536" },
  { id: "green", label: "Green", tint: "#3f805a" },
  { id: "red", label: "Red", tint: "#b94f48" },
  { id: "yellow", label: "Yellow", tint: "#b98527" },
] as const;

function TeaSettings(props: {
  mode: TeaMode;
  settings: UiModeConfig;
  disabled?: boolean;
  onYellowIgnoreChange: (value: boolean) => void;
  onMixChange: <Key extends keyof MixConfig>(key: Key, value: MixConfig[Key]) => void;
}) {
  const mix = () => props.settings.mixConfig ?? defaultMixConfig;
  const setSeconds = (
    key: "blackTimeMs" | "greenTimeMs" | "redTimeMs" | "yellowTimeMs",
    value: string,
  ) =>
    props.onMixChange(
      key,
      value === "" ? 0 : Math.max(1_000, Math.min(120_000, Number(value) * 1_000)),
    );

  return (
    <Show when={props.mode === "yellow" || props.mode === "mix"}>
      <Show when={props.mode === "yellow"}>
        <label class="settings-toggle-row">
          <span>Ignore invalid words</span>
          <span class="settings-toggle-value">
            {props.settings.ignoreInvalidWords ? "Yes" : "No"}
          </span>
          <input
            class="settings-toggle"
            type="checkbox"
            aria-label="Ignore invalid words"
            checked={props.settings.ignoreInvalidWords}
            disabled={props.disabled}
            onChange={(event) => props.onYellowIgnoreChange(event.currentTarget.checked)}
          />
        </label>
      </Show>
      <Show when={props.mode === "mix"}>
        <fieldset class="mix-settings-group">
          <legend>Teas in the mix</legend>
          <p class="settings-help">Choose which challenges can come up. Keep at least one.</p>
          <div class="mix-tea-options">
            <For each={mixTeas}>
              {(tea) => {
                const enabledKey = `${tea.id}Enabled` as const;
                return (
                  <label class="mix-tea-option" style={{ "--tea-choice": tea.tint }}>
                    <input
                      type="checkbox"
                      checked={mix()[enabledKey]}
                      disabled={props.disabled}
                      onChange={(event) =>
                        props.onMixChange(enabledKey, event.currentTarget.checked)
                      }
                    />
                    <span>{tea.label}</span>
                  </label>
                );
              }}
            </For>
          </div>
        </fieldset>
        <fieldset class="mix-settings-group">
          <legend>Round rhythm</legend>
          <label class="settings-row">
            <span>Starting hearts</span>
            <input
              class="settings-number"
              aria-label="Starting hearts"
              type="number"
              min="1"
              max="10"
              value={mix().baseHp}
              disabled={props.disabled}
              onInput={(event) =>
                props.onMixChange(
                  "baseHp",
                  Math.max(1, Math.min(10, Number(event.currentTarget.value) || 1)),
                )
              }
            />
          </label>
          <label class="settings-row">
            <span>Break between teas (sec)</span>
            <input
              class="settings-number"
              aria-label="Break between teas in seconds"
              type="number"
              min="0"
              max="10"
              value={mix().intermissionMs / 1_000}
              disabled={props.disabled}
              onInput={(event) =>
                props.onMixChange(
                  "intermissionMs",
                  Math.max(0, Math.min(10_000, Number(event.currentTarget.value) * 1_000 || 0)),
                )
              }
            />
          </label>
          <label class="settings-toggle-row">
            <span>Avoid the same tea twice</span>
            <span class="settings-toggle-value">{mix().avoidImmediateRepeat ? "Yes" : "No"}</span>
            <input
              class="settings-toggle"
              type="checkbox"
              aria-label="Avoid the same tea twice in a row"
              checked={mix().avoidImmediateRepeat}
              disabled={props.disabled}
              onChange={(event) =>
                props.onMixChange("avoidImmediateRepeat", event.currentTarget.checked)
              }
            />
          </label>
          <label class="settings-toggle-row">
            <span>Ignore invalid words in Yellow</span>
            <span class="settings-toggle-value">{mix().ignoreInvalidWords ? "Yes" : "No"}</span>
            <input
              class="settings-toggle"
              type="checkbox"
              aria-label="Ignore invalid words in Mix Yellow rounds"
              checked={mix().ignoreInvalidWords}
              disabled={props.disabled}
              onChange={(event) =>
                props.onMixChange("ignoreInvalidWords", event.currentTarget.checked)
              }
            />
          </label>
        </fieldset>
        <fieldset class="mix-settings-group">
          <legend>Per-tea tweaks</legend>
          <p class="settings-help">Leave a time blank to use the shared round time.</p>
          <For each={mixTeas}>
            {(tea) => {
              const timeKey = `${tea.id}TimeMs` as const;
              const pointsKey = `${tea.id}Points` as const;
              return (
                <div class="mix-tea-tweak">
                  <strong>{tea.label} tea</strong>
                  <label class="settings-row">
                    <span>Time override (sec)</span>
                    <input
                      class="settings-number"
                      aria-label={`${tea.label} tea time override in seconds`}
                      type="number"
                      min="1"
                      max="120"
                      placeholder="Shared"
                      value={mix()[timeKey] === 0 ? "" : mix()[timeKey] / 1_000}
                      disabled={props.disabled}
                      onInput={(event) => setSeconds(timeKey, event.currentTarget.value)}
                    />
                  </label>
                  <label class="settings-row">
                    <span>Points earned</span>
                    <input
                      class="settings-number"
                      aria-label={`${tea.label} tea points earned`}
                      type="number"
                      min="0"
                      max="10"
                      value={mix()[pointsKey]}
                      disabled={props.disabled}
                      onInput={(event) =>
                        props.onMixChange(
                          pointsKey,
                          Math.max(0, Math.min(10, Number(event.currentTarget.value) || 0)),
                        )
                      }
                    />
                  </label>
                </div>
              );
            }}
          </For>
        </fieldset>
      </Show>
    </Show>
  );
}

function hasMixTea(config: MixConfig): boolean {
  return mixTeas.some(({ id }) => config[`${id}Enabled`]);
}

export function App() {
  const toast = useToast();
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
  const [pulse, setPulse] = createSignal<EffectPulse>({ seq: 0, effects: [] });
  const [dictionaryStatus, setDictionaryStatus] = createSignal<"loading" | "ready" | "error">(
    "loading",
  );
  const [dictionaryError, setDictionaryError] = createSignal("");
  const [copyCelebration, setCopyCelebration] = createSignal(false);
  const [wordCatalog, setWordCatalog] = createSignal<Awaited<
    ReturnType<typeof loadWordCatalog>
  > | null>(null);
  let inputRef: HTMLInputElement | HTMLTextAreaElement | undefined;
  let unsubscribeActive = () => {};
  let dictionaryToastId: number | undefined;
  let copyCelebrationTimeout: number | undefined;
  let copyCelebrationFrame: number | undefined;

  const config = () => configs()[mode()];
  const botAbilityFox = () => {
    const skill = config().botSkill;
    if (skill >= 0.75) return scaredFoxPortrait;
    if (skill >= 0.4) return nervousFoxPortrait;
    return foxFacePortrait;
  };
  const timeSeconds = () =>
    (mode() === "mix"
      ? (config().mixConfig?.roundTimeMs ?? config().roundTimeMs)
      : config().roundTimeMs) / 1_000;
  const timeFox = () => {
    const seconds = timeSeconds();
    if (seconds >= 75) return veryOldFoxPortrait;
    if (seconds >= 45) return middleAgedFoxPortrait;
    if (seconds >= 20) return foxFacePortrait;
    return babyFoxPortrait;
  };
  const botCountFox = () => {
    if (config().botCount >= 3) return foxesThree;
    if (config().botCount >= 2) return foxesTwo;
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

  function subscribeConnection(active: GameConnection): void {
    unsubscribeActive();
    unsubscribeActive = active.subscribe((update) => {
      setClock(update.now);
      setGame(update.game);
      setRoom(update.room);
      if (update.room) setShowModeIntro(false);
      setLobbyError(update.error ?? "");
      setConnectionState(update.connectionState);
      if (update.effects.length)
        setPulse((previous) => ({ seq: previous.seq + 1, effects: update.effects }));
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

  async function loadDictionary(): Promise<void> {
    setDictionaryStatus("loading");
    setDictionaryError("");
    if (dictionaryToastId !== undefined) toast.dismiss(dictionaryToastId);
    dictionaryToastId = toast.notify("Warming the kettle… loading the word list.", {
      kind: "info",
      durationMs: 0,
    });
    try {
      const catalog = await loadWordCatalog();
      setWordCatalog(catalog);
      setDictionaryStatus("ready");
      if (dictionaryToastId !== undefined) toast.dismiss(dictionaryToastId);
      dictionaryToastId = undefined;
    } catch (error) {
      const message =
        error instanceof Error && error.message !== "Failed to fetch"
          ? error.message
          : "Could not reach the tea dictionary. Check your connection and try again.";
      setDictionaryError(message);
      setDictionaryStatus("error");
      if (dictionaryToastId !== undefined) toast.dismiss(dictionaryToastId);
      dictionaryToastId = toast.notify(`The dictionary couldn’t load. ${message}`, {
        kind: "error",
        action: { label: "Try again", run: () => void loadDictionary() },
      });
    }
  }

  async function copyRoomCode(): Promise<void> {
    const code = room()?.room.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopyCelebration(false);
      if (copyCelebrationFrame !== undefined) cancelAnimationFrame(copyCelebrationFrame);
      copyCelebrationFrame = requestAnimationFrame(() => setCopyCelebration(true));
      if (copyCelebrationTimeout !== undefined) window.clearTimeout(copyCelebrationTimeout);
      copyCelebrationTimeout = window.setTimeout(() => {
        setCopyCelebration(false);
        copyCelebrationTimeout = undefined;
      }, 1_000);
    } catch {
      toast.notify("Couldn’t copy automatically. Select the room code and copy it manually.", {
        kind: "error",
      });
    }
  }

  function leaveRoom(): void {
    connection().close();
    const local = new LocalConnection();
    setConnection(local);
    setRoom(undefined);
    setGame(null);
    subscribeConnection(local);
  }

  function backToSetup(): void {
    leaveRoom();
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
    void loadDictionary();
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
      if (copyCelebrationTimeout !== undefined) window.clearTimeout(copyCelebrationTimeout);
      if (copyCelebrationFrame !== undefined) cancelAnimationFrame(copyCelebrationFrame);
      unsubscribeActive();
    });
  });

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

  return (
    <main
      class="page"
      classList={{
        "mode-intro-page": !game() && showModeIntro() && !room(),
        "party-page": !game() && (!showModeIntro() || Boolean(room())),
        "brew-page": Boolean(game()),
      }}
      data-tea={teaTheme()}
    >
      <Show
        when={!game()}
        fallback={
          <GameScreen
            game={game() as AnyGameState}
            room={room()}
            selfId={connection().playerId()}
            clock={clock()}
            entry={entry()}
            onEntry={setEntry}
            onSubmit={submit}
            inputRef={(element) => {
              inputRef = element;
            }}
            connectionState={connectionState()}
            notice={lobbyError()}
            pulse={pulse()}
            onLeave={backToSetup}
            onPlayAgain={room() ? undefined : startGame}
          />
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
                disabled={
                  dictionaryStatus() !== "ready" ||
                  (mode() === "mix" && !hasMixTea(config().mixConfig ?? defaultMixConfig))
                }
                onClick={startGame}
              >
                {dictionaryStatus() === "loading"
                  ? "Loading words…"
                  : dictionaryStatus() === "error"
                    ? "Start unavailable"
                    : "Start"}{" "}
                <span aria-hidden="true">→</span>
              </button>
              <Show when={dictionaryStatus() === "error"}>
                <div class="dictionary-feedback" role="status">
                  <span>{dictionaryError()}</span>
                  <button type="button" onClick={() => void loadDictionary()}>
                    Try again
                  </button>
                </div>
              </Show>
              <Show when={mode() === "mix" && !hasMixTea(config().mixConfig ?? defaultMixConfig)}>
                <p class="dictionary-feedback" role="status">
                  Choose at least one tea in Settings to start Mix.
                </p>
              </Show>
              <button
                class="multiplayer-intro-button"
                type="button"
                onClick={() => setShowModeIntro(false)}
              >
                Play with friends
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
                        <span>Time</span>
                        <img src={timeFox()} alt="" aria-hidden="true" />
                        <output>{Math.round(timeSeconds())} sec</output>
                      </span>
                      <input
                        class="settings-range"
                        aria-label="Time in seconds"
                        type="range"
                        min={mode() === "black" ? 5 : 1}
                        max="120"
                        step="1"
                        value={timeSeconds()}
                        style={`--range-fox: url(${timeFox()})`}
                        onInput={(event) => updateRoundTime(Number(event.currentTarget.value))}
                      />
                    </label>
                    <label class="settings-slider-row">
                      <span class="settings-range-heading">
                        <span>Bots</span>
                        <img src={botCountFox()} alt="" aria-hidden="true" />
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
                        style={`--range-fox: url(${botCountFox()})`}
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
                        style={`--range-fox: url(${botAbilityFox()})`}
                        onInput={(event) =>
                          updateConfig("botSkill", Number(event.currentTarget.value))
                        }
                      />
                    </label>
                    <Show when={mode() !== "black"}>
                      <label class="settings-row">
                        <span>Points to win</span>
                        <input
                          class="settings-number"
                          aria-label="Points to win"
                          type="number"
                          min="1"
                          max="99"
                          value={
                            mode() === "mix"
                              ? (config().mixConfig?.pointsToWin ?? defaultMixConfig.pointsToWin)
                              : config().pointsToWin
                          }
                          onInput={(event) => updatePointsTarget(Number(event.currentTarget.value))}
                        />
                      </label>
                    </Show>
                    <Show when={mode() === "red" || mode() === "yellow" || mode() === "mix"}>
                      <label class="settings-toggle-row">
                        <span>Allow word reuse</span>
                        <span class="settings-toggle-value">
                          {(
                            mode() === "mix"
                              ? (config().mixConfig?.reuseWordsPerTea ?? false)
                              : config().allowWordReuse
                          )
                            ? "Yes"
                            : "No"}
                        </span>
                        <input
                          class="settings-toggle"
                          aria-label="Allow word reuse"
                          type="checkbox"
                          checked={
                            mode() === "mix"
                              ? (config().mixConfig?.reuseWordsPerTea ?? false)
                              : config().allowWordReuse
                          }
                          onChange={(event) => {
                            const allowReuse = event.currentTarget.checked;
                            if (mode() === "mix") changeMixSetting("reuseWordsPerTea", allowReuse);
                            else updateConfig("allowWordReuse", allowReuse);
                          }}
                        />
                      </label>
                    </Show>
                    <TeaSettings
                      mode={mode()}
                      settings={config()}
                      onYellowIgnoreChange={(value) => updateConfig("ignoreInvalidWords", value)}
                      onMixChange={changeMixSetting}
                    />
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
          <section class="party-screen" aria-label="Play with friends">
            <button
              class="party-back-button"
              type="button"
              onClick={room() ? leaveRoom : () => setShowModeIntro(true)}
            >
              <span aria-hidden="true">←</span> {room() ? "Leave table" : "Back to tea"}
            </button>
            <header class="party-heading">
              <h1>{room() ? "Your table is ready." : "Gather around the table."}</h1>
              <p>
                {room()
                  ? "Invite a friend to join your game."
                  : "Start a room for your friends, or join one with a code."}
              </p>
            </header>

            <Show
              when={!room()}
              fallback={
                <section class="party-lobby" aria-label="Room lobby">
                  <div class="party-room-code">
                    <span>ROOM CODE · SHARE WITH FRIENDS</span>
                    <strong>{room()?.room.code}</strong>
                    <button
                      class="copy-room-code"
                      type="button"
                      onClick={() => void copyRoomCode()}
                    >
                      <Show when={copyCelebration()}>
                        <img
                          class="copy-room-fox"
                          src={foxFacePortrait}
                          alt=""
                          aria-hidden="true"
                        />
                      </Show>
                      Copy code <span aria-hidden="true">✳</span>
                    </button>
                  </div>
                  <Show when={connectionState() === "reconnecting"}>
                    <p class="party-notice" role="status">
                      Reconnecting to your room…
                    </p>
                  </Show>
                  <Show when={room()?.room.phase === "countdown"}>
                    <div class="party-countdown" role="status" aria-live="polite">
                      <strong>
                        Starting in{" "}
                        {Math.max(
                          0,
                          Math.ceil(((room()?.room.countdownEndsAt ?? clock()) - clock()) / 1_000),
                        )}{" "}
                        seconds
                      </strong>
                      <span>There’s still time to pull up a seat.</span>
                    </div>
                  </Show>
                  <div class="party-seats-heading">
                    <span>At the table</span>
                    <small>{room()?.players.length ?? 0} seats</small>
                  </div>
                  <ul class="party-seats">
                    <For each={room()?.players ?? []}>
                      {(player) => (
                        <li classList={{ "party-seat-disconnected": !player.connected }}>
                          <span class="party-seat-mark" aria-hidden="true">
                            ✳
                          </span>
                          <span class="party-seat-name">
                            {player.name}
                            <Show when={player.id === room()?.room.hostId}>
                              <small>HOST</small>
                            </Show>
                          </span>
                          <span class="party-seat-status">
                            {!player.connected ? "Away" : player.ready ? "Ready" : "At the table"}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>

                  <Show when={connection().playerId() !== room()?.room.hostId}>
                    <button
                      class="party-primary-button"
                      type="button"
                      disabled={connectionState() !== "connected"}
                      onClick={() =>
                        connection().setReady(
                          !(
                            room()?.players.find((player) => player.id === connection().playerId())
                              ?.ready ?? false
                          ),
                        )
                      }
                    >
                      {room()?.players.find((player) => player.id === connection().playerId())
                        ?.ready
                        ? "I’m ready · change"
                        : "I’m ready"}
                    </button>
                  </Show>
                  <Show when={connection().playerId() === room()?.room.hostId}>
                    <details class="party-options">
                      <summary>
                        Table settings <span>Change tea, bots and round length</span>
                      </summary>
                      <div class="party-options-grid">
                        <label>
                          Tea
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
                              {(tea) => <option value={tea.id}>{tea.label} Tea</option>}
                            </For>
                          </select>
                        </label>
                        <label>
                          Bot seats
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
                        <Show when={(room()?.room.mode ?? mode()) !== "black"}>
                          <label>
                            Points to win
                            <input
                              type="number"
                              disabled={connectionState() !== "connected"}
                              min="1"
                              max="99"
                              value={
                                (room()?.room.mode ?? mode()) === "mix"
                                  ? (configs().mix.mixConfig?.pointsToWin ??
                                    defaultMixConfig.pointsToWin)
                                  : configs()[room()?.room.mode ?? mode()].pointsToWin
                              }
                              onChange={(event) => {
                                const target = room()?.room.mode ?? mode();
                                const points = Math.max(
                                  1,
                                  Math.min(99, Number(event.currentTarget.value) || 1),
                                );
                                if (target === "mix") changeMixSetting("pointsToWin", points);
                                else changeRoomSetting(target, "pointsToWin", points);
                              }}
                            />
                          </label>
                        </Show>
                        <Show when={(room()?.room.mode ?? mode()) !== "black"}>
                          <label>
                            {(room()?.room.mode ?? mode()) === "mix"
                              ? "Shared seconds per round"
                              : "Seconds per turn / round"}
                            <input
                              type="number"
                              disabled={connectionState() !== "connected"}
                              min="1"
                              max="120"
                              value={
                                (room()?.room.mode ?? mode()) === "mix"
                                  ? (configs().mix.mixConfig?.roundTimeMs ??
                                      defaultMixConfig.roundTimeMs) / 1_000
                                  : configs()[room()?.room.mode ?? mode()].roundTimeMs / 1_000
                              }
                              onChange={(event) => {
                                const target = room()?.room.mode ?? mode();
                                const time = Math.max(
                                  1_000,
                                  Math.min(
                                    120_000,
                                    Number(event.currentTarget.value) * 1_000 || 1_000,
                                  ),
                                );
                                if (target === "mix") changeMixSetting("roundTimeMs", time);
                                else changeRoomSetting(target, "roundTimeMs", time);
                              }}
                            />
                          </label>
                        </Show>
                        <TeaSettings
                          mode={room()?.room.mode ?? mode()}
                          settings={configs()[room()?.room.mode ?? mode()]}
                          disabled={connectionState() !== "connected"}
                          onYellowIgnoreChange={(value) =>
                            changeRoomSetting(
                              room()?.room.mode ?? mode(),
                              "ignoreInvalidWords",
                              value,
                            )
                          }
                          onMixChange={changeMixSetting}
                        />
                      </div>
                    </details>
                    <Show
                      when={
                        (room()?.room.mode ?? mode()) === "mix" &&
                        !hasMixTea(configs().mix.mixConfig ?? defaultMixConfig)
                      }
                    >
                      <p class="party-notice" role="status">
                        Choose at least one tea in Table settings before starting Mix.
                      </p>
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
                      <p class="party-notice" role="status">
                        Mix needs at least two connected players or bots. Add a player or a bot
                        before starting.
                      </p>
                    </Show>
                    <button
                      class="party-primary-button"
                      type="button"
                      onClick={() => connection().startRoom()}
                      disabled={
                        room()?.room.phase === "countdown" ||
                        connectionState() !== "connected" ||
                        ((room()?.room.mode ?? mode()) === "mix" &&
                          (!hasMixTea(configs().mix.mixConfig ?? defaultMixConfig) ||
                            (room()?.players.filter(
                              (player) => player.connected && player.kind === "human",
                            ).length ?? 0) +
                              (room()?.room.botCount ?? 0) <
                              2))
                      }
                    >
                      {room()?.room.phase === "countdown" ? "Starting soon…" : "Start game →"}
                    </button>
                  </Show>
                  <Show when={lobbyError()}>
                    <p class="party-error" role="alert">
                      {lobbyError()}
                    </p>
                  </Show>
                </section>
              }
            >
              <section class="party-entry" aria-label="Create or join a room">
                <label class="party-name-field">
                  Your name
                  <input
                    value={name()}
                    maxlength="24"
                    onInput={(event) => setName(event.currentTarget.value)}
                  />
                </label>
                <button
                  class="party-primary-button"
                  type="button"
                  disabled={connectionState() !== "connected"}
                  onClick={() => startRoomConnection(true)}
                >
                  Create a room <span>→</span>
                </button>
                <div class="party-join-row">
                  <label>
                    Have a room code?
                    <input
                      aria-label="Room code"
                      disabled={connectionState() !== "connected"}
                      placeholder="ABCDE"
                      maxlength="5"
                      value={roomCodeEntry()}
                      onInput={(event) => setRoomCodeEntry(event.currentTarget.value.toUpperCase())}
                    />
                  </label>
                  <button
                    class="party-secondary-button"
                    type="button"
                    disabled={roomCodeEntry().length !== 5 || connectionState() !== "connected"}
                    onClick={() => startRoomConnection(false)}
                  >
                    Join
                  </button>
                </div>
                <Show when={connectionState() === "reconnecting"}>
                  <p class="party-notice" role="status">
                    Reconnecting to your room…
                  </p>
                </Show>
                <Show when={lobbyError()}>
                  <p class="party-error" role="alert">
                    {lobbyError()}
                  </p>
                </Show>
              </section>
            </Show>
          </section>
        </Show>
      </Show>
      <ToastViewport />
    </main>
  );
}
