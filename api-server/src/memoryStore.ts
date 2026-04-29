import { randomUUID } from 'node:crypto';

export interface MemoryEventRow {
  id: string;
  session_id: string;
  seq_num: string;
  event_type: string;
  node_id: string | null;
  user_id: string | null;
  payload: Record<string, unknown> | null;
  timestamp: string;
}

export interface MemoryTaskRow {
  id: string;
  session_id: string;
  node_id: string;
  author_id: string | null;
  title: string;
  intent_type: string;
  confirmed_by_ai: boolean;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
  author_color?: string | null;
}

let seq = 0;
const events: MemoryEventRow[] = [];
const tasks = new Map<string, MemoryTaskRow>();

export function appendMemoryEvent(input: {
  sessionId: string;
  eventType: string;
  nodeId?: string | null;
  userId?: string | null;
  payload?: Record<string, unknown> | null;
}): MemoryEventRow {
  const row: MemoryEventRow = {
    id: randomUUID(),
    session_id: input.sessionId,
    seq_num: String(++seq),
    event_type: input.eventType,
    node_id: input.nodeId ?? null,
    user_id: input.userId ?? null,
    payload: input.payload ?? null,
    timestamp: new Date().toISOString(),
  };
  events.push(row);
  return row;
}

export function listMemoryEvents(sessionId: string, limit: number): MemoryEventRow[] {
  return events.filter((event) => event.session_id === sessionId).slice(-limit);
}

export function replayMemoryEvents(sessionId: string, maxSeq: number): MemoryEventRow[] {
  return events.filter(
    (event) => event.session_id === sessionId && Number(event.seq_num) <= maxSeq,
  );
}

export function upsertMemoryTask(input: {
  sessionId: string;
  nodeId: string;
  authorId: string | null;
  title: string;
  intentType: string;
  confirmedByAi: boolean;
}): void {
  const now = new Date().toISOString();
  const existing = tasks.get(input.nodeId);
  tasks.set(input.nodeId, {
    id: existing?.id ?? randomUUID(),
    session_id: input.sessionId,
    node_id: input.nodeId,
    author_id: input.authorId,
    title: input.title,
    intent_type: input.intentType,
    confirmed_by_ai: input.confirmedByAi,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    author_name: existing?.author_name ?? null,
    author_color: existing?.author_color ?? null,
  });
}

export function listMemoryTasks(sessionId: string): MemoryTaskRow[] {
  return Array.from(tasks.values())
    .filter((task) => task.session_id === sessionId)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}
