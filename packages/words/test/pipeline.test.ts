import { describe, expect, test } from "bun:test";
import { processWordLists } from "../src/pipeline";

describe("processWordLists", () => {
  test("retains plurals and -ing forms when a stem is present", () => {
    const result = processWordLists(
      ["bus", "buses", "sing", "singing", "new", "news", "series", "dog", "dogs"],
      ["Alice", "London"],
      1,
    );

    expect(result.words).toEqual([
      "bus",
      "buses",
      "dog",
      "dogs",
      "new",
      "news",
      "series",
      "sing",
      "singing",
    ]);
    expect(result.report.pluralsRetained).toBe(2);
    expect(result.report.ingFormsRetained).toBe(1);
    expect(result.report.properNameEntriesExcluded).toBe(2);
    expect(result.report.samples.bus?.included).toBe(true);
    expect(result.report.samples.sing?.included).toBe(true);
    expect(result.report.samples.news?.included).toBe(true);
    expect(result.report.samples.series?.included).toBe(true);
    expect(result.report.samples.buses?.included).toBe(true);
    expect(result.report.samples.singing?.included).toBe(true);
  });

  test("normalizes case, drops non-alpha entries, deduplicates, and indexes each word once", () => {
    const result = processWordLists(["Tea", "tea", "t-ea", "teas"], [], 1);

    expect(result.words).toEqual(["tea"]);
    expect(result.report.duplicateEntries).toBe(1);
    expect(result.report.nonAlphaEntriesExcluded).toBe(1);
    expect(result.fragments).toEqual([{ fragment: "tea", solutionCount: 1, difficulty: "hard" }]);
  });

  test("applies the minimum fragment count and solution-count difficulty tiers", () => {
    const words = Array.from({ length: 25 }, (_, index) => {
      return `abc${String.fromCharCode(97 + index)}x`;
    });
    const result = processWordLists(words, [], 5);

    expect(result.fragments.find(({ fragment }) => fragment === "abc")?.solutionCount).toBe(25);
    expect(result.report.fragmentsByDifficulty.medium).toBeGreaterThan(0);
    expect(result.report.fragmentsBelowMinimum).toBeGreaterThan(0);
  });
});
