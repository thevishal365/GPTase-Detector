// Test script to verify frontend-backend integration
const API_URL = "http://127.0.0.1:8000";

async function testAnalyze(text) {
  try {
    const response = await fetch(`${API_URL}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.log("❌ Error:", errorData);
      return;
    }

    const data = await response.json();
    console.log("✓ Success!");
    console.log("Prediction:", data.prediction);
    console.log("Human probability:", (data.human_probability * 100).toFixed(2) + "%");
    console.log("AI probability:", (data.ai_probability * 100).toFixed(2) + "%");
    console.log("Word count:", data.word_count);
    console.log("Character count:", data.character_count);
    console.log("---");
  } catch (err) {
    console.log("❌ Error:", err.message);
  }
}

async function runTests() {
  console.log("Testing GPTase Detector API Integration\n");

  // Test 1: Human-like text
  console.log("Test 1: Human-like conversational text");
  await testAnalyze("I grabbed coffee this morning at that new place downtown. The barista was super friendly!");

  // Test 2: AI-like text
  console.log("\nTest 2: AI-like formal text");
  await testAnalyze("Artificial intelligence has revolutionized numerous industries by enabling machines to perform complex tasks efficiently.");

  // Test 3: Empty text (should fail)
  console.log("\nTest 3: Empty text (should fail)");
  await testAnalyze("");
}

runTests();
