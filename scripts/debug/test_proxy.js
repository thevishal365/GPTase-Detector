// Test the Next.js proxy route from browser perspective
async function testProxyRoute() {
  console.log("\n=== Testing Next.js Proxy Route ===\n");
  console.log("Browser: http://localhost:3000");
  console.log("Frontend calls: POST /api/analyze");
  console.log("Next.js rewrites to: http://127.0.0.1:8000/api/analyze\n");

  const testCases = [
    "I grabbed coffee this morning.",
    "Artificial intelligence has revolutionized industries.",
  ];

  for (const text of testCases) {
    try {
      const response = await fetch("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        console.log("Error status:", response.status);
        continue;
      }

      const data = await response.json();
      console.log("Text:", text.substring(0, 30) + "...");
      console.log("Prediction:", data.prediction);
      console.log("Confidence:", (data.human_probability * 100).toFixed(1) + "% HUMAN\n");
    } catch (err) {
      console.log("ERROR:", err.message);
    }
  }
}

testProxyRoute();
