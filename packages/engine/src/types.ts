export type PlayerId = string;

export interface PlayerDelta {
  points: number;
  hp: number;
}

export interface ModeStrategy<State, Submission, Resolution, Effect> {
  startRound(state: State, now: number): { state: State; effects: Effect[] };
  submit(state: State, submission: Submission, now: number): { state: State; effects: Effect[] };
  resolve(state: State, now: number): Resolution | null;
}
