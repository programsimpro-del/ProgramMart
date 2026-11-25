import type { Env } from './types';

/**
 * ตรวจ Cloudflare Turnstile ฝั่งเซิร์ฟเวอร์
 * ถ้ายังไม่ได้ตั้ง TURNSTILE_SECRET จะปล่อยผ่าน (ใช้ตอนพัฒนา) แต่ควรตั้งก่อนเปิดขายจริง
 */
export async function verifyTurnstile(env: Env, token: string, ip: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;

  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  const result = (await res.json()) as { success?: boolean };
  return result.success === true;
}
