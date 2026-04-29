import { pool } from '@ligma/db';
import { logger } from './lib/logger.js';
import { listMemoryEvents, listMemoryTasks, type MemoryTaskRow } from './memoryStore.js';
import { getRoom } from './sessionRoom.js';

export interface SummarySection {
  title: string;
  items: Array<{ text: string; author?: string; nodeId: string; timestamp: string }>;
}

export interface SessionSummary {
  sessionName: string;
  generatedAt: string;
  totalNodes: number;
  totalEvents: number;
  sections: {
    decisions: SummarySection;
    action_items: SummarySection;
    open_questions: SummarySection;
    references: SummarySection;
  };
  aiNarrative: string | null;
  source: 'ai' | 'structured';
}

interface TaskRow {
  title: string;
  intent_type: string;
  node_id: string;
  updated_at: string;
  author_name: string | null;
}

interface StructuredSeed {
  sessionName: string;
  totalEvents: number;
  totalNodes: number;
  tasks: TaskRow[];
}

function toSection(tasks: TaskRow[], intent: string, title: string): SummarySection {
  return {
    title,
    items: tasks
      .filter((task) => task.intent_type === intent)
      .map((task) => ({
        text: task.title,
        author: task.author_name ?? undefined,
        nodeId: task.node_id,
        timestamp: task.updated_at,
      })),
  };
}

function buildStructured(seed: StructuredSeed): SessionSummary {
  return {
    sessionName: seed.sessionName,
    generatedAt: new Date().toISOString(),
    totalNodes: seed.totalNodes,
    totalEvents: seed.totalEvents,
    sections: {
      decisions: toSection(seed.tasks, 'decision', 'Decisions Made'),
      action_items: toSection(seed.tasks, 'action_item', 'Action Items'),
      open_questions: toSection(seed.tasks, 'open_question', 'Open Questions'),
      references: toSection(seed.tasks, 'reference', 'References and Context'),
    },
    aiNarrative: null,
    source: 'structured',
  };
}

function buildNarrativeFallback(summary: SessionSummary): string | null {
  const decisions = summary.sections.decisions.items;
  const actions = summary.sections.action_items.items;
  const questions = summary.sections.open_questions.items;
  const references = summary.sections.references.items;

  if (!decisions.length && !actions.length && !questions.length && !references.length) {
    return 'This session does not have enough classified content yet. Add a few sticky notes or tasks and reopen the brief to generate a fuller summary.';
  }

  const sentences: string[] = [];

  if (decisions.length) {
    const sample = decisions.slice(0, 2).map((item) => item.text).join('; ');
    sentences.push(`The session produced ${decisions.length} decision${decisions.length === 1 ? '' : 's'}, including ${sample}.`);
  }

  if (actions.length) {
    const sample = actions.slice(0, 2).map((item) => item.author ? `${item.text} (${item.author})` : item.text).join('; ');
    sentences.push(`There ${actions.length === 1 ? 'is' : 'are'} ${actions.length} action item${actions.length === 1 ? '' : 's'} to follow up on, such as ${sample}.`);
  }

  if (questions.length) {
    const sample = questions.slice(0, 2).map((item) => item.text).join('; ');
    sentences.push(`Open questions still remain${questions.length > 1 ? '' : 's'}, notably ${sample}.`);
  }

  if (!decisions.length && !actions.length && references.length) {
    const sample = references.slice(0, 2).map((item) => item.text).join('; ');
    sentences.push(`The board currently captures supporting context and references, including ${sample}.`);
  } else if (references.length) {
    sentences.push(`The board also includes ${references.length} supporting reference${references.length === 1 ? '' : 's'} to preserve context for the next pass.`);
  }

  sentences.push('The next step is to turn the captured notes into clearer decisions or assigned follow-ups as the session evolves.');

  return sentences.join(' ');
}

async function buildStructuredFromDb(sessionId: string): Promise<SessionSummary> {
  const [tasksRes, sessionRes, eventsRes] = await Promise.all([
    pool.query<TaskRow>(
      `SELECT t.title, t.intent_type, t.node_id, t.updated_at, u.name AS author_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.author_id
       WHERE t.session_id = $1
       ORDER BY t.updated_at`,
      [sessionId],
    ),
    pool.query<{ name: string }>(
      `SELECT name FROM sessions WHERE id = $1`,
      [sessionId],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM events WHERE session_id = $1`,
      [sessionId],
    ),
  ]);

  return buildStructured({
    sessionName: sessionRes.rows[0]?.name ?? 'Main Brainstorm',
    totalEvents: parseInt(eventsRes.rows[0]?.count ?? '0', 10),
    totalNodes: tasksRes.rows.length,
    tasks: tasksRes.rows,
  });
}

function buildStructuredFromMemory(sessionId: string): SessionSummary {
  const tasks = listMemoryTasks(sessionId)
    .slice()
    .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
    .map<TaskRow>((task: MemoryTaskRow) => ({
      title: task.title,
      intent_type: task.intent_type,
      node_id: task.node_id,
      updated_at: task.updated_at,
      author_name: task.author_name ?? null,
    }));

  const room = getRoom(sessionId);

  return buildStructured({
    sessionName: 'Main Brainstorm',
    totalEvents: listMemoryEvents(sessionId, Number.MAX_SAFE_INTEGER).length,
    totalNodes: room.getNodes().length || tasks.length,
    tasks,
  });
}

async function buildStructuredSummary(sessionId: string): Promise<SessionSummary> {
  try {
    return await buildStructuredFromDb(sessionId);
  } catch (err) {
    logger.warn({ err, sessionId }, 'Falling back to in-memory summary data');
    return buildStructuredFromMemory(sessionId);
  }
}

export async function generateSummary(sessionId: string): Promise<SessionSummary> {
  const structured = await buildStructuredSummary(sessionId);
  const structuredWithNarrative = {
    ...structured,
    aiNarrative: buildNarrativeFallback(structured),
  };
  const groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const groqKeys = [process.env.GROQ_1, process.env.GROQ_2].filter(Boolean) as string[];
  const orModel = process.env.OPENROUTER_MODEL || 'minimax/minimax-m2.5:free';
  const orKeys = [process.env.OPENROUTER_1, process.env.OPENROUTER_2].filter(Boolean) as string[];
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!groqKeys.length && !orKeys.length && !geminiKey) return structuredWithNarrative;

  const allItems = [
    ...structured.sections.decisions.items.map((item) => `[DECISION] ${item.text}`),
    ...structured.sections.action_items.items.map((item) => `[ACTION] ${item.text}${item.author ? ` (owner: ${item.author})` : ''}`),
    ...structured.sections.open_questions.items.map((item) => `[QUESTION] ${item.text}`),
    ...structured.sections.references.items.map((item) => `[REFERENCE] ${item.text}`),
  ];

  if (!allItems.length) return structuredWithNarrative;

  const prompt = `You are a meeting facilitator summarizing a brainstorm session called "${structured.sessionName}".
Below is the structured output extracted from the collaborative whiteboard:

${allItems.join('\n')}

Write a concise executive narrative in 3 to 5 sentences that:
1. States the key decisions made.
2. Highlights the most important action items and who owns them.
3. Flags any unresolved open questions that need follow-up.
4. Closes with a brief statement about what happens next.

Be direct and professional. Do not use bullet points.`;

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
          temperature: 0.4,
          max_tokens: 512,
        }),
      });

      if (res.ok) {
        const data: any = await res.json();
        const narrative = data?.choices?.[0]?.message?.content;
        if (narrative) {
          return { ...structured, aiNarrative: narrative.trim(), source: 'ai' };
        }
      }
      logger.warn({ status: res.status, apiKey: apiKey.slice(0, 10) }, 'Groq attempt failed');
    } catch (err) {
      logger.error({ err, apiKey: apiKey.slice(0, 10) }, 'Groq fetch error');
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
        const narrative = data?.choices?.[0]?.message?.content;
        if (narrative) {
          return { ...structured, aiNarrative: narrative.trim(), source: 'ai' };
        }
      }
      logger.warn({ status: res.status, apiKey: apiKey.slice(0, 10) }, 'OpenRouter attempt failed');
    } catch (err) {
      logger.error({ err, apiKey: apiKey.slice(0, 10) }, 'OpenRouter fetch error');
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
          generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
        }),
      });

      if (res.ok) {
        const data: any = await res.json();
        const narrative = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
        if (narrative) {
          return { ...structured, aiNarrative: narrative.trim(), source: 'ai' };
        }
      }
    } catch (err) {
      logger.error({ err, sessionId }, 'AI summary generation failed (Gemini fallback)');
    }
  }

  return structuredWithNarrative;
}
