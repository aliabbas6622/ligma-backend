async function testGroq() {
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const keys = [process.env.GROQ_1, process.env.GROQ_2].filter(Boolean);
  
  if (keys.length === 0) {
    console.error("No Groq keys found in environment");
    return;
  }

  for (const key of keys) {
    console.log(`Testing Groq Key: ${key.slice(0, 10)}... with model: ${model}`);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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

testGroq();
