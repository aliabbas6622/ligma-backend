async function testOpenRouter() {
  const model = process.env.OPENROUTER_MODEL || 'minimax/minimax-m2.5:free';
  const keys = [process.env.OPENROUTER_1, process.env.OPENROUTER_2].filter(Boolean);

  if (keys.length === 0) {
    console.error("No OpenRouter keys found in environment");
    return;
  }

  for (const key of keys) {
    console.log(`Testing OpenRouter Key: ${key.slice(0, 10)}... with model: ${model}`);
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Say hello' }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log("Success! Output:", data?.choices?.[0]?.message?.content);
      } else {
        console.error("Error:", res.status, res.statusText);
        const text = await res.text();
        console.error("Response:", text);
      }
    } catch (err) {
      console.error("Fetch Error:", err);
    }
    console.log("---");
  }
}

testOpenRouter();
