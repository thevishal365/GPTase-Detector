# GPTase Detector — Evaluation Methodology

How the detector's reliability is measured, how to reproduce it, and what the
numbers do (and do not) mean. The model, API contract, and UI are untouched by
this phase; this document only describes measurement.

## 1. What is evaluated

The production inference path: ModernBERT sequence classifier
(`rasbt/ai-text-detector-modernbert`) → softmax → argmax over `{HUMAN, AI}`,
exactly as `backend/app/detector.py::predict` implements it, including its
512-token truncation. No thresholds were tuned and no calibration has been
established: reported numbers are raw softmax probabilities, described as
probabilities only — never as confidence.

## 2. Evaluation strata

Results are split into two strata with different ground-truth status.
**Headline metrics describe the core stratum only.**

### CORE binary evaluation (clean ground truth, n=36)

Categories `human` (18) and `ai` (18): single-author samples where the label
asserts sole authorship. Accuracy, precision, recall, F1 (AI = positive
class), and the confusion matrix are computed on this slice only.

### ROBUSTNESS / STRESS evaluation (reported separately, never in headlines)

| Slice | n | Labels | What it measures |
|---|---|---|---|
| `short` | 16 (8/8) | Genuine authorship | Behavior on 5–10 word inputs |
| `paraphrased` | 12 (all AI) | **Origin, not authorship** | Detection rate after human rewriting of AI-styled text |
| `mixed` | 16 (8/8) | **Majority-class convention** | Behavior on dual-author texts |

Metric choice follows label semantics: full binary metrics for `short`;
for `paraphrased` only the detection rate on AI-origin text (recall on AI —
precision is undefined with no HUMAN samples); for `mixed` only accuracy plus
raw outcome counts (precision/recall withheld — see §3).

## 3. Why mixed and paraphrased are not clean ground truth

A clean binary label asserts sole authorship. **Mixed** samples have two
authors by construction, so any single label is a majority-vote convention:
near-ambiguous cases mean a "wrong" prediction may reflect the minority
segment dominating the model's reading rather than a model failure.
**Paraphrased** samples carry an *origin* label (the source text was
AI-styled) while the actual wording is human-authored; a HUMAN prediction is
arguably correct under an authorship reading and wrong under a provenance
reading. The slice therefore measures evasion robustness, not classification
correctness. Both slices are informative stress tests and must not be folded
into headline binary metrics.

No existing sample was relabeled in this revision: paraphrase rows keep their
`AI` label with `source_note` provenance, and the distinction is carried by
strata, reporting, and this note instead.

## 4. Dataset (`eval/dataset.v1.jsonl`)

80 hand-authored English samples, one JSON object per line with
`{id, text, label, category, source_note}`. Label provenance is recorded per
sample in `source_note`. The file is unchanged by this revision (sha
`b0f8967…`); strata are assigned from the existing `category` field.

Length buckets used in the supplementary core-only analysis: **short <30
words**, **medium 30–60**, **long >60**. The 30-word cut matches the product
UI's reliability guidance; the 60-word cut splits the core set sensibly. No
sample exceeds 80 words — very-long-input behavior is explicitly untested
(see §7).

## 5. Harness (`eval/run_eval.py`, stdlib only)

- **Metrics.** AI is the positive class: TP = AI→AI, FP = HUMAN→AI,
  TN = HUMAN→HUMAN, FN = AI→HUMAN. Headline accuracy,
  precision, recall, F1, and `confusion_matrix.csv` cover the core slice.
  Single-label slices make precision/recall degenerate (empty-denominator
  convention), so per-slice reporting uses only the metrics its labels
  support (§2).
- **Length analysis (supplementary, core only).** Natural word counts plus
  *derived probes*: core samples longer than target+10 words are re-run
  truncated at sentence boundaries to ~30 and ~60 words (`<id>@trunc30/60`,
  `derived=true` in `predictions.csv`). Derived probes never enter headline
  or robustness metrics.
- **Modes.** `--mode direct` (default) calls `Detector.predict` in-process;
  `--mode api` replays the identical set through the live FastAPI server
  (`POST {api-url}/api/analyze`), validating the full serving contract.
  Predictions must be identical across modes (latency excepted); any
  prediction divergence is a bug.
- **Latency.** Per-sample wall time (inference only in direct mode;
  inference + HTTP in api mode); median/p90/max reported.

## 6. Reproduce

```bash
# Direct (model in-process; ~5 min on CPU for 80 + 68 probes)
venv\Scripts\python.exe eval/run_eval.py --mode direct

# Via the API (server must be running on :8000)
venv\Scripts\python.exe eval/run_eval.py --mode api [--no-derived]
```

Each run writes `reports/<UTC-stamp>-<dataset-sha7>-<mode>/` containing
`config.json` (model, library versions, dataset SHA, strata, counts),
`metrics.json`, `predictions.csv`, `confusion_matrix.csv` (core only), and
`report.md`.

## 7. Latest results (2026-09-23, dataset `b0f8967`, both modes — predictions identical)

**Headline, core binary (n=36): accuracy 0.944, precision 0.900, recall 1.000,
F1 0.947** (TP=18, FP=2, TN=16, FN=0). Direct-mode latency median ~0.8 s.

- Core errors: `human-05` (literary narrative, ai_p=1.000) and `human-17`
  (dialogue story, 0.957) flagged AI. All 18 AI-core samples correct.
- Robustness, short: acc 0.625 — 4/8 short-human flagged AI.
- Robustness, paraphrased: detection rate 0.833 — `para-01`, `para-08`
  evaded as HUMAN.
- Robustness, mixed: acc 0.625 under majority labeling.
- Length (core + derived): short 0.625 → medium 0.815 → long 1.000.
  Truncated-to-~30-word versions of correctly classified human texts flip to
  AI in most cases — short inputs bias the model toward AI, consistent with
  the UI's ≥30-word guidance.
- Outputs are near-binary (ai_p ≈ 0 or ≈ 1); mid-range probabilities occur
  almost only on short texts. This is a descriptive observation, not a
  calibration claim.

## 8. Limitations (read before quoting any number)

1. **Small N.** 36 core samples; intervals on headline accuracy are roughly
   ±8 points. Directional, not certified.
2. **Author/curation bias.** Both classes written by the same author;
   "AI-style" samples are pastiches, not outputs of a specific generator.
3. **English only.** No multilingual or code-switching coverage.
4. **Synthetic mixed texts.** Abrupt style shifts are a crude stand-in for
   real human-edited AI text; the majority-class label is a convention.
5. **Manual paraphrases.** Single-author rewrites; machine paraphrasers may
   behave differently.
6. **Length range.** Nothing over 80 words or near the 10k-char API limit
   tested; truncation probes cut from the *end*, so opening-sentence effects
   may confound the length finding.
7. **No public benchmarks** (deliberate: train-test overlap risk with this
   model's own training data); the cost is a smaller, non-standard set.
8. **No calibration.** Probabilities are uncalibrated softmax outputs; do not
   present them as confidence levels.
9. **Determinism.** CPU argmax inference is deterministic; compare runs only
   with matching library versions (recorded in `config.json`).
