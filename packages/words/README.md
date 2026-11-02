# Word data

The build script uses SCOWL 2020.12.07, US English size 60. SCOWL is distributed under a permissive MIT-like license; its copyright and license text is copied beside the generated data. The source separates `upper` and `proper-names` categories, which the build excludes. Common words that also happen to be names remain in the regular word category.

The script downloads the source archive on first run, then writes `words.txt`, `fragments.json`, `filter-report.json`, and `SCOWL-Copyright.txt` under `data/generated/`.

The generated fragment index keeps fragments with at least 5 distinct valid answers. Tiers are hard (5–24 answers), medium (25–99), and easy (100 or more); these thresholds live in `src/config.ts`.

Plural and `-ing` removal is a conservative spelling heuristic: a suffix is removed only when one of the candidate stems is in the unfiltered source set. It preserves `news` as an explicit invariant noun edge case. The report includes `bus`, `sing`, `news`, `series`, `buses`, and `singing` so filtering changes can be reviewed.
