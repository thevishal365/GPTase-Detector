#!/usr/bin/env python3
"""
Minimal proof-of-concept for AI-generated text detection.
Uses the rasbt/ai-text-detector-modernbert model from Hugging Face.
"""

import sys
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch


def load_model():
    """Load the model and tokenizer from Hugging Face."""
    try:
        print("Loading model and tokenizer...")
        model_name = "rasbt/ai-text-detector-modernbert"
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSequenceClassification.from_pretrained(model_name)
        model.eval()
        print("[OK] Model loaded successfully\n")
        return model, tokenizer
    except Exception as e:
        print(f"[ERROR] Error loading model: {e}", file=sys.stderr)
        sys.exit(1)


def predict(text, model, tokenizer):
    """
    Run inference on the given text.

    Args:
        text: Input text to classify
        model: Pre-loaded model
        tokenizer: Pre-loaded tokenizer

    Returns:
        dict with predicted_class, probabilities for each class
    """
    try:
        # Tokenize input
        inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)

        # Run inference
        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits
            probabilities = torch.nn.functional.softmax(logits, dim=-1)[0]

        # Get predicted class
        predicted_class_id = torch.argmax(probabilities).item()
        predicted_class = model.config.id2label[predicted_class_id]

        # Get probabilities for each class
        class_probs = {
            model.config.id2label[i]: probabilities[i].item()
            for i in range(len(probabilities))
        }

        return {
            "predicted_class": predicted_class,
            "probabilities": class_probs
        }
    except Exception as e:
        print(f"[ERROR] Error during prediction: {e}", file=sys.stderr)
        return None


def display_result(text, result, example_num):
    """Display the prediction result in a readable format."""
    print(f"{'='*70}")
    print(f"Example {example_num}")
    print(f"{'='*70}")
    print(f"Text: {text[:100]}{'...' if len(text) > 100 else ''}")
    print(f"\n-> Predicted: {result['predicted_class']}")
    print(f"\nProbability scores:")
    for label, prob in result['probabilities'].items():
        pct = prob * 100
        print(f"  {label:>6}: {prob:.4f} ({pct:.2f}%)")
    print()


def main():
    """Main function to test the detector with example texts."""

    # Load model once
    model, tokenizer = load_model()

    # Test examples
    test_cases = [
        # Example 1: Human-written text (conversational, informal)
        """I grabbed coffee this morning at that new place downtown. The barista
        was friendly but they were out of oat milk again. Ended up with regular
        milk and honestly? Still pretty good. Might go back tomorrow if I have time.""",

        # Example 2: AI-style text (formal, explanatory)
        """Artificial intelligence has revolutionized numerous industries by enabling
        machines to perform tasks that traditionally required human intelligence.
        Machine learning algorithms can analyze vast amounts of data to identify
        patterns and make predictions. This technology has applications in healthcare,
        finance, transportation, and many other sectors, fundamentally transforming
        how we approach complex problems.""",

        # Example 3: Very short text
        """The quick brown fox jumps over the lazy dog."""
    ]

    print("Testing AI Text Detector")
    print("Model: rasbt/ai-text-detector-modernbert")
    print(f"Running {len(test_cases)} test cases...\n")

    # Run predictions
    for i, text in enumerate(test_cases, 1):
        result = predict(text, model, tokenizer)
        if result:
            display_result(text, result, i)
        else:
            print(f"Failed to process example {i}\n")

    print("="*70)
    print("IMPORTANT DISCLAIMER:")
    print("These predictions are probabilistic and should NOT be considered")
    print("definitive proof of authorship. Many factors affect the output,")
    print("and the model can make mistakes. Use results as guidance only.")
    print("="*70)


if __name__ == "__main__":
    main()
