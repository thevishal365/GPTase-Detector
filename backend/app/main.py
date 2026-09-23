"""FastAPI application for AI text detection."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .detector import detector
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    HealthResponse,
    ErrorResponse,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup."""
    detector.load()
    yield


app = FastAPI(
    title="GPTase Detector API",
    description="AI-generated text detection API",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",  # Alternative dev ports
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError
) -> JSONResponse:
    """Handle validation errors with clean error messages."""
    errors = exc.errors()
    messages = []
    for error in errors:
        loc = " -> ".join(str(x) for x in error["loc"])
        msg = error["msg"]
        messages.append(f"{loc}: {msg}")

    return JSONResponse(
        status_code=422,
        content={
            "error": "Validation error",
            "detail": "; ".join(messages)
        }
    )


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse()


@app.options("/api/analyze")
async def options_analyze():
    """Handle CORS preflight requests."""
    return {}


@app.post(
    "/api/analyze",
    response_model=AnalyzeResponse,
    responses={
        422: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    }
)
async def analyze_text(request: AnalyzeRequest) -> AnalyzeResponse:
    """
    Analyze text for AI generation.

    Returns prediction and probability scores.
    """
    # Check max length
    if len(request.text) > settings.max_text_length:
        raise HTTPException(
            status_code=422,
            detail=f"Text exceeds maximum length of {settings.max_text_length} characters"
        )

    try:
        # Run prediction
        result = detector.predict(request.text)

        # Count characters and words
        char_count = len(request.text)
        word_count = len(request.text.split())

        return AnalyzeResponse(
            prediction=result["prediction"],
            human_probability=result["human_probability"],
            ai_probability=result["ai_probability"],
            character_count=char_count,
            word_count=word_count,
        )

    except RuntimeError as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
