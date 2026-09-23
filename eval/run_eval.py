#!/usr/bin/env python3
"""Reproducible evaluation harness for GPTase Detector.

Runs the versioned JSONL dataset through the ModernBERT detector
(either in-process or via the live FastAPI server) and writes
metrics, predictions, and a Markdown report to reports/.

Metric convention: AI is the positive class.
  TP = actual AI predicted AI, FP = actual HUMAN predicted AI,
  TN = actual HUMAN predicted HUMAN, FN = actual AI predicted HUMAN.

Usage:
    venv\\Scripts\\python.exe eval/run_eval.py [--mode direct|api] [--api-url URL]
                            [--dataset eval/dataset.v1.jsonl] [--outdir reports]
                            [--no-derived]

Only the standard library is used (no sklearn/pandas), so results can be
reproduced with the pinned backend environment.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

POSITIVE = "AI"
NEGATIVE = "HUMAN"

# Evaluation strata. CORE is the only slice that constitutes clean
# human-vs-AI ground truth and the only input to headline metrics.
# ROBUSTNESS slices stress the detector under distribution shift and are
# reported separately; their labels are NOT equivalent to clean authorship
# ground truth (see docs/EVALUATION.md and the report's methodology note).
CORE_CATEGORIES = ("human", "ai")
ROBUSTNESS_CATEGORIES = ("short", "paraphrased", "mixed")

# Length buckets (words). The 30-word cut aligns with the product UI's
# reliability guidance; the 60-word cut splits the curated set near its
# median. See docs/EVALUATION.md.
BUCKETS = [("short (<30w)", 0, 29), ("medium (30-60w)", 30, 60), ("long (>60w)", 61, 10**9)]

# Truncation targets (words) for derived length-sensitivity probes.
TRUNC_TARGETS = (30, 60)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def load_dataset(path: Path) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as e:
                raise ValueError(f"{path}:{lineno}: invalid JSON: {e}") from e
            for key in ("id", "text", "label", "category", "source_note"):
                if key not in row:
                    raise ValueError(f"{path}:{lineno}: missing key {key!r}")
            if row["label"] not in (POSITIVE, NEGATIVE):
                raise ValueError(f"{path}:{lineno}: bad label {row['label']!r}")
            if not row["text"].strip():
                raise ValueError(f"{path}:{lineno}: empty text")
            rows.append(row)
    ids = [r["id"] for r in rows]
    if len(set(ids)) != len(ids):
        raise ValueError("duplicate ids in dataset")
    return rows


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p for p in parts if p]


def truncate_at_sentence(text: str, max_words: int) -> str:
    """Shorten to <= max_words, cutting only at sentence boundaries."""
    sents, kept, count = split_sentences(text), [], 0
    for s in sents:
        n = len(s.split())
        if kept and count + n > max_words:
            break
        kept.append(s)
        count += n
    return " ".join(kept) if kept else text


def build_derived(rows: list[dict]) -> list[dict]:
    """Sentence-boundary truncations of long samples (length probes)."""
    derived = []
    for r in rows:
        n = len(r["text"].split())
        for target in TRUNC_TARGETS:
            if n > target + 10:  # only when truncation is meaningful
                t = truncate_at_sentence(r["text"], target)
                if len(t.split()) < n:
                    derived.append({
                        "id": f"{r['id']}@trunc{target}",
                        "text": t,
                        "label": r["label"],
                        "category": r["category"],
                        "source_note": f"Derived: {r['id']} truncated at sentence boundary to ~{target} words.",
                        "derived_from": r["id"],
                    })
    return derived


class DirectBackend:
    """In-process inference via backend.app.detector."""

    name = "direct"

    def __init__(self) -> None:
        from backend.app.detector import Detector
        self.detector = Detector()
        self.detector.load()

    def predict(self, text: str) -> tuple[dict, float]:
        started = time.perf_counter()
        out = self.detector.predict(text)
        return out, (time.perf_counter() - started) * 1000.0


class ApiBackend:
    """Inference via the live FastAPI server (tests the full contract)."""

    name = "api"

    def __init__(self, base_url: str, timeout: int = 120) -> None:
        self.url = base_url.rstrip("/") + "/api/analyze"
        self.timeout = timeout
        # Fail fast if the server is unreachable.
        req = urllib.request.Request(
            self.url,
            data=json.dumps({"text": "connectivity probe"}).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"probe returned {resp.status}")
        except Exception as e:
            raise RuntimeError(
                f"API backend unreachable at {self.url}: {e}. "
                "Start it with: venv\\Scripts\\activate && "
                "python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000"
            ) from e

    def predict(self, text: str) -> tuple[dict, float]:
        body = json.dumps({"text": text}).encode()
        req = urllib.request.Request(
            self.url, data=body, headers={"Content-Type": "application/json"}
        )
        started = time.perf_counter()
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            data = json.loads(resp.read().decode())
        latency = (time.perf_counter() - started) * 1000.0
        return {
            "prediction": data["prediction"],
            "human_probability": data["human_probability"],
            "ai_probability": data["ai_probability"],
        }, latency


def prf(tp: int, fp: int, tn: int, fn: int) -> dict:
    total = tp + fp + tn + fn
    acc = (tp + tn) / total if total else 0.0
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    return {
        "n": total, "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        "accuracy": round(acc, 4),
        "precision_ai": round(prec, 4),
        "recall_ai": round(rec, 4),
        "f1_ai": round(f1, 4),
    }


def bucket_of(word_count: int) -> str:
    for name, lo, hi in BUCKETS:
        if lo <= word_count <= hi:
            return name
    return "unknown"


def evaluate(rows: list[dict], backend) -> list[dict]:
    results = []
    for i, r in enumerate(rows, 1):
        out, latency_ms = backend.predict(r["text"])
        pred = out["prediction"]
        actual = r["label"]
        correct = pred == actual
        kind = (
            "TP" if (actual == POSITIVE and correct)
            else "TN" if correct
            else "FP" if pred == POSITIVE
            else "FN"
        )
        results.append({
            "id": r["id"],
            "label": actual,
            "category": r["category"],
            "words": len(r["text"].split()),
            "chars": len(r["text"]),
            "prediction": pred,
            "ai_probability": round(out["ai_probability"], 6),
            "human_probability": round(out["human_probability"], 6),
            "correct": correct,
            "outcome": kind,
            "latency_ms": round(latency_ms, 1),
            "derived": bool(r.get("derived_from")),
            "derived_from": r.get("derived_from") or "",
        })
        print(f"  [{i}/{len(rows)}] {r['id']}: actual={actual} pred={pred} "
              f"ai_p={out['ai_probability']:.3f} {kind} ({latency_ms:.0f}ms)")
    return results


def summarize(primary: list[dict], all_results: list[dict]) -> dict:
    def counts(rs):
        tp = sum(1 for r in rs if r["outcome"] == "TP")
        fp = sum(1 for r in rs if r["outcome"] == "FP")
        tn = sum(1 for r in rs if r["outcome"] == "TN")
        fn = sum(1 for r in rs if r["outcome"] == "FN")
        return tp, fp, tn, fn

    core = [r for r in primary if r["category"] in CORE_CATEGORIES]
    ctp, cfp, ctn, cfn = counts(core)

    # Core per-class accuracy (single-label slices: accuracy only).
    core_by_class = {}
    for cat in CORE_CATEGORIES:
        rs = [r for r in core if r["category"] == cat]
        tp, fp, tn, fn = counts(rs)
        core_by_class[cat] = {
            "n": len(rs), "tp": tp, "fp": fp, "tn": tn, "fn": fn,
            "accuracy": round((tp + tn) / len(rs), 4) if rs else 0.0,
        }

    # Robustness slices. Metric choice follows label semantics:
    # - short: genuine authorship labels -> full binary metrics are valid.
    # - paraphrased: every sample is origin-labeled AI, so only the
    #   detection rate under paraphrase (recall on AI) is meaningful;
    #   precision is undefined (no HUMAN samples) and reported as null.
    # - mixed: labels are a majority-class convention, not authorship
    #   truth, so only accuracy + raw outcome counts are reported.
    robustness = {}
    short_rs = [r for r in primary if r["category"] == "short"]
    robustness["short"] = prf(*counts(short_rs))
    para_rs = [r for r in primary if r["category"] == "paraphrased"]
    p_tp, _, _, p_fn = counts(para_rs)
    robustness["paraphrased"] = {
        "n": len(para_rs), "tp": p_tp, "fp": 0, "tn": 0, "fn": p_fn,
        "accuracy": round(p_tp / len(para_rs), 4) if para_rs else 0.0,
        "detection_rate_paraphrased_ai": (
            round(p_tp / (p_tp + p_fn), 4) if (p_tp + p_fn) else 0.0
        ),
        "precision_ai": None,  # undefined: no HUMAN samples in slice
        "recall_ai": round(p_tp / (p_tp + p_fn), 4) if (p_tp + p_fn) else 0.0,
        "f1_ai": None,
    }
    mixed_rs = [r for r in primary if r["category"] == "mixed"]
    m_tp, m_fp, m_tn, m_fn = counts(mixed_rs)
    robustness["mixed"] = {
        "n": len(mixed_rs), "tp": m_tp, "fp": m_fp, "tn": m_tn, "fn": m_fn,
        "accuracy": round((m_tp + m_tn) / len(mixed_rs), 4) if mixed_rs else 0.0,
        "note": "majority-class labels; not authorship ground truth",
    }

    # Supplementary length analysis over CORE samples only
    # (primary + derived-from-core truncation probes).
    core_ids = {r["id"] for r in core}
    core_all = [r for r in all_results
                if r["id"] in core_ids or r.get("derived_from") in core_ids]
    by_length = {}
    for name, _, _ in BUCKETS:
        rs = [r for r in core_all if bucket_of(r["words"]) == name]
        if rs:
            by_length[name] = prf(*counts(rs))
    lat = sorted(r["latency_ms"] for r in all_results)
    return {
        "overall_core": prf(ctp, cfp, ctn, cfn),
        "core_by_class": core_by_class,
        "robustness": robustness,
        "by_length_core_incl_derived": by_length,
        "latency_ms": {
            "n": len(lat),
            "median": round(lat[len(lat) // 2], 1) if lat else 0,
            "p90": round(lat[int(len(lat) * 0.9)] if lat else 0, 1),
            "max": round(max(lat) if lat else 0, 1),
        },
    }


def write_report(report_dir: Path, config: dict, metrics: dict,
                 results: list[dict], errors: dict) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    (report_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    with open(report_dir / "predictions.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(results[0].keys()))
        w.writeheader()
        w.writerows(results)

    o = metrics["overall_core"]
    with open(report_dir / "confusion_matrix.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["actual \\ predicted (CORE human/ai only)", "AI", "HUMAN"])
        w.writerow(["AI", o["tp"], o["fn"]])
        w.writerow(["HUMAN", o["fp"], o["tn"]])

    def err_lines(rs):
        return "\n".join(
            f"| `{r['id']}` | {r['label']} | {r['prediction']} | "
            f"{r['ai_probability']:.3f} | {r['words']} | {r['category']} |"
            for r in rs
        ) or "_none_"

    core_cls = metrics["core_by_class"]
    s = metrics["robustness"]["short"]
    p = metrics["robustness"]["paraphrased"]
    m = metrics["robustness"]["mixed"]

    md = f"""# GPTase Detector — Evaluation Report

- **Date (UTC):** {config['timestamp_utc']}
- **Mode:** {config['mode']} (backend: `{config['backend']}`)
- **Model:** `{config['model']}` (torch {config['torch_version']}, transformers {config['transformers_version']})
- **Dataset:** `{config['dataset']}` (sha256 `{config['dataset_sha256'][:12]}…`, n={config['n_primary']} primary + {config['n_derived']} derived truncation probes)
- **Headline scope:** CORE binary slice only (`human` + `ai`, n={o['n']}). Robustness slices are reported separately below.

> AI is the positive class. Scores shown are raw model softmax probabilities;
> no calibration has been established, so they are reported as probabilities,
> never as confidence.

## Headline — core binary evaluation (clean ground truth)

| Metric | Value |
|---|---|
| Accuracy | {o['accuracy']:.3f} |
| Precision (AI) | {o['precision_ai']:.3f} |
| Recall (AI) | {o['recall_ai']:.3f} |
| F1 (AI) | {o['f1_ai']:.3f} |

Confusion matrix (rows = actual, columns = predicted; core only): TP={o['tp']}, FN={o['fn']}, FP={o['fp']}, TN={o['tn']}.
See `confusion_matrix.csv`.

| Core class | n | Correct | Accuracy |
|---|---|---|---|
"""
    for cat in CORE_CATEGORIES:
        c = core_cls[cat]
        md += f"| {cat} | {c['n']} | {c['tp'] + c['tn']} | {c['accuracy']:.3f} |\n"

    md += f"""
## Robustness — short text (separate; genuine authorship labels)

Accuracy {s['accuracy']:.3f}, precision {s['precision_ai']:.3f}, recall {s['recall_ai']:.3f}, F1 {s['f1_ai']:.3f}
(TP={s['tp']}, FN={s['fn']}, FP={s['fp']}, TN={s['tn']}, n={s['n']}).

## Robustness — paraphrased text (separate; origin labels, not authorship truth)

Detection rate on paraphrased AI-origin text: **{p['detection_rate_paraphrased_ai']:.3f}**
({p['tp']}/{p['n']} flagged AI, {p['fn']} evaded as HUMAN).
Precision/F1 are undefined for this single-label slice and omitted.

> Label note: paraphrase samples are labeled AI **by origin** — a human rewrote
> AI-pastiche source text. A human author substantially involved in the wording
> means these labels record provenance, not pure authorship. They measure
> robustness to rewriting, not binary classification correctness.

## Robustness — mixed text (separate; majority-class convention)

Accuracy under majority labeling: **{m['accuracy']:.3f}**
(TP={m['tp']}, FN={m['fn']}, FP={m['fp']}, TN={m['tn']}, n={m['n']}).
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
"""
    for name, b in metrics["by_length_core_incl_derived"].items():
        md += f"| {name} | {b['n']} | {b['accuracy']:.3f} | {b['precision_ai']:.3f} | {b['recall_ai']:.3f} | {b['f1_ai']:.3f} |\n"
    lat = metrics["latency_ms"]
    md += f"""
## Latency (all runs)

median {lat['median']:.0f} ms, p90 {lat['p90']:.0f} ms, max {lat['max']:.0f} ms (n={lat['n']}).

## False positives, core (HUMAN predicted AI) — review these

| id | actual | pred | ai_p | words | category |
|---|---|---|---|---|---|
{err_lines(errors['fp_core'])}

## False negatives, core (AI predicted HUMAN) — review these

| id | actual | pred | ai_p | words | category |
|---|---|---|---|---|---|
{err_lines(errors['fn_core'])}

## Robustness errors (all non-core FP/FN) — review separately

| id | actual | pred | ai_p | words | category |
|---|---|---|---|---|---|
{err_lines(errors['robustness'])}

## Reproduce

```
venv\\Scripts\\python.exe eval/run_eval.py --mode {config['mode']}
```

Methodology and limitations: see `docs/EVALUATION.md`.
"""
    (report_dir / "report.md").write_text(md, encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Evaluate GPTase Detector on the versioned dataset.")
    ap.add_argument("--dataset", default="eval/dataset.v1.jsonl")
    ap.add_argument("--mode", choices=["direct", "api"], default="direct")
    ap.add_argument("--api-url", default="http://127.0.0.1:8000")
    ap.add_argument("--outdir", default="reports")
    ap.add_argument("--no-derived", action="store_true",
                    help="skip sentence-boundary truncation probes")
    args = ap.parse_args()

    dataset_path = PROJECT_ROOT / args.dataset
    rows = load_dataset(dataset_path)
    print(f"Loaded {len(rows)} primary samples from {dataset_path}")

    derived = [] if args.no_derived else build_derived(rows)
    print(f"Built {len(derived)} derived truncation probes")

    import torch, transformers
    from backend.app.config import settings

    backend = DirectBackend() if args.mode == "direct" else ApiBackend(args.api_url)
    print(f"Backend: {args.mode} ({backend.name}), model: {settings.model_name}")

    all_rows = rows + derived
    results = evaluate(all_rows, backend)
    primary = [r for r in results if not r["derived"]]
    metrics = summarize(primary, results)

    o = metrics["overall_core"]
    print(f"\nHeadline (CORE human/ai, n={o['n']}): acc={o['accuracy']:.3f} "
          f"prec={o['precision_ai']:.3f} rec={o['recall_ai']:.3f} "
          f"f1={o['f1_ai']:.3f} "
          f"(TP={o['tp']} FP={o['fp']} TN={o['tn']} FN={o['fn']})")
    for cat in ROBUSTNESS_CATEGORIES:
        r = metrics["robustness"][cat]
        extra = (f" detection_rate={r['detection_rate_paraphrased_ai']:.3f}"
                 if cat == "paraphrased" else "")
        print(f"Robustness [{cat}]: acc={r['accuracy']:.3f} n={r['n']}{extra}")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    digest = sha256_file(dataset_path)
    report_dir = PROJECT_ROOT / args.outdir / f"{stamp}-{digest[:7]}-{args.mode}"
    config = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "mode": args.mode,
        "backend": backend.name,
        "model": settings.model_name,
        "torch_version": torch.__version__,
        "transformers_version": transformers.__version__,
        "dataset": str(dataset_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
        "dataset_sha256": digest,
        "n_primary": len(rows),
        "n_derived": len(derived),
        "positive_class": POSITIVE,
        "headline_scope": f"core binary ({'+'.join(CORE_CATEGORIES)})",
        "robustness_scopes": list(ROBUSTNESS_CATEGORIES),
    }
    core_primary = [r for r in primary if r["category"] in CORE_CATEGORIES]
    errors = {
        "fp_core": sorted([r for r in core_primary if r["outcome"] == "FP"],
                          key=lambda r: -r["ai_probability"]),
        "fn_core": sorted([r for r in core_primary if r["outcome"] == "FN"],
                          key=lambda r: r["ai_probability"]),
        "robustness": sorted(
            [r for r in primary
             if r["category"] in ROBUSTNESS_CATEGORIES and not r["correct"]],
            key=lambda r: (r["category"], r["id"])),
    }
    write_report(report_dir, config, metrics, results, errors)
    print(f"Report written to {report_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
