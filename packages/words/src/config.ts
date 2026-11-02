export const dictionaryConfig = {
  sourceName: "SCOWL",
  sourceVersion: "2020.12.07",
  sourceUrl:
    "https://downloads.sourceforge.net/project/wordlist/SCOWL/2020.12.07/scowl-2020.12.07.tar.gz",
  scowlSize: 60,
  scowlSizesThrough60: [10, 20, 35, 40, 50, 55, 60],
  minimumSolutions: 5,
  difficulty: {
    easyMinimum: 100,
    mediumMinimum: 25,
  },
} as const;

export type Difficulty = "easy" | "medium" | "hard";
