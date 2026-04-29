import { generateSummary } from './dist/summary.js';

async function test() {
  const sessionId = '00000000-0000-0000-0000-000000000001';
  console.log("Testing summary with API key:", process.env.GEMINI_API_KEY ? "Present" : "Missing");
  try {
    const result = await generateSummary(sessionId);
    console.log("Source:", result.source);
    console.log("AI Narrative:", result.aiNarrative);
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}

test();
