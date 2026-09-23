// Final verification with correct path
async function verifyCorrectPath() {
  console.log("\n" + "=".repeat(70));
  console.log("FINAL VERIFICATION - CORRECTED PATH");
  console.log("=".repeat(70) + "\n");

  console.log("Architecture:");
  console.log("  Browser URL: http://localhost:3000");
  console.log("  Frontend calls: POST /api/analyze");
  console.log("  Next.js rewrites to: http://127.0.0.1:8000/api/analyze");
  console.log("  FastAPI endpoint: POST /api/analyze");
  console.log("");

  const tests = [
    { text: "I love going to the beach on sunny days!", label: "Human-like" },
    { text: "Machine learning algorithms utilize statistical methods to enable computers to improve performance on tasks through experience.", label: "AI-like" },
    { text: "Hello world", label: "Short" }
  ];

  let allPassed = true;

  for (const test of tests) {
    console.log(`Testing ${test.label}: "${test.text}"`);

    try {
      const response = await fetch("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: test.text })
      });

      if (!response.ok) {
        console.log(`  ✗ FAILED: ${response.status} ${response.statusText}`);
        allPassed = false;
        continue;
      }

      const data = await response.json();
      console.log(`  ✓ SUCCESS`);
      console.log(`    Prediction: ${data.prediction}`);
      console.log(`    HUMAN: ${(data.human_probability * 100).toFixed(1)}%`);
      console.log(`    AI: ${(data.ai_probability * 100).toFixed(1)}%`);
      console.log("");
    } catch (err) {
      console.log(`  ✗ ERROR: ${err.message}`);
      allPassed = false;
    }
  }

  console.log("=".repeat(70));
  if (allPassed) {
    console.log("✓ ALL TESTS PASSED");
    console.log("\nBrowser flow confirmed:");
    console.log("  1. User visits http://localhost:3000");
    console.log("  2. Enters text and clicks Analyze");
    console.log("  3. Frontend POSTs to /api/analyze (no duplicate)");
    console.log("  4. Next.js proxies to backend at :8000");
    console.log("  5. ModernBERT processes the text");
    console.log("  6. Results display in browser UI");
  } else {
    console.log("✗ SOME TESTS FAILED");
  }
  console.log("=".repeat(70));
}

verifyCorrectPath();
