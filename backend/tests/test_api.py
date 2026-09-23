"""Automated tests for the API."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from backend.app.main import app
from backend.app.detector import Detector


@pytest.fixture
def client():
    """Create test client."""
    with TestClient(app) as c:
        yield c


class TestHealthEndpoint:
    """Tests for /health endpoint."""

    def test_health_returns_ok(self, client):
        """Health check should return status ok."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"


class TestAnalyzeEndpoint:
    """Tests for /api/analyze endpoint."""

    @patch("backend.app.main.detector")
    def test_analyze_valid_text_human(self, mock_detector, client):
        """Valid text should return prediction."""
        mock_detector.predict.return_value = {
            "prediction": "HUMAN",
            "human_probability": 0.95,
            "ai_probability": 0.05,
        }

        test_text = "I went to the store today and bought some groceries."
        response = client.post(
            "/api/analyze",
            json={"text": test_text}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["prediction"] == "HUMAN"
        assert data["human_probability"] == 0.95
        assert data["ai_probability"] == 0.05
        assert data["character_count"] == len(test_text)
        assert data["word_count"] == len(test_text.split())

    @patch("backend.app.main.detector")
    def test_analyze_valid_text_ai(self, mock_detector, client):
        """Valid text should return AI prediction."""
        mock_detector.predict.return_value = {
            "prediction": "AI",
            "human_probability": 0.02,
            "ai_probability": 0.98,
        }

        response = client.post(
            "/api/analyze",
            json={"text": "Machine learning has transformed various industries significantly."}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["prediction"] == "AI"
        assert data["human_probability"] == 0.02
        assert data["ai_probability"] == 0.98

    def test_analyze_empty_text(self, client):
        """Empty text should return validation error."""
        response = client.post(
            "/api/analyze",
            json={"text": ""}
        )

        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert "Validation error" in data["error"]

    def test_analyze_whitespace_only(self, client):
        """Whitespace-only text should return validation error."""
        response = client.post(
            "/api/analyze",
            json={"text": "   \n\t  "}
        )

        assert response.status_code == 422
        data = response.json()
        assert "error" in data

    def test_analyze_missing_text(self, client):
        """Missing text field should return validation error."""
        response = client.post(
            "/api/analyze",
            json={}
        )

        assert response.status_code == 422
        data = response.json()
        assert "error" in data

    @patch("backend.app.main.detector")
    def test_analyze_very_long_text(self, mock_detector, client):
        """Text exceeding max length should return error."""
        mock_detector.predict.return_value = {
            "prediction": "HUMAN",
            "human_probability": 0.8,
            "ai_probability": 0.2,
        }

        # Create text longer than max (10000 chars)
        long_text = "a" * 11000

        response = client.post(
            "/api/analyze",
            json={"text": long_text}
        )

        assert response.status_code == 422
        data = response.json()
        assert "exceeds maximum length" in data["detail"]

    @patch("backend.app.main.detector")
    def test_analyze_inference_error(self, mock_detector, client):
        """Inference errors should be handled gracefully."""
        mock_detector.predict.side_effect = RuntimeError("Inference failed")

        response = client.post(
            "/api/analyze",
            json={"text": "Some text to analyze"}
        )

        assert response.status_code == 500
        data = response.json()
        assert "detail" in data

    @patch("backend.app.main.detector")
    def test_probabilities_sum_to_one(self, mock_detector, client):
        """Human and AI probabilities should sum to approximately 1.0."""
        mock_detector.predict.return_value = {
            "prediction": "HUMAN",
            "human_probability": 0.95,
            "ai_probability": 0.05,
        }

        response = client.post(
            "/api/analyze",
            json={"text": "Some test text"}
        )

        assert response.status_code == 200
        data = response.json()
        prob_sum = data["human_probability"] + data["ai_probability"]
        assert abs(prob_sum - 1.0) < 1e-5, f"Probabilities sum to {prob_sum}, not 1.0"
