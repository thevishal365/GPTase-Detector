# GPTase Detector — Evaluation Report

- **Date (UTC):** 2026-09-23T11:26:50+00:00
- **Mode:** api (backend: `api`)
- **Model:** `rasbt/ai-text-detector-modernbert` (torch 2.14.0+cpu, transformers 5.17.0)
- **Dataset:** `eval/dataset.v1.jsonl` (sha256 `b0f8967b0dbc…`, n=80 primary + 0 derived truncation probes)

> AI is the positive class. Derived truncation probes are excluded from headline
> metrics and used only for the by-length analysis.

## Overall (primary samples)

| Metric | Value |
|---|---|
| Accuracy | 0.800 |
| Precision (AI) | 0.800 |
| Recall (AI) | 0.870 |
| F1 (AI) | 0.833 |

Confusion matrix (rows = actual, columns = predicted): TP=40, FN=6, FP=10, TN=24.
See `confusion_matrix.csv`.

## By category (primary)

| Category | n | Acc | Prec | Rec | F1 |
|---|---|---|---|---|---|
| ai | 18 | 1.000 | 1.000 | 1.000 | 1.000 |
| human | 18 | 0.889 | 0.000 | 0.000 | 0.000 |
| mixed | 16 | 0.625 | 0.600 | 0.750 | 0.667 |
| paraphrased | 12 | 0.833 | 1.000 | 0.833 | 0.909 |
| short | 16 | 0.625 | 0.600 | 0.750 | 0.667 |

## By text length (incl. derived truncation probes)

| Bucket | n | Acc | Prec | Rec | F1 |
|---|---|---|---|---|---|
| short (<30w) | 16 | 0.625 | 0.600 | 0.750 | 0.667 |
| medium (30-60w) | 42 | 0.833 | 0.783 | 0.900 | 0.837 |
| long (>60w) | 22 | 0.864 | 0.941 | 0.889 | 0.914 |

## Latency (all runs)

median 1305 ms, p90 1673 ms, max 2370 ms (n=80).

## False positives (HUMAN predicted AI) — review these

| id | actual | pred | ai_p | words | category |
|---|---|---|---|---|---|
| `human-05` | HUMAN | AI | 1.000 | 55 | human |
| `mixed-hu-03` | HUMAN | AI | 1.000 | 57 | mixed |
| `mixed-hu-04` | HUMAN | AI | 1.000 | 64 | mixed |
| `mixed-hu-07` | HUMAN | AI | 1.000 | 52 | mixed |
| `mixed-hu-02` | HUMAN | AI | 0.996 | 58 | mixed |
| `human-17` | HUMAN | AI | 0.957 | 52 | human |
| `short-h-04` | HUMAN | AI | 0.898 | 5 | short |
| `short-h-01` | HUMAN | AI | 0.797 | 7 | short |
| `short-h-07` | HUMAN | AI | 0.711 | 5 | short |
| `short-h-08` | HUMAN | AI | 0.516 | 6 | short |

## False negatives (AI predicted HUMAN) — review these

| id | actual | pred | ai_p | words | category |
|---|---|---|---|---|---|
| `mixed-ai-03` | AI | HUMAN | 0.000 | 80 | mixed |
| `mixed-ai-07` | AI | HUMAN | 0.000 | 70 | mixed |
| `para-08` | AI | HUMAN | 0.001 | 54 | paraphrased |
| `para-01` | AI | HUMAN | 0.024 | 55 | paraphrased |
| `short-a-03` | AI | HUMAN | 0.301 | 8 | short |
| `short-a-05` | AI | HUMAN | 0.477 | 8 | short |

## Reproduce

```
venv\Scripts\python.exe eval/run_eval.py --mode api
```

Methodology and limitations: see `docs/EVALUATION.md`.
