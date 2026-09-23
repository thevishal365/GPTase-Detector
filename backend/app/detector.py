"""
Detector module - handles model loading and inference.
Model is loaded once at startup and reused for all requests.
"""

import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from typing import Optional
from .config import settings


class Detector:
    """AI text detector using Hugging Face model."""

    def __init__(self):
        self._model: Optional[AutoModelForSequenceClassification] = None
        self._tokenizer: Optional[AutoTokenizer] = None

    def load(self) -> None:
        """Load the model and tokenizer. Called once at startup."""
        try:
            print(f"Loading model: {settings.model_name}")
            self._tokenizer = AutoTokenizer.from_pretrained(settings.model_name)
            self._model = AutoModelForSequenceClassification.from_pretrained(
                settings.model_name
            )
            self._model.eval()
            print("Model loaded successfully")
        except Exception as e:
            raise RuntimeError(f"Failed to load model: {e}") from e

    def predict(self, text: str) -> dict:
        """
        Run inference on the given text.

        Args:
            text: Input text to classify

        Returns:
            dict with prediction, probabilities for each class

        Raises:
            RuntimeError: If model is not loaded or inference fails
        """
        if self._model is None or self._tokenizer is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        try:
            # Tokenize input
            inputs = self._tokenizer(
                text,
                return_tensors="pt",
                truncation=True,
                max_length=512
            )

            # Run inference without gradients
            with torch.no_grad():
                outputs = self._model(**inputs)
                logits = outputs.logits
                probabilities = torch.nn.functional.softmax(logits, dim=-1)[0]

            # Get predicted class
            predicted_class_id = torch.argmax(probabilities).item()
            predicted_class = self._model.config.id2label[predicted_class_id]

            # Build probability dict
            probs = {
                self._model.config.id2label[i]: probabilities[i].item()
                for i in range(len(probabilities))
            }

            return {
                "prediction": predicted_class,
                "human_probability": probs.get("HUMAN", 0.0),
                "ai_probability": probs.get("AI", 0.0),
            }

        except Exception as e:
            raise RuntimeError(f"Inference failed: {e}") from e


# Global detector instance - loaded once at startup
detector = Detector()
