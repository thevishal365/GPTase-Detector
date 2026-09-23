# GPTase Detector — Evaluation Report

- **Date (UTC):** 2026-09-23T11:41:07+00:00
- **Mode:** api (backend: `api`)
- **Model:** `rasbt/ai-text-detector-modernbert` (torch 2.14.0+cpu, transformers 5.17.0)
- **Dataset:** `eval/dataset.v1.jsonl` (sha256 `b0f8967b0dbc…`, n=80 primary + 68 derived truncation probes)
- **Headline scope:** CORE binary slice only (`human` + `ai`, n=36). Robustness slices are reported separately below.

> AI is the positive class. Scores shown are raw model softmax probabilities;
> no calibration has been established, so they are reported as probabilities,
> never as confidence.

## Headline — core binary evaluation (clean ground truth)

| Metric | Value |
|---|---|
| Accuracy | 0.944 |
| Precision (AI) | 0.900 |
| Recall (AI) | 1.000 |
| F1 (AI) | 0.947 |

Confusion matrix (rows = actual, columns = predicted; core only): TP=18, FN=0, FP=2, TN=16.
See `confusion_matrix.csv`.

| Core class | n | Correct | Accuracy |
|---|---|---|---|
| human | 18 | 16 | 0.889 |
| ai | 18 | 18 | 1.000 |

## Robustness — short text (separate; genuine authorship labels)

Accuracy 0.625, precision 0.600, recall 0.750, F1 0.667
(TP=6, FN=2, FP=4, TN=4, n=16).

## Robustness — paraphrased text (separate; origin labels, not authorship truth)

Detection rate on paraphrased AI-origin text: **0.833**
(10/12 flagged AI, 2 evaded as HUMAN).
Precision/F1 are undefined for this single-label slice and omitted.

> Label note: paraphrase samples are labeled AI **by origin** — a human rewrote
> AI-pastiche source text. A human author substantially involved in the wording
> means these labels record provenance, not pure authorship. They measure
> robustness to rewriting, not binary classification correctness.

## Robustness — mixed text (separate; majority-class convention)

Accuracy under majority labeling: **0.625**
(TP=6, FN=2, FP=4, TN=4, n=16).
Precision/recall/F1 are withheld: the labels are a construction convention,
not ground truth (see methodology note).

## Methodology note — why mixed and paraphrased are not clean ground truth

A clean binary label asserts sole authorship. Mixed samples have *two* authors
by construction, so any single label is a majority-vote convention; near-50/50
cases are inherently ambiguous and a "wrong" prediction may reflect the
minority segment dominating the model's reading. Paraphrased samples carry an
*origin* label (source text was AI-styled) while the actual wording is human,
so a HUMAN prediction is arguably correct under an authorship reading and
wrong under a provenance reading — the slice therefore measures evasion
robustness, not classification accuracy. Both slices are informative stress
tests and must not be folded into headline binary metrics.

## By text length, core only (supplementary; incl. derived truncation probes)

| Bucket | n | Acc | Prec | Rec | F1 |
|---|---|---|---|---|---|
| short (<30w) | 32 | 0.625 | 0.600 | 1.000 | 0.750 |
| medium (30-60w) | 27 | 0.815 | 0.583 | 1.000 | 0.737 |
| long (>60w) | 13 | 1.000 | 1.000 | 1.000 | 1.000 |

## Latency (all runs)

median 1037 ms, p90 1497 ms, max 2152 ms (n=148).

## False positives, core (HUMAN predicted AI) — review these

| id | actual | pred | ai_p | words | category |
|---|---|---|---|---|---|
| `human-05` | HUMAN | AI | 1.000 | 55 | human |
| `human-17` | HUMAN | AI | 0.957 | 52 | human |

## False negatives, core (AI predicted HUMAN) — review these

| id | actual | pred | ai_p | words | category |
|---|---|---|---|---|---|
_none_

## Robustness errors (all non-core FP/FN) — review separately

| id | actual | pred | ai_p | words | category |
|---|---|---|---|---|---|
| `mixed-ai-03` | AI | HUMAN | 0.000 | 80 | mixed |
| `mixed-ai-07` | AI | HUMAN | 0.000 | 70 | mixed |
| `mixed-hu-02` | HUMAN | AI | 0.996 | 58 | mixed |
| `mixed-hu-03` | HUMAN | AI | 1.000 | 57 | mixed |
| `mixed-hu-04` | HUMAN | AI | 1.000 | 64 | mixed |
| `mixed-hu-07` | HUMAN | AI | 1.000 | 52 | mixed |
| `para-01` | AI | HUMAN | 0.024 | 55 | paraphrased |
| `para-08` | AI | HUMAN | 0.001 | 54 | paraphrased |
| `short-a-03` | AI | HUMAN | 0.301 | 8 | short |
| `short-a-05` | AI | HUMAN | 0.477 | 8 | short |
| `short-h-01` | HUMAN | AI | 0.797 | 7 | short |
| `short-h-04` | HUMAN | AI | 0.898 | 5 | short |
| `short-h-07` | HUMAN | AI | 0.711 | 5 | short |
| `short-h-08` | HUMAN | AI | 0.516 | 6 | short |

## Reproduce

```
venv\Scripts\python.exe eval/run_eval.py --mode api
```

Methodology and limitations: see `docs/EVALUATION.md`.
