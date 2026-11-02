import type { Difficulty } from "./config";

export interface FilterReport {
  sourceEntries: number;
  duplicateEntries: number;
  properNameEntriesExcluded: number;
  nonAlphaEntriesExcluded: number;
  pluralsExcluded: number;
  ingFormsExcluded: number;
  finalWords: number;
  fragmentsBelowMinimum: number;
  fragmentsByDifficulty: Record<Difficulty, number>;
  samples: Record<string, { included: boolean; reason: string }>;
}

export interface ProcessedDictionary {
  words: string[];
  report: FilterReport;
  fragments: Array<{ fragment: string; solutionCount: number; difficulty: Difficulty }>;
}

const nonPluralSExceptions = new Set(["news"]);

function isAsciiWord(value: string): boolean {
  return /^[a-z]+$/.test(value);
}

function pluralStems(word: string): string[] {
  if (word.length < 4 || nonPluralSExceptions.has(word)) return [];

  if (word.endsWith("ies")) return [`${word.slice(0, -3)}y`];
  if (word.endsWith("ves")) {
    const stem = word.slice(0, -3);
    return [`${stem}f`, `${stem}fe`];
  }
  if (word.endsWith("es")) {
    const stem = word.slice(0, -2);
    if (/(s|x|z|ch|sh|o)$/.test(stem)) return [stem, `${stem}e`];
  }
  if (word.endsWith("s") && !/(ss|us|is|ics|ous|ness)$/.test(word)) {
    return [word.slice(0, -1)];
  }
  return [];
}

function ingStems(word: string): string[] {
  if (word.length < 5 || !word.endsWith("ing")) return [];
  const stem = word.slice(0, -3);
  const candidates = [stem, `${stem}e`];
  if (/(.)\1$/.test(stem)) candidates.push(stem.slice(0, -1));
  return candidates;
}

function getInflectionKind(word: string, words: ReadonlySet<string>): "plural" | "ing" | null {
  if (pluralStems(word).some((stem) => words.has(stem))) return "plural";
  if (ingStems(word).some((stem) => words.has(stem))) return "ing";
  return null;
}

function classifyDifficulty(count: number): Difficulty {
  if (count >= 100) return "easy";
  if (count >= 25) return "medium";
  return "hard";
}

export function processWordLists(
  wordLines: readonly string[],
  properNameLines: readonly string[],
  minimumSolutions = 5,
): ProcessedDictionary {
  const report: FilterReport = {
    sourceEntries: wordLines.length,
    duplicateEntries: 0,
    properNameEntriesExcluded: properNameLines.length,
    nonAlphaEntriesExcluded: 0,
    pluralsExcluded: 0,
    ingFormsExcluded: 0,
    finalWords: 0,
    fragmentsBelowMinimum: 0,
    fragmentsByDifficulty: { easy: 0, medium: 0, hard: 0 },
    samples: {},
  };

  const normalized = new Set<string>();
  for (const line of wordLines) {
    const value = line.trim();
    if (value.length === 0) continue;
    const word = value.toLowerCase();
    if (!isAsciiWord(word)) {
      report.nonAlphaEntriesExcluded += 1;
      continue;
    }
    const previousSize = normalized.size;
    normalized.add(word);
    if (normalized.size === previousSize) report.duplicateEntries += 1;
  }

  const words: string[] = [];
  for (const word of normalized) {
    const kind = getInflectionKind(word, normalized);
    if (kind === "plural") {
      report.pluralsExcluded += 1;
      continue;
    }
    if (kind === "ing") {
      report.ingFormsExcluded += 1;
      continue;
    }
    words.push(word);
  }
  words.sort();
  report.finalWords = words.length;

  const finalSet = new Set(words);
  for (const sample of ["bus", "sing", "news", "series", "buses", "singing"]) {
    const included = finalSet.has(sample);
    const excludedAs: "plural" | "ing" | null = normalized.has(sample)
      ? getInflectionKind(sample, normalized)
      : null;
    report.samples[sample] = {
      included,
      reason: included
        ? "retained as a base word"
        : excludedAs === "plural"
          ? "excluded because a singular stem is present"
          : excludedAs === "ing"
            ? "excluded because its verb stem is present"
            : "not present in the source word list",
    };
  }

  const counts = new Map<string, number>();
  for (const word of words) {
    const wordFragments = new Set<string>();
    for (let offset = 0; offset <= word.length - 3; offset += 1) {
      wordFragments.add(word.slice(offset, offset + 3));
    }
    for (const fragment of wordFragments) {
      counts.set(fragment, (counts.get(fragment) ?? 0) + 1);
    }
  }

  const fragments = [...counts]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([fragment, solutionCount]) => {
      if (solutionCount < minimumSolutions) {
        report.fragmentsBelowMinimum += 1;
        return [];
      }
      const difficulty = classifyDifficulty(solutionCount);
      report.fragmentsByDifficulty[difficulty] += 1;
      return [{ fragment, solutionCount, difficulty }];
    });

  return { words, report, fragments };
}
