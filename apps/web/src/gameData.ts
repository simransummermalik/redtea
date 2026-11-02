import type { FragmentEntry } from "@redtea/engine";
import { createWordCatalog } from "@redtea/engine";

export async function loadWordCatalog() {
  const [wordsResponse, fragmentsResponse] = await Promise.all([
    fetch("/words.txt"),
    fetch("/fragments.json"),
  ]);
  if (!wordsResponse.ok || !fragmentsResponse.ok) {
    throw new Error("Could not load the game dictionary");
  }
  const [wordsText, fragmentIndex] = await Promise.all([
    wordsResponse.text(),
    fragmentsResponse.json() as Promise<FragmentEntry[]>,
  ]);
  return createWordCatalog(wordsText.trim().split(/\r?\n/), fragmentIndex);
}
