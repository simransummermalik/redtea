export interface RandomState {
  rngState: number;
}

export function nextRandom(state: RandomState): { value: number; rngState: number } {
  let seed = state.rngState >>> 0;
  if (seed === 0) seed = 0x6d2b79f5;
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  const rngState = seed >>> 0;
  return { value: rngState / 0x1_0000_0000, rngState };
}

export function randomIndex(
  state: RandomState,
  length: number,
): { index: number; rngState: number } {
  if (length <= 0) throw new RangeError("Cannot choose from an empty collection");
  const draw = nextRandom(state);
  return { index: Math.floor(draw.value * length), rngState: draw.rngState };
}
