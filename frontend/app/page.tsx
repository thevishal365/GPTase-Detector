"use client";

import Image from "next/image";
import { useCallback, useMemo, useRef, useState } from "react";

/* ---------------------------------- types --------------------------------- */

interface AnalysisResult {
  prediction: string;
  human_probability: number;
  ai_probability: number;
  character_count: number;
  word_count: number;
}

type WorkspaceState =
  | "empty"
  | "too-short"
  | "ready"
  | "too-long"
  | "loading"
  | "success"
  | "error";

const MAX_CHARS = 10_000;
const MIN_WORDS_RELIABLE = 30;
const MIN_CHARS_RELIABLE = 150;

const SAMPLE_HUMAN =
  "I grabbed coffee this morning at that new place downtown — the one with the chipped mugs and the dog asleep by the door. The barista remembered my order, somehow, and we laughed about how bad I am at small talk before 9am. Nothing special happened, really. Just a good, ordinary start.";

const SAMPLE_AI =
  "In today's rapidly evolving digital landscape, organizations must leverage cutting-edge solutions to stay competitive. This comprehensive guide explores the key benefits, best practices, and strategic considerations for maximizing efficiency. By following these proven methodologies, stakeholders can unlock unprecedented value and drive sustainable growth.";

/* --------------------------------- icons ---------------------------------- */

function Icon({
  d,
  className = "h-4 w-4",
  filled = false,
}: {
  d: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={filled ? undefined : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const PATHS = {
  logo: "M12 2v4M12 18v4M2 12h4M18 12h4M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1",
  analyze:
    "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m6 4h4",
  clear: "M6 6l12 12M18 6L6 18",
  copy: "M8 8h12v12H8zM4 16V4h12",
  check: "M4 12.5l5 5L20 6.5",
  alert:
    "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  human: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  cpu: "M9 2v2m6-2v2M9 20v2m6-2v2M2 9h2m-2 6h2M20 9h2m-2 6h2M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm3 4h8v6H8z",
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6",
  clock: "M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4m0-4h.01",
  steps: "M4 6h16M4 12h16M4 18h10",
  refresh: "M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16m0 5v-5h5",
};

/* -------------------------------- helpers --------------------------------- */

function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return text.trim() === "" ? 0 : words.length;
}

function confidenceBand(confidencePct: number): {
  label: string;
  tone: string;
} {
  if (confidencePct >= 90)
    return { label: "High confidence", tone: "text-slate-900" };
  if (confidencePct >= 70)
    return { label: "Moderate confidence", tone: "text-slate-700" };
  if (confidencePct >= 55)
    return { label: "Low confidence — treat as uncertain", tone: "text-amber-700" };
  return { label: "Very uncertain — near chance", tone: "text-amber-700" };
}

function formatPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

/* --------------------------------- page ----------------------------------- */

export default function Home() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = text.length;
  const wordCount = useMemo(() => countWords(text), [text]);
  const readingSecs = Math.max(1, Math.round((wordCount / 200) * 60));
  const overLimit = charCount > MAX_CHARS;
  const isEmpty = text.trim().length === 0;
  const isShort =
    !isEmpty &&
    (wordCount < MIN_WORDS_RELIABLE || charCount < MIN_CHARS_RELIABLE);

  const workspaceState: WorkspaceState = loading
    ? "loading"
    : error
      ? "error"
      : result
        ? "success"
        : isEmpty
          ? "empty"
          : overLimit
            ? "too-long"
            : isShort
              ? "too-short"
              : "ready";

  const canAnalyze = !isEmpty && !overLimit && !loading;

  const handleAnalyze = useCallback(async () => {
    if (!text.trim() || overLimit || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setLatencyMs(null);
    const started = performance.now();
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.detail ||
            errorData?.error ||
            `Server error: ${response.status}`
        );
      }
      const data: AnalysisResult = await response.json();
      setResult(data);
      setLatencyMs(Math.round(performance.now() - started));
    } catch (err) {
      if (err instanceof TypeError) {
        setError(
          "Unable to reach the analysis API. Make sure the backend is running on port 8000, then try again."
        );
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }, [text, overLimit, loading]);

  const handleClear = useCallback(() => {
    setText("");
    setResult(null);
    setError(null);
    setLatencyMs(null);
    textareaRef.current?.focus();
  }, []);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    const summary = `GPTase Detector: ${result.prediction} — AI ${formatPct(result.ai_probability)}, Human ${formatPct(result.human_probability)} (${result.word_count} words). Probabilistic estimate, not proof of authorship.`;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [result]);

  const insertSample = useCallback((sample: string) => {
    setText(sample);
    setResult(null);
    setError(null);
    setLatencyMs(null);
    textareaRef.current?.focus();
  }, []);

  const aiPct = result ? result.ai_probability * 100 : 0;
  const humanPct = result ? result.human_probability * 100 : 0;
  const confidencePct = result
    ? Math.max(result.ai_probability, result.human_probability) * 100
    : 0;
  const band = confidenceBand(confidencePct);
  const isAI = result?.prediction === "AI";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Skip link */}
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow"
      >
        Skip to analysis workspace
      </a>

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center">
            <Image
              src="/brand/logo.svg"
              alt="GPTase Detector"
              width={762}
              height={111}
              priority
              className="h-7 w-auto sm:h-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-slate-600 sm:inline-block">
              ModernBERT
            </span>
            <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-slate-600 md:inline-block">
              POST /api/analyze
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {/* Intro — compact, product-oriented */}
        <section className="pb-6 pt-8 sm:pt-10" aria-labelledby="page-title">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-indigo-600">
            AI text detector
          </p>
          <h1
            id="page-title"
            className="max-w-2xl text-2xl font-semibold tracking-tight text-slate-900 sm:text-[32px] sm:leading-[1.2]"
          >
            Check your text for signs of AI-generated writing.
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-600">
            Paste at least {MIN_WORDS_RELIABLE} words for a reliable estimate.
            Results are probabilities, not proof.
          </p>
        </section>

        {/* Workspace */}
        <div
          id="workspace"
          className="grid scroll-mt-20 gap-4 lg:grid-cols-[1.12fr_0.88fr] lg:items-start"
        >
          {/* Editor card */}
          <section
            aria-labelledby="editor-heading"
            className="rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
              <h2
                id="editor-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Text to analyze
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => insertSample(SAMPLE_HUMAN)}
                  disabled={loading}
                  className="min-h-[44px] cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Sample: human
                </button>
                <button
                  type="button"
                  onClick={() => insertSample(SAMPLE_AI)}
                  disabled={loading}
                  className="min-h-[44px] cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Sample: AI-like
                </button>
                {text && (
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={loading}
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Clear text input"
                  >
                    <Icon d={PATHS.clear} className="h-3.5 w-3.5" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="px-4 pt-4 sm:px-5">
              <label htmlFor="text-input" className="sr-only">
                Text to analyze for AI generation (maximum {MAX_CHARS.toLocaleString()} characters)
              </label>
              <textarea
                ref={textareaRef}
                id="text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canAnalyze) {
                    e.preventDefault();
                    handleAnalyze();
                  }
                }}
                placeholder="Paste or type the text here…"
                rows={12}
                disabled={loading}
                maxLength={MAX_CHARS + 500}
                aria-describedby="input-status input-guidance"
                aria-invalid={overLimit}
                className={`editor-textarea block min-h-[280px] w-full resize-y rounded-lg border bg-white px-3.5 py-3 text-slate-900 transition-colors duration-150 placeholder:text-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 sm:min-h-[320px] ${
                  overLimit
                    ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                    : "border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                }`}
              />

              {/* Status + stats row */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                <p
                  id="input-status"
                  role="status"
                  className={`text-[13px] font-medium ${
                    overLimit
                      ? "text-red-600"
                      : workspaceState === "too-short"
                        ? "text-amber-700"
                        : workspaceState === "ready" ||
                            workspaceState === "success"
                          ? "text-emerald-700"
                          : "text-slate-500"
                  }`}
                >
                  {loading
                    ? "Analyzing…"
                    : overLimit
                      ? `${(charCount - MAX_CHARS).toLocaleString()} characters over the ${MAX_CHARS.toLocaleString()} limit — shorten the text to analyze.`
                      : isEmpty
                        ? "Empty — paste text to begin."
                        : isShort
                          ? `Only ${wordCount} word${wordCount === 1 ? "" : "s"} — ${MIN_WORDS_RELIABLE}+ recommended for reliability. You can still analyze.`
                          : `${wordCount} words — ready to analyze.`}
                </p>
                <p
                  id="input-guidance"
                  className="font-mono text-xs tabular-nums text-slate-500"
                  aria-label={`${wordCount} words, ${charCount} characters`}
                >
                  {wordCount.toLocaleString()} words ·{" "}
                  {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} chars ·{" "}
                  ~{readingSecs}s read
                </p>
              </div>

              {/* Character progress (visible when approaching limit) */}
              {charCount > MAX_CHARS * 0.75 && (
                <div
                  className="pb-3"
                  role="progressbar"
                  aria-valuenow={Math.min(100, (charCount / MAX_CHARS) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Character limit usage"
                >
                  <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${overLimit ? "bg-red-500" : "bg-indigo-500"}`}
                      style={{
                        width: `${Math.min(100, (charCount / MAX_CHARS) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="hidden text-xs text-slate-500 sm:block">
                Ctrl + Enter to analyze
              </p>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                aria-label={loading ? "Analyzing text" : "Analyze text"}
                aria-busy={loading}
                className={`inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-semibold text-white transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 sm:w-auto sm:min-w-[200px] ${
                  canAnalyze
                    ? "bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800"
                    : ""
                }`}
              >
                {loading ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-90"
                        fill="currentColor"
                        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
                      />
                    </svg>
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Icon d={PATHS.analyze} className="h-4 w-4" />
                    Analyze text
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Result panel — natural continuation of the workspace */}
          <section
            aria-labelledby="result-heading"
            aria-live="polite"
            className="rounded-xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-[68px]"
          >
            <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
              <h2
                id="result-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Result
              </h2>
            </div>

            <div className="px-4 py-4 sm:px-5 sm:py-5">
              {/* EMPTY */}
              {workspaceState === "empty" && (
                <div className="py-6 text-center">
                  <span
                    className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500"
                    aria-hidden="true"
                  >
                    <Icon d={PATHS.doc} className="h-5 w-5" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-slate-800">
                    No text yet
                  </p>
                  <p className="mx-auto mt-1 max-w-[280px] text-[13px] leading-relaxed text-slate-500">
                    Paste text on the left, then run analysis. Your result will
                    appear here.
                  </p>
                  <ol className="mx-auto mt-4 max-w-[280px] space-y-2 text-left">
                    {[
                      "Paste at least 30 words",
                      "Press Analyze text",
                      "Read the AI likelihood",
                    ].map((step, i) => (
                      <li
                        key={step}
                        className="flex items-center gap-2.5 text-[13px] text-slate-600"
                      >
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-[11px] font-medium text-slate-600"
                          aria-hidden="true"
                        >
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* TYPING / READY / SHORT / LONG hints */}
              {(workspaceState === "ready" ||
                workspaceState === "too-short" ||
                workspaceState === "too-long") && (
                <div className="py-6 text-center">
                  <span
                    className={`mx-auto flex h-11 w-11 items-center justify-center rounded-lg border text-slate-400 ${
                      workspaceState === "too-long"
                        ? "border-red-200 bg-red-50 text-red-400"
                        : workspaceState === "too-short"
                          ? "border-amber-200 bg-amber-50 text-amber-500"
                          : "border-slate-200 bg-slate-50"
                    }`}
                    aria-hidden="true"
                  >
                    <Icon
                      d={
                        workspaceState === "too-long"
                          ? PATHS.alert
                          : PATHS.steps
                      }
                      className="h-5 w-5"
                    />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-slate-800">
                    {workspaceState === "too-long"
                      ? "Text exceeds the limit"
                      : workspaceState === "too-short"
                        ? "Text is quite short"
                        : "Ready to analyze"}
                  </p>
                  <p className="mx-auto mt-1 max-w-[300px] text-[13px] leading-relaxed text-slate-500">
                    {workspaceState === "too-long"
                      ? `Shorten to ${MAX_CHARS.toLocaleString()} characters or fewer, then press Analyze.`
                      : workspaceState === "too-short"
                        ? "Short texts are harder to classify. For a more reliable estimate, add more context — or analyze as-is."
                        : "Press Analyze text (or Ctrl + Enter). The verdict and probabilities will appear here."}
                  </p>
                </div>
              )}

              {/* LOADING */}
              {workspaceState === "loading" && (
                <div aria-label="Analysis in progress">
                  <div className="flex items-center gap-3">
                    <svg
                      className="h-5 w-5 animate-spin text-indigo-600"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-90"
                        fill="currentColor"
                        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
                      />
                    </svg>
                    <p className="text-sm font-medium text-slate-700">
                      Running ModernBERT classifier…
                    </p>
                  </div>
                  <div className="mt-4 space-y-3" aria-hidden="true">
                    <div className="skeleton-pulse h-14 rounded-lg bg-slate-100" />
                    <div className="skeleton-pulse h-3 rounded-full bg-slate-100" />
                    <div className="skeleton-pulse h-3 w-4/5 rounded-full bg-slate-100" />
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="skeleton-pulse h-12 rounded-lg bg-slate-100" />
                      <div className="skeleton-pulse h-12 rounded-lg bg-slate-100" />
                      <div className="skeleton-pulse h-12 rounded-lg bg-slate-100" />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Usually takes a few seconds. The editor is paused meanwhile.
                  </p>
                </div>
              )}

              {/* ERROR */}
              {workspaceState === "error" && error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-red-500" aria-hidden="true">
                      <Icon d={PATHS.alert} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-red-800">
                        Analysis failed
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-red-700">
                        {error}
                      </p>
                      <button
                        type="button"
                        onClick={handleAnalyze}
                        className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-red-700"
                      >
                        <Icon d={PATHS.refresh} className="h-4 w-4" />
                        Try again
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SUCCESS */}
              {workspaceState === "success" && result && (
                <div>
                  {/* Verdict */}
                  <div
                    className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                      isAI
                        ? "border-indigo-200 bg-indigo-50"
                        : "border-emerald-200 bg-emerald-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-lg text-white ${
                          isAI ? "bg-indigo-600" : "bg-emerald-600"
                        }`}
                        aria-hidden="true"
                      >
                        <Icon
                          d={isAI ? PATHS.cpu : PATHS.human}
                          className="h-5 w-5"
                        />
                      </span>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Detector predicts
                        </p>
                        <p className="text-lg font-semibold leading-tight tracking-tight text-slate-900">
                          {isAI ? "Likely AI-generated" : "Likely human-written"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xl font-medium tabular-nums text-slate-900">
                        {formatPct(
                          isAI ? result.ai_probability : result.human_probability
                        )}
                      </p>
                      <p className={`text-xs font-medium ${band.tone}`}>
                        {band.label}
                      </p>
                    </div>
                  </div>

                  {/* Stacked probability bar — one coherent visual */}
                  <div className="mt-4">
                    <div
                      className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
                      role="img"
                      aria-label={`AI likelihood ${formatPct(result.ai_probability)}, human likelihood ${formatPct(result.human_probability)}`}
                    >
                      <div
                        className="verdict-fill h-full bg-indigo-600"
                        style={{ width: `${aiPct}%` }}
                      />
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${humanPct}%` }}
                      />
                    </div>
                    <dl className="mt-3 space-y-2.5">
                      <div className="flex items-center justify-between text-sm">
                        <dt className="flex items-center gap-2 text-slate-600">
                          <span
                            className="h-2.5 w-2.5 rounded-sm bg-indigo-600"
                            aria-hidden="true"
                          />
                          AI likelihood
                        </dt>
                        <dd className="font-mono font-medium tabular-nums text-slate-900">
                          {formatPct(result.ai_probability)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <dt className="flex items-center gap-2 text-slate-600">
                          <span
                            className="h-2.5 w-2.5 rounded-sm bg-emerald-500"
                            aria-hidden="true"
                          />
                          Human likelihood
                        </dt>
                        <dd className="font-mono font-medium tabular-nums text-slate-900">
                          {formatPct(result.human_probability)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Metadata */}
                  <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
                    {[
                      {
                        label: "Words",
                        value: result.word_count.toLocaleString(),
                        icon: PATHS.doc,
                      },
                      {
                        label: "Characters",
                        value: result.character_count.toLocaleString(),
                        icon: PATHS.steps,
                      },
                      {
                        label: latencyMs !== null ? `${(latencyMs / 1000).toFixed(1)}s` : "—",
                        value: "",
                        icon: PATHS.clock,
                        customLabel: "Analysis time",
                      },
                    ].map((m) => (
                      <div
                        key={m.label + m.value}
                        className="rounded-lg bg-slate-50 px-2 py-2.5"
                      >
                        <dt className="order-2 mt-0.5 text-[11px] font-medium text-slate-500">
                          {m.customLabel ?? m.label}
                        </dt>
                        <dd className="font-mono text-[15px] font-medium tabular-nums text-slate-900">
                          {m.customLabel ? m.label : m.value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="font-mono text-[11px] text-slate-500">
                      model output · {result.prediction}
                    </p>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800"
                      aria-label="Copy result summary"
                    >
                      <Icon
                        d={copied ? PATHS.check : PATHS.copy}
                        className="h-3.5 w-3.5"
                      />
                      {copied ? "Copied" : "Copy summary"}
                    </button>
                  </div>

                  {/* Interpretation vs model output */}
                  <details className="group mt-3 rounded-lg border border-slate-200">
                    <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                      <Icon d={PATHS.info} className="h-4 w-4 text-slate-400" />
                      How to read this result
                      <span
                        className="ml-auto text-slate-400 transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      >
                        <Icon d="M6 9l6 6 6-6" className="h-4 w-4" />
                      </span>
                    </summary>
                    <div className="space-y-2 border-t border-slate-100 px-3.5 py-3 text-[13px] leading-relaxed text-slate-600">
                      <p>
                        <strong className="font-semibold text-slate-800">
                          Model output:
                        </strong>{" "}
                        the classifier assigns a probability to each class. The
                        higher value wins the prediction shown above.
                      </p>
                      <p>
                        <strong className="font-semibold text-slate-800">
                          Interpretation:
                        </strong>{" "}
                        {confidencePct >= 90
                          ? "the model is strongly favoring one class — still a statistical guess, not proof."
                          : confidencePct >= 70
                            ? "the model leans clearly but not decisively — weigh it against context."
                            : "the scores are close — this result is weak evidence either way. Longer text usually helps."}{" "}
                        This tool cannot explain which words drove the score.
                      </p>
                    </div>
                  </details>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Supporting info — progressive disclosure below the fold */}
        <section
          aria-label="About this detector"
          className="mt-4 grid gap-4 md:grid-cols-3"
        >
          {[
            {
              title: "How it works",
              body: "A ModernBERT classifier fine-tuned on human and AI text compares statistical patterns in your input and returns a probability for each class.",
              icon: PATHS.cpu,
            },
            {
              title: "When to trust it",
              body: "Longer, natural prose (30+ words) gives the most stable estimates. Very short, heavily formatted, or unusual text tends to be less reliable.",
              icon: PATHS.check,
            },
            {
              title: "Limitations",
              body: "Formal human writing can score as AI and vice versa. Never use the score alone for accusations, grading, or hiring decisions.",
              icon: PATHS.alert,
            },
          ].map((c) => (
            <article
              key={c.title}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"
                aria-hidden="true"
              >
                <Icon d={c.icon} className="h-4 w-4" />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">
                {c.title}
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
                {c.body}
              </p>
            </article>
          ))}
        </section>

        {/* Compact disclaimer */}
        <aside
          aria-label="Disclaimer"
          className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
        >
          <span className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true">
            <Icon d={PATHS.alert} className="h-4 w-4" />
          </span>
          <p className="text-[13px] leading-relaxed text-amber-900">
            <strong className="font-semibold">Probabilistic estimate only —</strong>{" "}
            this detector can be wrong. Results are guidance, never proof of who
            wrote a text.
          </p>
        </aside>

        <footer className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-slate-200 pt-5 text-xs text-slate-500 sm:flex-row">
          <p>
            <span className="font-semibold text-slate-500">GPTase Detector</span>{" "}
            · Built by Vishal ·{" "}
            <a
              href="https://x.com/thevishal365"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Vishal on X"
              className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 transition-colors duration-150 hover:text-slate-900"
            >
              X
            </a>
          </p>
          <p className="font-mono">prediction + probabilities · no data stored</p>
        </footer>
      </main>
    </div>
  );
}
