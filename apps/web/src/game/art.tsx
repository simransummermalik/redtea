import { For, Show } from "solid-js";

/** Hand-drawn SVG pieces for the in-game screen. Every piece uses the same ink outline as the intro foxes. */

const INK = "#4a2a24";
const FUR = "#ef8a45";
const CREAM = "#fff2e0";
const PAW = "#5a3222";
const PAPER = "#fff6e6";

export type FoxMood = "calm" | "worried" | "panic" | "happy" | "oops" | "sealed" | "sad" | "party";

/* ------------------------------------------------------------------ */
/* Fox head (drawn in a 680-wide space so it lines up with the intro)  */
/* ------------------------------------------------------------------ */

function FoxEyes(props: { mood: FoxMood }) {
  return (
    <>
      <Show when={props.mood === "calm" || props.mood === "worried" || props.mood === "sad"}>
        <g class="fox-blink">
          <ellipse cx="292" cy="180" rx="21" ry="25" fill="#2b1714" />
          <ellipse cx="388" cy="180" rx="21" ry="25" fill="#2b1714" />
          <ellipse cx="292" cy="192" rx="14" ry="10" fill="#6b3420" />
          <ellipse cx="388" cy="192" rx="14" ry="10" fill="#6b3420" />
          <path
            d="M280 197 Q292 205 304 197 M376 197 Q388 205 400 197"
            fill="none"
            stroke="#c8743a"
            stroke-width="3"
            stroke-linecap="round"
          />
          <circle cx="282" cy="168" r="8" fill="#fff" />
          <circle cx="378" cy="168" r="8" fill="#fff" />
          <circle cx="300" cy="190" r="3.5" fill="#fff" />
          <circle cx="396" cy="190" r="3.5" fill="#fff" />
          <path
            d="M274 167 L265 160 M406 167 L415 160"
            fill="none"
            stroke={INK}
            stroke-width="3"
            stroke-linecap="round"
          />
        </g>
      </Show>
      <Show when={props.mood === "worried"}>
        <path
          d="M266 146 L306 133 M414 146 L374 133"
          fill="none"
          stroke={INK}
          stroke-width="5"
          stroke-linecap="round"
        />
      </Show>
      <Show when={props.mood === "panic"}>
        <g class="fox-jitter">
          <circle cx="292" cy="178" r="27" fill="#fff" stroke={INK} stroke-width="4.5" />
          <circle cx="388" cy="178" r="27" fill="#fff" stroke={INK} stroke-width="4.5" />
          <circle cx="294" cy="182" r="7" fill="#2b1714" />
          <circle cx="386" cy="182" r="7" fill="#2b1714" />
        </g>
        <path
          d="M262 140 L304 150 M418 140 L376 150"
          fill="none"
          stroke={INK}
          stroke-width="5"
          stroke-linecap="round"
        />
      </Show>
      <Show when={props.mood === "happy" || props.mood === "party"}>
        <path
          d="M270 190 Q292 160 314 190 M366 190 Q388 160 410 190"
          fill="none"
          stroke={INK}
          stroke-width="6.5"
          stroke-linecap="round"
        />
      </Show>
      <Show when={props.mood === "oops"}>
        <path
          d="M274 164 L308 180 L274 196 M406 164 L372 180 L406 196"
          fill="none"
          stroke={INK}
          stroke-width="6.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </Show>
      <Show when={props.mood === "sealed"}>
        <path
          d="M272 180 Q292 198 312 180 M368 180 Q388 198 408 180"
          fill="none"
          stroke={INK}
          stroke-width="6"
          stroke-linecap="round"
        />
        <path
          d="M272 180 L263 175 M408 180 L417 175"
          fill="none"
          stroke={INK}
          stroke-width="3"
          stroke-linecap="round"
        />
      </Show>
      <Show when={props.mood === "sad"}>
        <path
          d="M268 150 L306 158 M412 150 L374 158"
          fill="none"
          stroke={INK}
          stroke-width="4.5"
          stroke-linecap="round"
        />
        <path
          class="fox-tear"
          d="M276 206 C282 216 286 224 280 230 C274 236 264 230 266 222 C268 216 272 212 276 206 Z"
          fill="#9fd8f5"
          stroke={INK}
          stroke-width="2.5"
        />
        <path
          class="fox-tear fox-tear-late"
          d="M404 206 C410 216 414 224 408 230 C402 236 392 230 394 222 C396 216 400 212 404 206 Z"
          fill="#9fd8f5"
          stroke={INK}
          stroke-width="2.5"
        />
      </Show>
    </>
  );
}

function FoxMouth(props: { mood: FoxMood }) {
  return (
    <>
      <Show when={props.mood === "calm" || props.mood === "sealed" || props.mood === "worried"}>
        <path
          d="M340 223 L340 229 M331 229 Q335.5 235 340 229 Q344.5 235 349 229"
          fill="none"
          stroke={INK}
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </Show>
      <Show when={props.mood === "panic"}>
        <ellipse cx="340" cy="234" rx="10" ry="13" fill="#2b1714" />
        <ellipse cx="340" cy="240" rx="6" ry="4.5" fill="#f07c7c" />
      </Show>
      <Show when={props.mood === "happy" || props.mood === "party"}>
        <path
          d="M324 224 Q340 250 356 224 Z"
          fill="#2b1714"
          stroke={INK}
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <path d="M331 236 Q340 230 349 236 Q340 245 331 236 Z" fill="#f07c7c" />
      </Show>
      <Show when={props.mood === "oops"}>
        <path
          d="M324 232 Q329 225 334 232 Q339 239 344 232 Q349 225 356 232"
          fill="none"
          stroke={INK}
          stroke-width="3"
          stroke-linecap="round"
        />
      </Show>
      <Show when={props.mood === "sad"}>
        <path
          d="M327 236 Q340 224 353 236"
          fill="none"
          stroke={INK}
          stroke-width="3"
          stroke-linecap="round"
        />
      </Show>
    </>
  );
}

export function FoxHeadParts(props: { mood: FoxMood }) {
  return (
    <g class={`fox-head fox-mood-${props.mood}`}>
      <g class="fox-ear fox-ear-l">
        <path d="M258 140 C244 104, 232 62, 236 40 C262 46, 300 70, 322 100 Z" fill={FUR} />
        <path d="M266 128 C256 100, 248 72, 248 58 C268 66, 292 86, 306 104 Z" fill={CREAM} />
        <path
          d="M236 40 C262 46, 270 52, 276 58 Q256 60, 237 68 C236 58, 235 50, 236 40 Z"
          fill={PAW}
        />
        <path
          d="M258 140 C244 104, 232 62, 236 40 C262 46, 300 70, 322 100"
          fill="none"
          stroke={INK}
          stroke-width="3.5"
          stroke-linejoin="round"
        />
      </g>
      <g class="fox-ear fox-ear-r">
        <path d="M422 140 C436 104, 448 62, 444 40 C418 46, 380 70, 358 100 Z" fill={FUR} />
        <path d="M414 128 C424 100, 432 72, 432 58 C412 66, 388 86, 374 104 Z" fill={CREAM} />
        <path
          d="M444 40 C418 46, 410 52, 404 58 Q424 60, 443 68 C444 58, 445 50, 444 40 Z"
          fill={PAW}
        />
        <path
          d="M422 140 C436 104, 448 62, 444 40 C418 46, 380 70, 358 100"
          fill="none"
          stroke={INK}
          stroke-width="3.5"
          stroke-linejoin="round"
        />
      </g>
      <path
        d="M324 98 Q330 80 340 93 Q350 78 358 98 Z"
        fill={FUR}
        stroke={INK}
        stroke-width="3"
        stroke-linejoin="round"
      />
      <path
        d="M340 92 C400 92, 440 128, 442 172 C444 196, 438 210, 456 222 C442 226, 448 236, 434 240 C420 248, 380 252, 340 252 C300 252, 260 248, 246 240 C232 236, 238 226, 224 222 C242 210, 236 196, 238 172 C240 128, 280 92, 340 92 Z"
        fill={FUR}
      />
      <path
        d="M239 190 Q268 214, 300 206 C318 200, 326 186, 340 186 C354 186, 362 200, 380 206 Q412 214, 441 190 C442 200, 440 212, 456 222 C442 226, 448 236, 434 240 C420 248, 380 252, 340 252 C300 252, 260 248, 246 240 C232 236, 238 226, 224 222 C240 212, 238 200, 239 190 Z"
        fill={CREAM}
      />
      <path
        d="M340 92 C400 92, 440 128, 442 172 C444 196, 438 210, 456 222 C442 226, 448 236, 434 240 C420 248, 380 252, 340 252 C300 252, 260 248, 246 240 C232 236, 238 226, 224 222 C242 210, 236 196, 238 172 C240 128, 280 92, 340 92 Z"
        fill="none"
        stroke={INK}
        stroke-width="3.5"
        stroke-linejoin="round"
      />
      <path
        d="M324 112 Q328 120 332 124 M356 112 Q352 120 348 124"
        fill="none"
        stroke="#d66a33"
        stroke-width="3"
        stroke-linecap="round"
      />
      <FoxEyes mood={props.mood} />
      <g
        class="fox-blush"
        opacity={
          props.mood === "happy" || props.mood === "party" || props.mood === "sealed" ? 0.95 : 0.5
        }
      >
        <ellipse cx="262" cy="214" rx="15" ry="8" fill="#f4985e" />
        <ellipse cx="418" cy="214" rx="15" ry="8" fill="#f4985e" />
        <path
          d="M255 217 L258 211 M261 217 L264 211 M267 217 L270 211 M411 217 L414 211 M417 217 L420 211 M423 217 L426 211"
          fill="none"
          stroke="#e0773f"
          stroke-width="1.8"
          stroke-linecap="round"
        />
      </g>
      <path d="M330 210 Q340 206 350 210 Q349 220 340 223 Q331 220 330 210 Z" fill="#2b1714" />
      <ellipse cx="336" cy="211" rx="3" ry="1.6" fill="#fff" />
      <FoxMouth mood={props.mood} />
      <g fill="#c98b6a">
        <circle cx="318" cy="224" r="1.6" />
        <circle cx="313" cy="230" r="1.6" />
        <circle cx="321" cy="231" r="1.6" />
        <circle cx="362" cy="224" r="1.6" />
        <circle cx="367" cy="230" r="1.6" />
        <circle cx="359" cy="231" r="1.6" />
      </g>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Full sitting fox, local box roughly 0..200 x -30..250                */
/* ------------------------------------------------------------------ */

function Sparkle(props: { x: number; y: number; size?: number; delay?: number }) {
  return (
    <g transform={`translate(${props.x} ${props.y}) scale(${props.size ?? 1})`}>
      <path
        class="fox-sparkle"
        style={{ "animation-delay": `${props.delay ?? 0}s` }}
        d="M0 -11 Q2 -2 11 0 Q2 2 0 11 Q-2 2 -11 0 Q-2 -2 0 -11 Z"
        fill="#fff3a8"
        stroke={INK}
        stroke-width="2"
        stroke-linejoin="round"
      />
    </g>
  );
}

function SweatDrop(props: { x: number; y: number; delay?: number }) {
  return (
    <g transform={`translate(${props.x} ${props.y})`}>
      <path
        class="fox-sweat"
        style={{ "animation-delay": `${props.delay ?? 0}s` }}
        d="M0 -11 C6 -3 9 3 5 8 C1 12 -7 9 -7 2 C-6 -3 -3 -7 0 -11 Z"
        fill="#9fd8f5"
        stroke={INK}
        stroke-width="2.5"
        stroke-linejoin="round"
      />
    </g>
  );
}

export function Fox(props: { mood: FoxMood; scarf?: string }) {
  const armsUp = () => props.mood === "happy" || props.mood === "party";
  const scarf = () => props.scarf ?? "#3f8a83";
  return (
    <g class={`fox fox-mood-${props.mood}`}>
      <g class="fox-bounce">
        <g class="fox-tail">
          <path
            d="M132 232 C178 240 206 200 194 158 C186 132 162 122 150 136 C166 154 172 190 142 208 Z"
            fill={FUR}
          />
          <path
            d="M194 158 C186 132 162 122 150 136 C158 146 164 156 168 168 C177 167 187 163 194 158 Z"
            fill={CREAM}
          />
          <path
            d="M150 136 L158 142 L156 150 L164 154 L168 168"
            fill="none"
            stroke={INK}
            stroke-width="2"
            stroke-linejoin="round"
          />
          <path
            d="M132 232 C178 240 206 200 194 158 C186 132 162 122 150 136 C166 154 172 190 142 208"
            fill="none"
            stroke={INK}
            stroke-width="3.5"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        </g>
        <g class="fox-breath">
          <path
            d="M92 116 C58 116 40 156 38 196 C36 232 60 248 92 248 C124 248 148 232 146 196 C144 156 126 116 92 116 Z"
            fill={FUR}
            stroke={INK}
            stroke-width="3.5"
          />
          <path
            d="M92 136 C74 136 64 164 64 194 C64 226 78 240 92 240 C106 240 120 226 120 194 C120 164 110 136 92 136 Z"
            fill={CREAM}
          />
        </g>
        <ellipse cx="58" cy="218" rx="26" ry="24" fill={FUR} stroke={INK} stroke-width="3.5" />
        <ellipse cx="126" cy="218" rx="26" ry="24" fill={FUR} stroke={INK} stroke-width="3.5" />
        <path
          d="M38 210 Q44 202 54 203 M146 210 Q140 202 130 203"
          fill="none"
          stroke="#d66a33"
          stroke-width="3"
          stroke-linecap="round"
        />
        <ellipse cx="72" cy="244" rx="16" ry="9" fill={PAW} stroke={INK} stroke-width="3" />
        <ellipse cx="112" cy="244" rx="16" ry="9" fill={PAW} stroke={INK} stroke-width="3" />
        <path
          d="M67 238 L67 244 M77 238 L77 244 M107 238 L107 244 M117 238 L117 244"
          fill="none"
          stroke="#3a1f15"
          stroke-width="2"
          stroke-linecap="round"
        />
        <Show
          when={armsUp()}
          fallback={
            <g class="fox-arms-down">
              <ellipse
                cx="72"
                cy="174"
                rx="10"
                ry="24"
                fill={FUR}
                stroke={INK}
                stroke-width="3"
                transform="rotate(-14 72 174)"
              />
              <ellipse
                cx="112"
                cy="174"
                rx="10"
                ry="24"
                fill={FUR}
                stroke={INK}
                stroke-width="3"
                transform="rotate(14 112 174)"
              />
              <ellipse cx="78" cy="195" rx="10" ry="9" fill={PAW} stroke={INK} stroke-width="3" />
              <ellipse cx="106" cy="195" rx="10" ry="9" fill={PAW} stroke={INK} stroke-width="3" />
            </g>
          }
        >
          <g class="fox-arms-up">
            <ellipse
              cx="40"
              cy="140"
              rx="10"
              ry="24"
              fill={FUR}
              stroke={INK}
              stroke-width="3"
              transform="rotate(-50 40 140)"
            />
            <ellipse
              cx="144"
              cy="140"
              rx="10"
              ry="24"
              fill={FUR}
              stroke={INK}
              stroke-width="3"
              transform="rotate(50 144 140)"
            />
            <circle cx="22" cy="125" r="10" fill={PAW} stroke={INK} stroke-width="3" />
            <circle cx="162" cy="125" r="10" fill={PAW} stroke={INK} stroke-width="3" />
          </g>
        </Show>
        <path
          d="M44 120 C68 136 116 136 140 120 L144 132 C118 152 66 152 40 132 Z"
          fill={scarf()}
          stroke={INK}
          stroke-width="3"
          stroke-linejoin="round"
        />
        <path
          d="M56 134 L46 176 L64 179 L70 138 Z"
          fill={scarf()}
          stroke={INK}
          stroke-width="3"
          stroke-linejoin="round"
        />
        <path
          d="M49 178 L48 185 M55 179 L55 186 M61 180 L62 187 M52 150 L66 152 M50 162 L64 164"
          fill="none"
          stroke={INK}
          stroke-width="2.2"
          stroke-linecap="round"
          opacity="0.7"
        />
        <g transform="translate(-118.8 -24.8) scale(0.62)">
          <FoxHeadParts mood={props.mood} />
        </g>
        <Show when={props.mood === "party"}>
          <g class="fox-hat">
            <path
              d="M70 40 L94 -20 L116 38 Z"
              fill="#ffd166"
              stroke={INK}
              stroke-width="3"
              stroke-linejoin="round"
            />
            <path
              d="M78 22 L106 28 M84 6 L101 10"
              fill="none"
              stroke="#ef476f"
              stroke-width="4"
              stroke-linecap="round"
            />
            <circle cx="94" cy="-22" r="7.5" fill="#ef476f" stroke={INK} stroke-width="3" />
          </g>
        </Show>
      </g>
      <Show when={props.mood === "happy" || props.mood === "party"}>
        <Sparkle x={8} y={36} />
        <Sparkle x={182} y={22} size={0.8} delay={0.2} />
        <Sparkle x={188} y={92} size={0.6} delay={0.4} />
      </Show>
      <Show when={props.mood === "worried"}>
        <SweatDrop x={160} y={34} />
      </Show>
      <Show when={props.mood === "panic"}>
        <SweatDrop x={166} y={30} />
        <SweatDrop x={18} y={40} delay={0.3} />
        <SweatDrop x={176} y={70} delay={0.6} />
      </Show>
      <Show when={props.mood === "oops"}>
        <text class="fox-grumble" x="150" y="8">
          ?!
        </text>
      </Show>
      <Show when={props.mood === "sealed"}>
        <text class="fox-note" x="160" y="16">
          ♪
        </text>
        <text class="fox-note fox-note-late" x="178" y="40">
          ♫
        </text>
      </Show>
    </g>
  );
}

/** A small fox portrait for seats. */
export function FoxAvatar(props: { mood: FoxMood; scarf: string }) {
  return (
    <svg class="avatar-svg" viewBox="214 26 252 252" aria-hidden="true">
      <path
        d="M252 238 C286 262, 394 262, 428 238 L434 256 C398 290, 282 290, 246 256 Z"
        fill={props.scarf}
        stroke={INK}
        stroke-width="5"
        stroke-linejoin="round"
      />
      <FoxHeadParts mood={props.mood} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Teapot bots                                                          */
/* ------------------------------------------------------------------ */

export type BotMood = "idle" | "thinking" | "happy" | "hurt" | "out";

export function TeapotBot(props: { color: string; mood: BotMood }) {
  const led = () => (props.mood === "out" ? "#8b8f8c" : "#9ff5d4");
  return (
    <svg class={`avatar-svg teapot teapot-${props.mood}`} viewBox="0 0 120 112" aria-hidden="true">
      <g class="teapot-body">
        <line
          x1="58"
          y1="30"
          x2="58"
          y2="15"
          stroke={INK}
          stroke-width="3.5"
          stroke-linecap="round"
        />
        <circle
          class="teapot-bulb"
          cx="58"
          cy="11"
          r="6"
          fill="#ffe066"
          stroke={INK}
          stroke-width="3"
        />
        <path
          d="M28 66 C16 62 11 50 5 40 L13 35 C19 45 23 53 32 57 Z"
          fill={props.color}
          stroke={INK}
          stroke-width="3.5"
          stroke-linejoin="round"
        />
        <path
          d="M92 52 C113 50 115 86 90 85"
          fill="none"
          stroke={INK}
          stroke-width="12"
          stroke-linecap="round"
        />
        <path
          d="M92 52 C113 50 115 86 90 85"
          fill="none"
          stroke={props.color}
          stroke-width="5"
          stroke-linecap="round"
        />
        <ellipse cx="40" cy="104" rx="9" ry="5" fill={INK} />
        <ellipse cx="76" cy="104" rx="9" ry="5" fill={INK} />
        <ellipse
          cx="58"
          cy="70"
          rx="37"
          ry="31"
          fill={props.color}
          stroke={INK}
          stroke-width="3.5"
        />
        <path
          d="M30 52 Q58 40 86 52"
          fill="none"
          stroke="#fff"
          stroke-width="4"
          stroke-linecap="round"
          opacity="0.55"
        />
        <path
          d="M36 43 Q58 22 80 43 Z"
          fill={props.color}
          stroke={INK}
          stroke-width="3.5"
          stroke-linejoin="round"
        />
        <ellipse
          cx="58"
          cy="43"
          rx="25"
          ry="5.5"
          fill={props.color}
          stroke={INK}
          stroke-width="3"
        />
        <rect
          x="33"
          y="58"
          width="50"
          height="27"
          rx="11"
          fill="#2d211f"
          stroke={INK}
          stroke-width="3"
        />
        <Show when={props.mood === "idle"}>
          <g class="teapot-blink">
            <rect x="44" y="64" width="8" height="13" rx="4" fill={led()} />
            <rect x="64" y="64" width="8" height="13" rx="4" fill={led()} />
          </g>
        </Show>
        <Show when={props.mood === "thinking"}>
          <g class="teapot-look">
            <rect x="40" y="64" width="8" height="12" rx="4" fill={led()} />
            <rect x="60" y="64" width="8" height="12" rx="4" fill={led()} />
          </g>
        </Show>
        <Show when={props.mood === "happy"}>
          <path
            d="M42 75 Q48 63 54 75 M62 75 Q68 63 74 75"
            fill="none"
            stroke={led()}
            stroke-width="4"
            stroke-linecap="round"
          />
        </Show>
        <Show when={props.mood === "hurt"}>
          <path
            d="M42 65 L53 76 M53 65 L42 76 M63 65 L74 76 M74 65 L63 76"
            fill="none"
            stroke="#ff8a8a"
            stroke-width="3.5"
            stroke-linecap="round"
          />
        </Show>
        <Show when={props.mood === "out"}>
          <path
            d="M42 71 L53 71 M63 71 L74 71"
            fill="none"
            stroke={led()}
            stroke-width="3.5"
            stroke-linecap="round"
          />
          <path
            d="M70 41 L64 54 L72 60 L62 74 L68 84 L60 100"
            fill="none"
            stroke={INK}
            stroke-width="2.5"
            stroke-linejoin="round"
          />
        </Show>
        <circle cx="30" cy="84" r="4.5" fill="#ff9e9e" opacity="0.7" />
        <circle cx="86" cy="84" r="4.5" fill="#ff9e9e" opacity="0.7" />
      </g>
      <Show when={props.mood === "thinking"}>
        <g class="teapot-dots">
          <circle cx="80" cy="12" r="3.6" fill="#fff" stroke={INK} stroke-width="2" />
          <circle cx="91" cy="8" r="3.6" fill="#fff" stroke={INK} stroke-width="2" />
          <circle cx="102" cy="4" r="3.6" fill="#fff" stroke={INK} stroke-width="2" />
        </g>
      </Show>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Small tokens                                                         */
/* ------------------------------------------------------------------ */

export function Heart(props: { full: boolean }) {
  return (
    <svg
      class="heart-svg"
      classList={{ empty: !props.full }}
      viewBox="0 0 24 22"
      aria-hidden="true"
    >
      <path
        d="M12 20 C4 14 1 10 1 6.5 C1 3.5 3.5 1.5 6.3 1.5 C8.5 1.5 10.5 2.8 12 4.8 C13.5 2.8 15.5 1.5 17.7 1.5 C20.5 1.5 23 3.5 23 6.5 C23 10 20 14 12 20 Z"
        fill={props.full ? "#ef4f5f" : "none"}
        stroke={INK}
        stroke-width="2"
        stroke-linejoin="round"
        stroke-dasharray={props.full ? undefined : "3 2.5"}
      />
      <Show when={props.full}>
        <ellipse cx="7" cy="6" rx="2.6" ry="1.8" fill="#fff" opacity="0.8" />
      </Show>
      <Show when={!props.full}>
        <path d="M12 5 L10 9 L13 12 L11 17" fill="none" stroke={INK} stroke-width="1.6" />
      </Show>
    </svg>
  );
}

export function SugarCube(props: { full: boolean }) {
  return (
    <svg class="cube-svg" classList={{ empty: !props.full }} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5 L21.5 7.3 L12 12 L2.5 7.3 Z" fill={props.full ? "#fff" : "none"} />
      <path d="M2.5 7.3 L12 12 L12 21.8 L2.5 17 Z" fill={props.full ? "#f1e5cf" : "none"} />
      <path d="M21.5 7.3 L12 12 L12 21.8 L21.5 17 Z" fill={props.full ? "#ddc9a6" : "none"} />
      <path
        d="M12 2.5 L21.5 7.3 L21.5 17 L12 21.8 L2.5 17 L2.5 7.3 Z M2.5 7.3 L12 12 L21.5 7.3 M12 12 L12 21.8"
        fill="none"
        stroke={props.full ? INK : "currentColor"}
        stroke-width="1.7"
        stroke-linejoin="round"
        stroke-dasharray={props.full ? undefined : "2.5 2"}
      />
    </svg>
  );
}

export function Leaf(props: { color: string }) {
  return (
    <svg class="leaf-svg" viewBox="-16 -18 32 36" aria-hidden="true">
      <path
        d="M0 -14 C10 -7, 10 7, 0 14 C-10 7, -10 -7, 0 -14 Z"
        fill={props.color}
        stroke={INK}
        stroke-width="2"
      />
      <path d="M0 -11 L0 17" fill="none" stroke={INK} stroke-width="1.5" stroke-linecap="round" />
    </svg>
  );
}

/** Steaming cup that sits over the seat holding the turn in Black tea. */
export function HotCup() {
  return (
    <svg class="hot-cup" viewBox="0 0 48 44" aria-hidden="true">
      <path
        class="hot-steam"
        d="M18 14 C14 9 22 6 18 1"
        fill="none"
        stroke="#fff"
        stroke-width="2.6"
        stroke-linecap="round"
      />
      <path
        class="hot-steam hot-steam-late"
        d="M28 14 C24 9 32 6 28 1"
        fill="none"
        stroke="#fff"
        stroke-width="2.6"
        stroke-linecap="round"
      />
      <path
        d="M36 22 C46 21 46 33 35 32"
        fill="none"
        stroke={INK}
        stroke-width="6"
        stroke-linecap="round"
      />
      <path
        d="M36 22 C46 21 46 33 35 32"
        fill="none"
        stroke="#fff"
        stroke-width="2.5"
        stroke-linecap="round"
      />
      <path
        d="M8 17 L40 17 C40 30 34 38 24 38 C14 38 8 30 8 17 Z"
        fill="#fff"
        stroke={INK}
        stroke-width="3"
        stroke-linejoin="round"
      />
      <path d="M11 20 L37 20 C36 22 12 22 11 20 Z" fill="#ef4f5f" />
      <ellipse cx="24" cy="40" rx="18" ry="3.5" fill="#fff" stroke={INK} stroke-width="2.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* The giant glass mug                                                  */
/* ------------------------------------------------------------------ */

export const MUG = { width: 660, height: 470, cx: 290, full: 116, empty: 388 } as const;
const OUTER = "M128 80 L150 384 Q153 410 180 410 L400 410 Q427 410 430 384 L452 80";
const INSIDE = "M140 86 L161 380 Q164 398 186 398 L394 398 Q416 398 419 380 L440 86 Z";
const HANDLE = "M140 150 C58 136 48 306 154 304";

export function mugLevelY(fraction: number): number {
  const clamped = Math.max(0, Math.min(1, fraction));
  return MUG.empty - (MUG.empty - MUG.full) * clamped;
}

function innerHalfWidth(y: number): number {
  return 150 - ((y - 86) * 21) / 294;
}

const bubbles = [
  { x: 205, r: 5, d: 2.8, delay: 0 },
  { x: 250, r: 3.5, d: 2.2, delay: 0.9 },
  { x: 300, r: 6, d: 3.1, delay: 1.7 },
  { x: 338, r: 4, d: 2.5, delay: 0.4 },
  { x: 372, r: 3, d: 2, delay: 1.3 },
  { x: 228, r: 3, d: 2.4, delay: 2.1 },
];

const floatingLeaves = [
  { x: 200, y: 300, r: -30, s: 0.9, d: 0 },
  { x: 330, y: 260, r: 40, s: 0.7, d: -2 },
  { x: 260, y: 360, r: 110, s: 1, d: -4 },
  { x: 380, y: 340, r: -70, s: 0.8, d: -1 },
];

export function MugBack(props: { level: number; boiling: boolean }) {
  const hw = () => innerHalfWidth(props.level);
  return (
    <svg
      class="mug-layer mug-back"
      classList={{ boiling: props.boiling }}
      viewBox={`0 0 ${MUG.width} ${MUG.height}`}
      aria-hidden="true"
    >
      <defs>
        <clipPath id="mug-inside">
          <path d={INSIDE} />
        </clipPath>
        <clipPath id="mug-tea">
          <rect x="0" y={props.level} width="660" height="470" />
        </clipPath>
        <linearGradient id="tea-depth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ "stop-color": "var(--liquid)" }} />
          <stop offset="1" style={{ "stop-color": "var(--liquid-deep)" }} />
        </linearGradient>
      </defs>
      <ellipse cx="320" cy="452" rx="300" ry="13" fill="#000" opacity="0.16" />
      {/* Paper sticker backing */}
      <g fill="none" stroke={PAPER} stroke-linejoin="round" stroke-linecap="round">
        <ellipse cx="290" cy="428" rx="236" ry="32" stroke-width="16" />
        <path d={HANDLE} stroke-width="46" />
        <path d={`${OUTER} A162 20 0 0 0 128 80`} stroke-width="16" />
      </g>
      <ellipse cx="290" cy="434" rx="236" ry="30" fill="#dcc39b" stroke={INK} stroke-width="3.5" />
      <ellipse cx="290" cy="424" rx="236" ry="30" fill="#f2e1c2" stroke={INK} stroke-width="3.5" />
      <ellipse
        cx="290"
        cy="424"
        rx="206"
        ry="22"
        fill="none"
        stroke="#d4b688"
        stroke-width="2.5"
        stroke-dasharray="7 6"
      />
      <ellipse cx="290" cy="418" rx="150" ry="15" fill="#000" opacity="0.08" />
      <path d={HANDLE} fill="none" stroke={INK} stroke-width="32" stroke-linecap="round" />
      <path d={HANDLE} fill="none" stroke="#f4f1ea" stroke-width="20" stroke-linecap="round" />
      <path
        d={HANDLE}
        fill="none"
        stroke="#fff"
        stroke-width="5"
        stroke-linecap="round"
        opacity="0.9"
        stroke-dasharray="40 260"
      />
      <path d={`${OUTER} A162 20 0 0 1 128 80 Z`} fill="#fff" opacity="0.2" />
      <path d="M128 80 A162 20 0 0 1 452 80" fill="none" stroke={INK} stroke-width="4" />
      <g clip-path="url(#mug-inside)">
        <rect x="100" y={props.level} width="460" height="420" fill="url(#tea-depth)" />
        <g clip-path="url(#mug-tea)">
          <For each={floatingLeaves}>
            {(leaf) => (
              <g transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.r}) scale(${leaf.s})`}>
                <path
                  class="tea-leaf"
                  style={{ "animation-delay": `${leaf.d}s` }}
                  d="M0 -14 C9 -7, 9 7, 0 14 C-9 7, -9 -7, 0 -14 Z"
                  fill="var(--liquid-deep)"
                  stroke={INK}
                  stroke-width="2"
                  opacity="0.75"
                />
              </g>
            )}
          </For>
          <For each={bubbles}>
            {(bubble) => (
              <circle
                class="tea-bubble"
                cx={bubble.x}
                cy="392"
                r={bubble.r}
                fill="none"
                stroke="#fff"
                stroke-width="2"
                style={{
                  "--rise": `${Math.max(0, 392 - props.level - 8)}px`,
                  "--bubble-base": `${bubble.d}s`,
                  "animation-delay": `${bubble.delay}s`,
                }}
              />
            )}
          </For>
        </g>
        <g transform="translate(352 338) rotate(-12)">
          <path
            d="M0 0 L46 0 L50 46 Q25 54 -4 46 Z"
            fill="#f0e2c4"
            stroke={INK}
            stroke-width="3"
            stroke-linejoin="round"
            opacity="0.9"
          />
          <path d="M4 10 L44 10" stroke="#c9b48a" stroke-width="2" stroke-dasharray="3 3" />
          <path
            d="M8 22 Q25 30 42 22 L44 40 Q24 46 4 40 Z"
            fill="var(--liquid-deep)"
            opacity="0.45"
          />
        </g>
        <ellipse cx={MUG.cx} cy={props.level} rx={hw()} ry="13" class="tea-surface" />
        <ellipse
          cx={MUG.cx - hw() * 0.35}
          cy={props.level - 3}
          rx={hw() * 0.32}
          ry="4"
          fill="#fff"
          opacity="0.28"
        />
      </g>
      <path d="M376 340 L424 84" stroke={INK} stroke-width="2" opacity="0.7" />
      <g class="steam" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round">
        <path class="steam-wisp" d="M246 62 C234 46 258 36 246 18" />
        <path class="steam-wisp steam-2" d="M292 58 C280 42 304 32 292 10" />
        <path class="steam-wisp steam-3" d="M338 62 C326 46 350 36 338 20" />
      </g>
    </svg>
  );
}

export function MugFront(props: { level: number; label: string; tea: string; urgent: boolean }) {
  const hw = () => innerHalfWidth(props.level);
  return (
    <svg class="mug-layer mug-front" viewBox={`0 0 ${MUG.width} ${MUG.height}`} aria-hidden="true">
      <defs>
        <clipPath id="mug-inside-front">
          <path d={INSIDE} />
        </clipPath>
      </defs>
      <g clip-path="url(#mug-inside-front)">
        <path
          d={`M${MUG.cx - hw()} ${props.level} A${hw()} 13 0 0 0 ${MUG.cx + hw()} ${props.level} L560 470 L20 470 Z`}
          class="tea-front"
        />
        <path
          d={`M${MUG.cx - hw()} ${props.level} A${hw()} 13 0 0 0 ${MUG.cx + hw()} ${props.level}`}
          fill="none"
          stroke="#fff"
          stroke-width="3"
          opacity="0.45"
          class="tea-lip"
        />
      </g>
      <path d={`${OUTER}`} fill="none" stroke={INK} stroke-width="5" stroke-linejoin="round" />
      <path d="M128 80 A162 20 0 0 0 452 80" fill="none" stroke={INK} stroke-width="4.5" />
      <ellipse
        cx="290"
        cy="81"
        rx="153"
        ry="15"
        fill="none"
        stroke="#fff"
        stroke-width="3"
        opacity="0.6"
      />
      <path
        d="M158 120 L176 356"
        stroke="#fff"
        stroke-width="11"
        stroke-linecap="round"
        opacity="0.5"
      />
      <path
        d="M186 112 L189 150"
        stroke="#fff"
        stroke-width="6"
        stroke-linecap="round"
        opacity="0.5"
      />
      <path
        d="M428 124 L414 368"
        stroke="#fff"
        stroke-width="7"
        stroke-linecap="round"
        opacity="0.2"
      />
      <ellipse cx="290" cy="401" rx="122" ry="8" fill="#fff" opacity="0.25" />
      <path
        d="M428 84 Q442 68 450 90 L458 132"
        fill="none"
        stroke={INK}
        stroke-width="2.4"
        stroke-linecap="round"
      />
      <g class="mug-tag" classList={{ urgent: props.urgent }}>
        <rect
          x="426"
          y="130"
          width="64"
          height="60"
          rx="9"
          fill={PAPER}
          stroke={INK}
          stroke-width="3.5"
        />
        <path d="M426 146 L490 146" stroke="var(--bg)" stroke-width="7" opacity="0.85" />
        <circle cx="458" cy="138" r="3.2" fill={INK} />
        <text class="mug-tag-tea" x="458" y="161">
          {props.tea}
        </text>
        <text class="mug-tag-time" x="458" y="184">
          {props.label}
        </text>
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Mix: the tea wheel                                                   */
/* ------------------------------------------------------------------ */

const wheelTeas = [
  { id: "black", color: "#1f1a18", label: "BLACK" },
  { id: "green", color: "#2f8a63", label: "GREEN" },
  { id: "red", color: "#c23a48", label: "RED" },
  { id: "yellow", color: "#d9a21f", label: "YELLOW" },
] as const;

function arcPath(index: number): string {
  const start = ((index * 90 - 90) * Math.PI) / 180;
  const end = (((index + 1) * 90 - 90) * Math.PI) / 180;
  const r = 96;
  return `M0 0 L${r * Math.cos(start)} ${r * Math.sin(start)} A${r} ${r} 0 0 1 ${r * Math.cos(end)} ${r * Math.sin(end)} Z`;
}

export function TeaWheel(props: { tea: string | null }) {
  const index = () =>
    Math.max(
      0,
      wheelTeas.findIndex(({ id }) => id === props.tea),
    );
  const landing = () => 360 * 3 - (index() * 90 + 45);
  return (
    <svg class="tea-wheel" viewBox="-112 -126 224 240" aria-hidden="true">
      <circle cx="0" cy="4" r="106" fill="#000" opacity="0.18" />
      <circle cx="0" cy="0" r="106" fill={PAPER} stroke={INK} stroke-width="4" />
      <g class="tea-wheel-spin" style={{ "--land": `${landing()}deg` }}>
        <For each={wheelTeas}>
          {(tea, i) => (
            <g>
              <path
                d={arcPath(i())}
                fill={tea.color}
                stroke={INK}
                stroke-width="3.5"
                stroke-linejoin="round"
              />
              <text class="tea-wheel-label" transform={`rotate(${i() * 90 + 45}) translate(0 -62)`}>
                {tea.label}
              </text>
            </g>
          )}
        </For>
        <For each={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]}>
          {(dot) => (
            <circle
              cx={Math.cos((dot * 30 * Math.PI) / 180) * 101}
              cy={Math.sin((dot * 30 * Math.PI) / 180) * 101}
              r="2.6"
              fill="#ffe8a8"
              stroke={INK}
              stroke-width="1.2"
            />
          )}
        </For>
      </g>
      <circle cx="0" cy="0" r="22" fill={PAPER} stroke={INK} stroke-width="4" />
      <text class="tea-wheel-hub" x="0" y="9">
        ✳
      </text>
      <path
        d="M-15 -122 L15 -122 L0 -92 Z"
        fill="#ef4f5f"
        stroke={INK}
        stroke-width="4"
        stroke-linejoin="round"
      />
    </svg>
  );
}
