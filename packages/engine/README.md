# Engine

The engine is a deterministic reducer. Call `step(state, event, now)` with a monotonic time value; it has no clocks, timers, DOM access, or I/O. The seeded RNG state travels with the game state.

Black Tea defaults are centralized in `defaultBlackConfig`: 2 HP, 12 seconds per turn, 500 ms linear decay per completed turn, a 5 second floor, and 1 point per valid word. Bot skill controls a linear delay from 4.5 seconds down to 0.9 seconds and the chance an attempt is accurate.

The source rules do not say whether Black Tea keeps one fragment for the whole game or deals a new one each turn. The current default is to change fragments after each completed turn; set `changeFragmentEachTurn: false` to keep one fragment while unused answers remain.
