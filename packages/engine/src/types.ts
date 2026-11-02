export type PlayerId = string;

export interface PlayerDelta {
  points: number;
  hp: number;
}

export interface ModeStrategy<State, Event, RoundResult, Resolution, Effect> {
  start(state: State, now: number): { state: State; effects: Effect[] };
  step(state: State, event: Event, now: number): { state: State; effects: Effect[] };
  latestRoundResult(state: State): RoundResult | null;
  /** True when the active round is resolved and the caller may choose the next round. */
  isRoundComplete(state: State): boolean;
  resolve(state: State, now: number): Resolution | null;
}
