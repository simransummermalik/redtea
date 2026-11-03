import type { FragmentEntry } from "@redtea/engine";
import { createWordCatalog } from "@redtea/engine";

export async function loadWordCatalog() {
  const [wordsResponse, fragmentsResponse] = await Promise.all([
    fetch("/words.txt"),
    fetch("/fragments.json"),
  ]);
  if (!wordsResponse.ok)
    throw new Error(`The word list could not be loaded (HTTP ${wordsResponse.status})`);
  if (!fragmentsResponse.ok)
    throw new Error(`The word fragments could not be loaded (HTTP ${fragmentsResponse.status})`);
  const [wordsText, fragmentIndex] = await Promise.all([
    wordsResponse.text(),
    fragmentsResponse.json() as Promise<FragmentEntry[]>,
  ]);
  if (!wordsText.trim()) throw new Error("The word list is empty");
  return createWordCatalog(wordsText.trim().split(/\r?\n/), fragmentIndex);
}
