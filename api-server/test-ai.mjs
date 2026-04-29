import { generateSummary } from './dist/summary.js';

async function test() {
  const sessionId = '00000000-0000-0000-0000-000000000001';
  console.log("Testing AI summary with OpenRouter...");
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
