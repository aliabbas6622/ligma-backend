async function testGemini(model = "gemini-2.0-flash") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API key");
    process.exit(1);
  }

  const prompt = "Say hello";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  console.log(`Testing model: ${model}`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
      }),
    });
    
    if (!res.ok) {
      console.error("API Error:", res.status, res.statusText);
      const text = await res.text();
      console.error("Response:", text);
    } else {
      const data = await res.json();
      console.log("Success! Output:", data?.candidates?.[0]?.content?.parts?.[0]?.text);
    }
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

async function run() {
  await testGemini("gemini-2.0-flash");
  console.log("---");
  await testGemini("gemini-1.5-flash");
  process.exit(0);
}

run();
