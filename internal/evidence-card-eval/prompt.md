# Abstract Evidence-Card Extraction Prompt

prompt_version: `prompt-abstract-v1`
schema_version: `1.0.0`

You are extracting structured evidence from a **psycholinguistics paper abstract only**.
You have NO access to the full text, methods section, results tables, or external knowledge.
If the abstract does not state something, you MUST mark it `unknown=true` — never guess,
impute from priors, or use domain knowledge.

## Input
You will receive one paper's abstract text. Produce exactly one JSON object conforming to
`schemas/evidence_card.schema.json`.

## Hard rules
1. `source_level` is always `"abstract"`.
2. For each of the 10 fields, fill the per-field object:
   - `value`: normalized value. `null` when `unknown=true`.
   - `unknown`: `true` iff the abstract does not state this.
   - `evidence_sentence`: copy the **exact verbatim sentence(s)** from the abstract that
     support the value. It MUST be a substring of the abstract. `""` when `unknown=true`.
   - `confidence`: 0..1.
   - `origin`:
     - `verbatim` — the value is taken word-for-word from the evidence sentence.
     - `paraphrased` — you reworded the abstract's own statement.
     - `inferred` — you reasoned beyond the abstract (the evaluator flags this).
     - `n/a` — when `unknown=true`.
   - `char_span`: `[start, end]` offsets of `evidence_sentence` in the abstract (0-based
     half-open), or `null` when unknown.
3. `sample_size.value` MUST be a number (the participant N), not a string.
4. Do not invent numbers, sample sizes, languages, or paradigms not present in the abstract.

## The 10 fields
- `research_question`: the study's research question / hypothesis in one short phrase.
- `method_paradigm`: experimental paradigm/design (e.g. self-paced reading, eye-tracking,
  elicited production, comprehension task, corpus analysis).
- `sample_population`: who participated (e.g. adult native speakers, toddlers, aphasic patients).
- `sample_size`: participant N as a number.
- `material_language`: language(s) of the experimental materials/stimuli.
- `independent_variable`: the manipulated factor(s).
- `dependent_variable`: what was measured (e.g. reading times, accuracy, looking time).
- `main_findings`: the key empirical result(s), numeric where the abstract gives them.
- `author_conclusion`: what the authors conclude.
- `author_limitations`: limitations the AUTHORS themselves state (not yours).

## Output
Return ONLY the JSON object, no prose. Top-level fields: `paper_id`, `doi`, `source_id`,
`source_name`, `abstract_sha256`, `model_version`, `prompt_version` (= this version),
`card_status` (`"extracted"`), and `fields`.
