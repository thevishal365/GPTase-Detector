# GPTase Detector backend — Cloud Run container.
#
# Build:  docker build -t gptase-detector-backend .
# Run:    docker run --rm -p 8000:8000 -e PORT=8000 gptase-detector-backend
#
# Notes:
# - torch is installed from the PyTorch CPU index first (no CUDA libs needed
#   for inference; keeps the image small). backend/requirements.txt is left
#   untouched — pip sees the torch>=2.0.0 requirement as already satisfied.
# - The ModernBERT weights are downloaded into the image at build time so
#   container startup on Cloud Run is fast and deterministic.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/app/.cache/huggingface \
    HF_HUB_OFFLINE=1 \
    TOKENIZERS_PARALLELISM=false

WORKDIR /app

# Requirements file must exist before pip references it.
COPY backend/requirements.txt ./backend/requirements.txt

# CPU-only torch first (see header note); then the pinned backend deps.
RUN pip install --upgrade pip && \
    pip install --index-url https://download.pytorch.org/whl/cpu torch && \
    pip install -r backend/requirements.txt

# Backend source (model weights next).
COPY backend/ ./backend/

# Bake the model + tokenizer into the image so first boot needs no download.
# HF_HUB_OFFLINE is unset for this step only: the ENV above keeps runtime
# offline/deterministic, but the bake itself must reach huggingface.co.
RUN HF_HUB_OFFLINE=0 python -c "from backend.app.config import settings; \
    from transformers import AutoTokenizer, AutoModelForSequenceClassification; \
    AutoTokenizer.from_pretrained(settings.model_name); \
    AutoModelForSequenceClassification.from_pretrained(settings.model_name)"

EXPOSE 8000

# Shell form via sh -c so the Cloud Run PORT variable actually expands.
# Defaults to 8000 for local `docker run` without -e PORT.
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
