import { execute, queryAll } from "./db";

export interface AuditEvent {
  id: number;
  actor: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_json: string | null;
  after_json: string | null;
  created_at: string;
}

function encode(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export async function recordAuditEvent(input: {
  actor: string | null;
  action: string;
  entityType: string;
  entityId: string | number;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await execute(
    `INSERT INTO audit_events
       (actor, action, entity_type, entity_id, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.actor,
    input.action,
    input.entityType,
    String(input.entityId),
    encode(input.before),
    encode(input.after),
  );
}

export async function listAuditEvents(limit = 200): Promise<AuditEvent[]> {
  const safeLimit = Math.min(500, Math.max(1, Math.trunc(limit)));
  return queryAll<AuditEvent>(
    `SELECT id, actor, action, entity_type, entity_id,
            before_json, after_json, created_at
       FROM audit_events
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
    safeLimit,
  );
}
