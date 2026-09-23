// Final integration test - simulating exact browser behavior
async function testFullFlow() {
  const apiUrl = "http://localhost:8000";  // Frontend now uses localhost

  console.log("\n=== FULL END-TO-END TEST ===\n");
  console.log("Frontend URL: http://localhost:3000");
  console.log("Backend API URL: " + apiUrl);
  console.log("Endpoint: POST " + apiUrl + "/api/analyze\n");

  // Test 1: Health check
  console.log("1. Testing health endpoint...");
  try {
    const healthResp = await fetch(`${apiUrl}/health`);
    const health = await healthResp.json();
    console.log("   ✓ Health: " + health.status + "\n");
  } catch (e) {
    console.log("   ✗ Health failed: " + e.message + "\n");
    return;
  }

  // Test 2: Analyze with human text
  console.log("2. Testing analyze with human text...");
  const humanText = "I grabbed coffee this morning at that new place downtown. The barista was friendly!";
  try {
    const resp = await fetch(`${apiUrl}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: humanText }),
    });
    if (!resp.ok) throw new Error("Status " + resp.status);
    const data = await resp.json();
    console.log("   ✓ Prediction: " + data.prediction);
    console.log("   ✓ HUMAN: " + (data.human_probability * 100).toFixed(2) + "%");
    console.log("   ✓ AI: " + (data.ai_probability * 100).toFixed(2) + "%\n");
  } catch (e) {
    console.log("   ✗ Failed: " + e.message + "\n");
    return;
  }

  // Test 3: Analyze with AI text
  console.log("3. Testing analyze with AI text...");
  const aiText = "Artificial intelligence has revolutionized numerous industries by enabling machines to perform tasks that traditionally required human intelligence.";
  try {
    const resp = await fetch(`${apiUrl}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: aiText }),
    });
    if (!resp.ok) throw new Error("Status " + resp.status);
    const data = await resp.json();
    console.log("   ✓ Prediction: " + data.prediction);
    console.log("   ✓ HUMAN: " + (data.human_probability * 100).toFixed(2) + "%");
    console.log("   ✓ AI: " + (data.ai_probability * 100).toFixed(2) + "%\n");
  } catch (e) {
    console.log("   ✗ Failed: " + e.message + "\n");
    return;
  }

  console.log("=== ALL TESTS PASSED ===\n");
  console.log("The browser should now be able to:");
  console.log("1. Connect to http://localhost:8000");
  console.log("2. POST text to /api/analyze");
  console.log("3. Display predictions and probabilities");
}

testFullFlow();
