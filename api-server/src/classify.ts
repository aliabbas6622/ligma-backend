export type IntentType = 'action_item' | 'decision' | 'open_question' | 'reference';

export interface Classification {
  intent: IntentType;
  confidence: number;
  source: 'keyword' | 'ai';
}

export function classifyByKeyword(text: string): Classification {
  const t = (text || '').trim().toLowerCase();
  if (!t) return { intent: 'reference', confidence: 0.1, source: 'keyword' };

  if (/\?\s*$/.test(t) || /^(who|what|when|where|why|how|should we|can we|do we|are we)\b/.test(t)) {
    return { intent: 'open_question', confidence: 0.85, source: 'keyword' };
  }

  if (
    /\b(todo|to-do|to do|task|assign|deadline|due|fix|implement|build|ship|deliver|investigate|action|owner)\b/.test(t) ||
    /^\s*\[\s*\]\s+/.test(t)
  ) {
    return { intent: 'action_item', confidence: 0.9, source: 'keyword' };
  }

  if (/\b(decided|agree(d)?|approved|locked in|conclusion|let's go with|we will use|chosen)\b/.test(t)) {
    return { intent: 'decision', confidence: 0.85, source: 'keyword' };
  }

  return { intent: 'reference', confidence: 0.4, source: 'keyword' };
}

export async function classifyByAI(text: string): Promise<Classification> {
  const groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const groqKeys = [process.env.GROQ_1, process.env.GROQ_2].filter(Boolean) as string[];
  const orModel = process.env.OPENROUTER_MODEL || 'minimax/minimax-m2.5:free';
  const orKeys = [process.env.OPENROUTER_1, process.env.OPENROUTER_2].filter(Boolean) as string[];
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!groqKeys.length && !orKeys.length && !geminiKey) return classifyByKeyword(text);

  const prompt = `Classify the following note from a brainstorm whiteboard into exactly one of these intent types:
- action_item: a task, to-do, or someone needs to do something
- decision: a conclusion the team has reached
- open_question: an unresolved question
- reference: factual information, context, or supporting detail

Respond with ONLY one word: action_item | decision | open_question | reference.

Note: """${text.slice(0, 500)}"""`;

  const valid: IntentType[] = ['action_item', 'decision', 'open_question', 'reference'];

  // Try Groq first
  for (const apiKey of groqKeys) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: groqModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          max_tokens: 16,
        }),
      });

      if (res.ok) {
        const data: any = await res.json();
        const out = (data?.choices?.[0]?.message?.content || '').trim().toLowerCase();
        if (valid.includes(out as IntentType)) {
          return { intent: out as IntentType, confidence: 0.95, source: 'ai' };
        }
      }
    } catch {
      // Ignore and try next key
    }
  }

  // Try OpenRouter next
  for (const apiKey of orKeys) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://ligma.zip',
          'X-Title': 'Ligma Whiteboard',
        },
        body: JSON.stringify({
          model: orModel,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (res.ok) {
        const data: any = await res.json();
        const out = (data?.choices?.[0]?.message?.content || '').trim().toLowerCase();
        if (valid.includes(out as IntentType)) {
          return { intent: out as IntentType, confidence: 0.95, source: 'ai' };
        }
      }
    } catch {
      // Ignore and try next key
    }
  }

  // Fallback to Gemini
  if (geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 8 },
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        const out = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().toLowerCase();
        if (valid.includes(out as IntentType)) {
          return { intent: out as IntentType, confidence: 0.95, source: 'ai' };
        }
      }
    } catch {
      // Ignore and fall back to keyword
    }
  }

  return classifyByKeyword(text);
}
