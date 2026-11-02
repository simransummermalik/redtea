export type PlayerId = string;

export interface PlayerDelta {
  points: number;
  hp: number;
}

export interface ModeStrategy<State, Event, RoundResult, Resolution, Effect> {
  start(state: State, now: number): { state: State; effects: Effect[] };
  step(state: State, event: Event, now: number): { state: State; effects: Effect[] };
  latestRoundResult(state: State): RoundResult | null;
  resolve(state: State, now: number): Resolution | null;
}
