"""Configuration settings for the API."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    # Model settings
    model_name: str = "rasbt/ai-text-detector-modernbert"

    # Input validation
    max_text_length: int = 10000  # Maximum characters allowed

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()
