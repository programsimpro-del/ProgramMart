import type { Context } from 'hono';
import type { Env } from './types';

/** อีเมลผู้ใช้จาก Cloudflare Access (ตอนพัฒนาบนเครื่องจะเป็น "dev") */
export function actorOf(c: Context<{ Bindings: Env }>): string {
  return c.req.header('cf-access-authenticated-user-email') ?? 'dev';
}

export async function audit(
  DB: D1Database,
  actor: string,
  action: string,
  entity: string,
  entityId: string | number | null,
  detail = '',
): Promise<void> {
  await DB.prepare('INSERT INTO audit_logs (actor, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)')
    .bind(actor, action, entity, entityId === null ? null : String(entityId), detail)
    .run();
}
