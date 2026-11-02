import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dictionaryConfig } from "../src/config";
import { processWordLists } from "../src/pipeline";

const packageDirectory = join(import.meta.dir, "..");
const sourceDirectory = join(packageDirectory, "data", "source", "scowl");
const archivePath = join(packageDirectory, "data", "source", "scowl.tar.gz");
const generatedDirectory = join(packageDirectory, "data", "generated");

async function downloadSource(): Promise<void> {
  const response = await fetch(dictionaryConfig.sourceUrl);
  if (!response.ok)
    throw new Error(`SCOWL download failed: ${response.status} ${response.statusText}`);
  await mkdir(join(packageDirectory, "data", "source"), { recursive: true });
  await writeFile(archivePath, new Uint8Array(await response.arrayBuffer()));
}

async function extractSource(): Promise<void> {
  const process = Bun.spawn(
    ["tar", "-xzf", archivePath, "-C", sourceDirectory, "--strip-components=1"],
    { stderr: "inherit" },
  );
  const exitCode = await process.exited;
  if (exitCode !== 0) throw new Error(`tar failed with exit code ${exitCode}`);
}

async function readLines(path: string): Promise<string[]> {
  const content = await readFile(path, "utf8");
  return content.split(/\r?\n/).filter((line) => line.length > 0);
}

async function readLinesIfPresent(path: string): Promise<string[]> {
  return (await Bun.file(path).exists()) ? readLines(path) : [];
}

await mkdir(sourceDirectory, { recursive: true });
const sourceWordsPath = join(
  sourceDirectory,
  "final",
  `english-words.${dictionaryConfig.scowlSize}`,
);
if (!(await Bun.file(sourceWordsPath).exists())) {
  await downloadSource();
  await extractSource();
}

const sizeFiles = await Promise.all(
  dictionaryConfig.scowlSizesThrough60.map(async (size) => {
    const [englishWords, americanWords, englishUpper, americanUpper, englishNames, americanNames] =
      await Promise.all([
        readLines(join(sourceDirectory, "final", `english-words.${size}`)),
        readLinesIfPresent(join(sourceDirectory, "final", `american-words.${size}`)),
        readLinesIfPresent(join(sourceDirectory, "final", `english-upper.${size}`)),
        readLinesIfPresent(join(sourceDirectory, "final", `american-upper.${size}`)),
        readLinesIfPresent(join(sourceDirectory, "final", `english-proper-names.${size}`)),
        readLinesIfPresent(join(sourceDirectory, "final", `american-proper-names.${size}`)),
      ]);
    return {
      words: [...englishWords, ...americanWords],
      names: [...englishUpper, ...americanUpper, ...englishNames, ...americanNames],
    };
  }),
);
const result = processWordLists(
  sizeFiles.flatMap(({ words }) => words),
  [...new Set(sizeFiles.flatMap(({ names }) => names))],
  dictionaryConfig.minimumSolutions,
);

await mkdir(generatedDirectory, { recursive: true });
await Promise.all([
  writeFile(join(generatedDirectory, "words.txt"), `${result.words.join("\n")}\n`),
  writeFile(join(generatedDirectory, "fragments.json"), `${JSON.stringify(result.fragments)}\n`),
  writeFile(
    join(generatedDirectory, "filter-report.json"),
    `${JSON.stringify(result.report, null, 2)}\n`,
  ),
  writeFile(
    join(generatedDirectory, "SCOWL-Copyright.txt"),
    await readFile(join(sourceDirectory, "Copyright")),
  ),
]);

console.log(`${dictionaryConfig.sourceName} ${dictionaryConfig.sourceVersion} word pipeline`);
console.log(`Source entries: ${result.report.sourceEntries}`);
console.log(`Duplicates: ${result.report.duplicateEntries}`);
console.log(`Proper-name entries excluded: ${result.report.properNameEntriesExcluded}`);
console.log(`Non-alpha entries excluded: ${result.report.nonAlphaEntriesExcluded}`);
console.log(`Plural forms excluded: ${result.report.pluralsExcluded}`);
console.log(`-ing forms excluded: ${result.report.ingFormsExcluded}`);
console.log(`Final words: ${result.report.finalWords}`);
console.log(
  `Fragments below ${dictionaryConfig.minimumSolutions} answers: ${result.report.fragmentsBelowMinimum}`,
);
console.log(`Usable fragments by tier: ${JSON.stringify(result.report.fragmentsByDifficulty)}`);
console.log("Sample edge cases:");
for (const [word, sample] of Object.entries(result.report.samples)) {
  console.log(`  ${word}: ${sample.included ? "included" : "excluded"} — ${sample.reason}`);
}
