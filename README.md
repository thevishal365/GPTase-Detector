# GPTase Detector

Check your text for signs of AI-generated writing.

GPTase Detector analyzes pasted text with a ModernBERT classifier and estimates
whether it shows signals associated with AI-generated writing. Results are
**probabilistic estimates, not proof of authorship** — they should be used as
guidance only, never as evidence of who wrote a text.

- **Live app:** https://gptase-detector.vercel.app
- **GitHub:** https://github.com/thevishal365/GPTase-Detector
- **Production API:** https://gptase-backend-593057896819.asia-south1.run.app

## Architecture

```
User
→ Vercel / Next.js frontend
→ Next.js /api/analyze rewrite (BACKEND_URL)
→ Google Cloud Run
→ FastAPI + ModernBERT detector
→ AI/HUMAN probabilities
→ result displayed in UI
```

The browser only ever talks to the Next.js frontend. The frontend proxies
`/api/analyze` server-side to the FastAPI backend, so no API keys or backend
URLs are exposed to the client.

## Features

- Responsive analysis workspace: editor, live word/character counts, and result panel
- 30-word minimum guidance for reliable estimates; 10,000 character maximum
- `Ctrl`/`Cmd` + `Enter` to analyze, one-click sample texts (human and AI-like)
- Loading, error (with retry), and success states
- Result verdict with AI/human probability breakdown, analysis metadata, and a
  plain-language explanation of how to read the result
- Compact limitations notice and full disclaimer
- Keyboard navigation, visible focus states, and reduced-motion support

## Tech stack

**Frontend:** Next.js 16.3.6, TypeScript, App Router, Tailwind CSS — deployed on Vercel.
The production backend address is configured through the server-side `BACKEND_URL`
environment variable; local development falls back to `http://127.0.0.1:8000`.

**Backend:** Python, FastAPI, Uvicorn, PyTorch, Hugging Face Transformers —
deployed on Google Cloud Run. Model: `rasbt/ai-text-detector-modernbert`,
loaded once at startup with `torch.no_grad()` inference.

## Local development

### Prerequisites

- Python 3.11+
- Node.js 18+

### 1. Clone the repository

```bash
git clone https://github.com/thevishal365/GPTase-Detector.git
cd GPTase-Detector
```

### 2. Create and activate a virtual environment

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### 3. Install backend dependencies

```bash
pip install -r backend/requirements.txt
```

### 4. Run FastAPI locally

```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

The API is available at `http://127.0.0.1:8000`
(interactive docs at `http://127.0.0.1:8000/docs`).

### 5. Run the frontend locally

```bash
cd frontend
npm install
npm run dev
```

The app is available at `http://localhost:3000`.

Local Next.js development proxies `/api/*` to `http://127.0.0.1:8000` when
`BACKEND_URL` is not set. In production, Vercel sets `BACKEND_URL` to the
public Cloud Run backend URL — no frontend code changes needed.

## Docker

```bash
# Build (model weights are baked into the image)
docker build -t gptase-detector-backend .

# Run locally
docker run --rm -p 8000:8000 -e PORT=8000 gptase-detector-backend
```

Health check:

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

API test:

```bash
curl -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"text": "I grabbed coffee this morning at that new place downtown."}'
```

## API reference

### `GET /health`

```json
{
  "status": "ok"
}
```

### `POST /api/analyze`

Request:

```json
{
  "text": "Text to analyze for AI generation"
}
```

Response schema:

```json
{
  "prediction": "HUMAN",
  "human_probability": 0.9453,
  "ai_probability": 0.0527,
  "character_count": 119,
  "word_count": 22
}
```

`prediction` is either `"HUMAN"` or `"AI"`. The probability values are raw
model outputs — they are uncalibrated and must not be read as calibrated
confidence scores.

Validation rules:

- `text` is required; empty or whitespace-only input is rejected (422)
- Maximum length: 10,000 characters (422 when exceeded)

## Testing

```bash
# From the repository root, with the virtual environment activated
python -m pytest backend/tests/test_api.py -v
```

Backend suite: **9 passed** (health, valid analysis, empty/whitespace/missing
input, length limit, inference errors, probability sanity). The containerized
backend was also tested locally (`/health` 200, real ModernBERT inference via
`/api/analyze`), and the production Cloud Run backend plus the live Vercel
frontend were verified end to end through the browser UI.

## Evaluation

A reproducible harness (`eval/run_eval.py`) runs a versioned, hand-curated
dataset (`eval/dataset.v1.jsonl`, 80 samples across human, AI, short,
paraphrased, and mixed strata) through the detector, in-process or via the
live API (prediction parity verified across both modes). Full methodology,
reports, and limitations: `docs/EVALUATION.md`, `reports/`.

Core binary evaluation (clean human + AI samples, n = 36):

- **Accuracy: 94.4%** on the small curated core evaluation set
- Precision: 90.0% · Recall: 100% · F1: 94.7%
- Confusion matrix: TP = 18, FP = 2, TN = 16, FN = 0

Known false positives: literary narrative and dialogue/story-style
human-written text.

Separate robustness slices (not part of headline metrics):

- Short text: accuracy 0.625 (precision 0.600, recall 0.750, F1 0.667)
- Paraphrased AI-origin text: 10/12 flagged, 2 evaded detection
- Mixed human/AI text: accuracy 0.625 under majority labeling
- Length trend: short 0.625 → medium 0.815 → long 1.000

Evaluation caveats: small curated dataset, single-author curation bias,
English-only, manual paraphrases, synthetic mixed text, nothing over 80 words
tested, uncalibrated probabilities, CPU/library-version determinism. These
results describe the curated set and must **not** be presented as general
real-world accuracy.

## Deployment overview

- **Frontend:** Vercel (`https://gptase-detector.vercel.app`), production
  backend wired via the `BACKEND_URL` environment variable.
- **Backend:** Google Cloud Run, region `asia-south1`, image stored in Google
  Artifact Registry. The Docker image bundles CPU-only PyTorch dependencies
  and baked ModernBERT weights. Production service: 2 GiB memory, 1 CPU,
  concurrency 1, min instances 0, max instances 1.
- The backend is publicly reachable so that the Vercel rewrite can proxy
  `/api/analyze` to Cloud Run; browsers never call Cloud Run directly.

## Project structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI application (/health, /api/analyze)
│   │   ├── config.py        # Settings (model name, max text length)
│   │   ├── schemas.py       # Pydantic request/response models
│   │   └── detector.py      # Model loading (once) + torch.no_grad() inference
│   ├── tests/
│   │   └── test_api.py      # API tests (9 tests)
│   └── requirements.txt     # Backend dependencies
├── frontend/
│   ├── app/
│   │   ├── page.tsx         # Analysis workspace UI
│   │   ├── layout.tsx       # Root layout + metadata
│   │   ├── globals.css      # Global styles
│   │   └── icon.svg         # Favicon
│   ├── public/
│   │   └── brand/
│   │       └── logo.svg     # Header wordmark
│   ├── next.config.ts       # BACKEND_URL rewrite to FastAPI
│   └── package.json
├── eval/
│   ├── dataset.v1.jsonl     # Versioned 80-sample evaluation set
│   └── run_eval.py          # Reproducible evaluation harness
├── reports/                 # Timestamped evaluation outputs
├── docs/
│   └── EVALUATION.md        # Evaluation methodology and limitations
├── scripts/
│   └── test_detector.py     # CLI model smoke test
├── Dockerfile               # Cloud Run backend image
├── .dockerignore
├── requirements.txt         # Core dependencies
└── README.md
```

## Limitations

- Predictions are probabilistic and the model makes mistakes — notably on
  very short texts and on polished narrative human prose.
- Paraphrasing can evade detection; mixed human/AI text has no meaningful
  single ground-truth label.
- English-only; performance on other languages is unknown.
- Model outputs are uncalibrated probabilities, not confidence levels.
- Never use results as sole evidence for accusations, grading, or
  employment decisions.
