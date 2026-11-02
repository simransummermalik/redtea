# Engine

The engine is deterministic game logic. State advances through a mode strategy's
`start(state, now)` and `step(state, event, now)` methods. Time is injected as a
monotonic number; the engine has no clocks, timers, DOM access, or I/O. Seeded
random state travels with the game state, and effects describe what the UI can
show without letting the UI decide validity or scoring.

`ModeStrategy<State, Event, RoundResult, Resolution, Effect>` is the shared
contract. `latestRoundResult` exposes the most recent round outcome, including
the winner, submissions, and score deltas. `resolve` returns a final game result
only after the game has ended. A round may have no winner and still advance.
Black Tea treats a turn as its round; Green, Red, and Yellow resolve simultaneous
rounds.

## Round modes

Green ends a round on the first valid submission. Words cannot be reused, and
the default target is 30 round wins. Red and Yellow resolve when the configured
round timer expires and award one point to the round winner; the default target
is 4 wins. Red compares word length, then submission time and event order.
Yellow accepts one message per player, splits on whitespace and commas, and
counts unique valid words. Its default is to ignore invalid words. Turning that
option off subtracts one from the message score per invalid word, with a floor
of zero. Red and Yellow allow reuse across rounds by default and expose a config
flag to disable it.

Round configs include `pointsToWin`, `roundTimeMs`, and `botCount`. Green defaults
to 10 seconds per round; Red and Yellow also default to 10 seconds because the
Tea rules do not specify a default duration. Bot actions are planned from the
seed and player skill, then emitted as normal timestamped submissions during
`TICK` events.

## Black Tea

Black Tea defaults are centralized in `defaultBlackConfig`: 2 HP, 12 seconds per
turn, 500 ms linear decay per completed turn, a 5 second floor, and 1 point per
valid word. Bot skill controls a linear delay from 4.5 seconds down to 0.9
seconds and the chance an attempt is accurate.

The source rules do not say whether Black Tea keeps one fragment for the whole
game or deals a new one each turn. The current default is to change fragments
after each completed turn; set `changeFragmentEachTurn: false` to keep one
fragment while unused answers remain.

## Unspecified source details

Fragments are selected uniformly from the catalog using the seeded RNG. The Tea
rules do not specify how fragments are selected. The source also does not state
how a tie for the final score is handled; these modes award one point to a single
round winner, so the first player to reach the target ends the game.
