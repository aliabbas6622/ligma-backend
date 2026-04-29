import { pool } from '@ligma/db';
import { appendMemoryEvent } from './memoryStore.js';

export interface LogEventParams {
  sessionId: string;
  eventType: string;
  nodeId?: string | null;
  userId?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface EventRow {
  id: string;
  session_id: string;
  seq_num: string;
  event_type: string;
  node_id: string | null;
  user_id: string | null;
  payload: Record<string, unknown> | null;
  timestamp: string;
}

export async function logEvent(params: LogEventParams): Promise<EventRow> {
  const { sessionId, eventType, nodeId, userId, payload } = params;
  try {
    await pool.query(
      `INSERT INTO sessions (id, name)
       VALUES ($1, 'Main Brainstorm')
       ON CONFLICT (id) DO NOTHING`,
      [sessionId],
    );

    const result = await pool.query<EventRow>(
      `INSERT INTO events (session_id, event_type, node_id, user_id, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      [
        sessionId,
        eventType,
        nodeId ?? null,
        userId ?? null,
        payload ? JSON.stringify(payload) : null,
      ],
    );
    return result.rows[0]!;
  } catch (err) {
    console.error('[logEvent] Database unavailable, using in-memory event log:', err);
    return appendMemoryEvent({ sessionId, eventType, nodeId, userId, payload });
  }
}
