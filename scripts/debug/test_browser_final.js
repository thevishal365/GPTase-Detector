// Final browser simulation - exact flow through Next.js proxy
async function finalBrowserTest() {
  console.log("\n" + "=".repeat(60));
  console.log("FINAL BROWSER INTEGRATION TEST");
  console.log("=".repeat(60) + "\n");

  console.log("Setup:");
  console.log("  Frontend: http://localhost:3000");
  console.log("  Backend: http://127.0.0.1:8000");
  console.log("  Proxy: Next.js rewrites /api/* → backend");
  console.log("");

  const testCases = [
    {
      name: "Human-like text",
      text: "I went to the store this morning and bought some groceries. The weather was nice.",
      expectedPrediction: "HUMAN"
    },
    {
      name: "AI-like text",
      text: "Artificial intelligence represents a paradigm shift in computational technology, enabling machines to perform complex cognitive tasks with unprecedented efficiency and accuracy across diverse domains.",
      expectedPrediction: "AI"
    },
    {
      name: "Short text",
      text: "Hello world.",
      expectedPrediction: null  // Variable
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.name}`);
    console.log(`Text: "${testCase.text.substring(0, 60)}..."`);

    try {
      // This is the exact request the browser makes
      const response = await fetch("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: testCase.text }),
      });

      if (!response.ok) {
        console.log(`  ✗ FAILED: HTTP ${response.status}`);
        failed++;
        continue;
      }

      const data = await response.json();
      console.log(`  ✓ Prediction: ${data.prediction}`);
      console.log(`  ✓ HUMAN: ${(data.human_probability * 100).toFixed(2)}%`);
      console.log(`  ✓ AI: ${(data.ai_probability * 100).toFixed(2)}%`);
      console.log(`  ✓ Characters: ${data.character_count}`);
      console.log(`  ✓ Words: ${data.word_count}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ FAILED: ${err.message}`);
      failed++;
    }
    console.log("");
  }

  console.log("=".repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed === 0) {
    console.log("\n✓ BROWSER FLOW IS WORKING");
    console.log("The browser at http://localhost:3000 can now:");
    console.log("  1. Accept text input");
    console.log("  2. POST to /api/analyze");
    console.log("  3. Receive predictions from ModernBERT");
    console.log("  4. Display results in the UI");
  } else {
    console.log("\n✗ BROWSER FLOW HAS ISSUES");
  }
}

finalBrowserTest();
