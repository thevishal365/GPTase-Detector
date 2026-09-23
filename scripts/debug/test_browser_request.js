// Test browser fetch from Node.js (simulates what browser JavaScript does)
const testUrl = "http://127.0.0.1:8000";  // This is what the frontend should use

async function testAnalyzeFromBrowser() {
  console.log("\n=== Simulating Browser Request ===");
  console.log("Frontend Origin: http://localhost:3000");
  console.log("Backend API URL:", testUrl);
  console.log("Endpoint: POST " + testUrl + "/api/analyze");

  try {
    const response = await fetch(`${testUrl}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "http://localhost:3000",  // Browser sends this
      },
      body: JSON.stringify({ text: "This is a test from the browser simulation" }),
    });

    console.log("Response Status:", response.status);
    console.log("Response Headers:");
    response.headers.forEach((value, name) => {
      if (name.toLowerCase().includes("access-control")) {
        console.log("  " + name + ": " + value);
      }
    });

    if (!response.ok) {
      console.log("ERROR: Non-200 response");
      const error = await response.json();
      console.log("Error data:", error);
      return;
    }

    const data = await response.json();
    console.log("\n✓ SUCCESS!");
    console.log("Prediction:", data.prediction);
    console.log("Human probability:", (data.human_probability * 100).toFixed(2) + "%");
    console.log("AI probability:", (data.ai_probability * 100).toFixed(2) + "%");
  } catch (err) {
    console.log("ERROR:", err.message);
  }
}

testAnalyzeFromBrowser();
