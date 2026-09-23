"""Pydantic schemas for request/response validation."""

from pydantic import BaseModel, Field, field_validator


class AnalyzeRequest(BaseModel):
    """Request schema for text analysis."""

    text: str = Field(..., description="Text to analyze for AI generation")

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        """Validate that text is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError("text cannot be empty or whitespace-only")
        return v


class AnalyzeResponse(BaseModel):
    """Response schema for text analysis."""

    prediction: str = Field(..., description="Predicted class: HUMAN or AI")
    human_probability: float = Field(..., description="Probability text is human-written")
    ai_probability: float = Field(..., description="Probability text is AI-generated")
    character_count: int = Field(..., description="Number of characters in input")
    word_count: int = Field(..., description="Number of words in input")


class HealthResponse(BaseModel):
    """Response schema for health check."""

    status: str = "ok"


class ErrorResponse(BaseModel):
    """Response schema for errors."""

    error: str
    detail: str | None = None
