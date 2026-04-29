/**
 * Operational Transformation (OT) Engine
 *
 * Every canvas mutation is modelled as a typed operation. The server holds a
 * monotonically-increasing revision counter. When a client submits an op it
 * tags it with the revision it was based on (baseRevision). If other ops were
 * committed concurrently the server *transforms* the incoming op against each
 * of those before applying it, ensuring all peers converge to the same state.
 *
 * Transform table for canvas node ops:
 *
 *   incoming \ concurrent  │ add   │ update │ delete │ lock
 *   ───────────────────────┼───────┼────────┼────────┼──────
 *   add                    │ noop* │ noop   │ noop   │ noop
 *   update                 │ noop  │ merge  │ drop   │ drop if violates
 *   delete                 │ noop  │ noop   │ drop   │ noop
 *   lock                   │ noop  │ noop   │ drop   │ server order
 *
 * *add vs add: UUIDs are unique so this never conflicts.
 */

export type OpType = 'add_node' | 'update_node' | 'delete_node' | 'lock_node';

export interface NodeFields {
  kind?: 'sticky' | 'rect' | 'text' | 'draw';
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  color?: string;
  text?: string;
  points?: Array<[number, number]>;
  ownerId?: string | null;
  lockedToRole?: string | null;
  intent?: string | null;
  intentConfidence?: number;
  intentSource?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface Op {
  id: string;           // client-generated UUID for dedup
  type: OpType;
  nodeId: string;
  userId: string;
  baseRevision: number; // revision the client was at when this op was created
  payload: NodeFields;
  timestamp: number;    // client wall-clock (ms) for audit/display; ordering is server-authoritative
}

export interface CommittedOp extends Op {
  revision: number;     // server-assigned, monotonically increasing
}

/**
 * Transform `incoming` against a single already-committed op.
 * Returns the (possibly mutated) incoming op or null if the op should be
 * dropped entirely.
 */
export function transformOne(incoming: Op, committed: CommittedOp): Op | null {
  // Different nodes: operations are fully independent — no transformation needed.
  if (incoming.nodeId !== committed.nodeId) return incoming;

  switch (incoming.type) {
    case 'add_node':
      // UUIDs are unique; an add can never conflict with another add.
      return incoming;

    case 'update_node': {
      switch (committed.type) {
        case 'delete_node':
        case 'lock_node':
          // Node was deleted or its lock changed — drop the update.
          return null;

        case 'update_node': {
          // Both sides updated the same node concurrently.
          // Strategy: field-level merge. Independent fields survive. If both
          // ops touch the same scalar field, the already committed server op
          // owns that field so clients converge without trusting wall clocks.
          const merged = { ...incoming.payload };
          for (const key of Object.keys(committed.payload) as Array<keyof NodeFields>) {
            if (key === 'text') {
              const committedText = committed.payload.text ?? '';
              const incomingText = merged.text ?? '';
              merged.text = incomingText.length >= committedText.length
                ? incomingText
                : committedText;
              continue;
            }
            delete merged[key];
          }
          const remaining = Object.keys(merged).filter(
            (k) => k !== 'updatedAt' && merged[k as keyof NodeFields] !== undefined,
          );
          if (remaining.length === 0) return null;
          return { ...incoming, payload: merged };
        }

        default:
          return incoming;
      }
    }

    case 'delete_node': {
      switch (committed.type) {
        case 'delete_node':
          // Already deleted — drop duplicate.
          return null;
        default:
          return incoming;
      }
    }

    case 'lock_node': {
      switch (committed.type) {
        case 'delete_node':
          // Node gone — drop lock op.
          return null;
        case 'lock_node':
          // Concurrent lock changes: the server's commit order is the authority.
          return null;
        default:
          return incoming;
      }
    }

    default:
      return incoming;
  }
}

/**
 * Transform `incoming` against ALL committed ops since incoming.baseRevision.
 * Returns the transformed op (ready to apply) or null (drop it).
 */
export function transform(incoming: Op, committed: CommittedOp[]): Op | null {
  const concurrent = committed.filter((c) => c.revision > incoming.baseRevision);
  let op: Op | null = incoming;
  for (const c of concurrent) {
    if (op === null) break;
    op = transformOne(op, c);
  }
  return op;
}

/**
 * Apply a committed op to a mutable node map (in-place).
 */
export function applyOp(
  nodes: Map<string, NodeFields & { id: string }>,
  op: CommittedOp,
): void {
  switch (op.type) {
    case 'add_node':
      nodes.set(op.nodeId, { id: op.nodeId, ...op.payload });
      break;

    case 'update_node': {
      const existing = nodes.get(op.nodeId);
      if (existing) {
        nodes.set(op.nodeId, { ...existing, ...op.payload });
      }
      break;
    }

    case 'delete_node':
      nodes.delete(op.nodeId);
      break;

    case 'lock_node': {
      const existing = nodes.get(op.nodeId);
      if (existing) {
        nodes.set(op.nodeId, {
          ...existing,
          lockedToRole: op.payload.lockedToRole ?? null,
          updatedAt: op.timestamp,
        });
      }
      break;
    }
  }
}
