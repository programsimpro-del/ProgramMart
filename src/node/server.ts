import { serve } from '@hono/node-server';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { app } from '../index';
import { releaseExpiredOrders } from '../expiry';
import type { Env } from '../types';
import { makeD1 } from './d1';
import { makeR2 } from './r2';

const PORT = Number(process.env.PORT ?? 3000);
const SITE_URL = (process.env.SITE_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '');
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@local';

if (!ADMIN_PASSWORD) {
  console.error('ต้องตั้งค่า ADMIN_PASSWORD ก่อนเริ่มระบบ');
  process.exit(1);
}

mkdirSync(DATA_DIR, { recursive: true });
const sqlite = new DatabaseSync(path.join(DATA_DIR, 'shop.db'));
sqlite.exec('PRAGMA foreign_keys = ON;');
const DB = makeD1(sqlite);
const IMAGES = makeR2(path.join(DATA_DIR, 'images'));

/** ใช้ migrations ตามลำดับชื่อไฟล์ และจำว่าไฟล์ไหนรันไปแล้ว */
function migrate() {
  sqlite.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')));');
  const done = new Set(
    (sqlite.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name),
  );
  const dir = path.resolve('migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(readFileSync(path.join(dir, file), 'utf8'));
      sqlite.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
      sqlite.exec('COMMIT');
      console.log(`ใช้ migration แล้ว: ${file}`);
    } catch (e) {
      sqlite.exec('ROLLBACK');
      throw e;
    }
  }
}
migrate();

const env: Env = {
  DB,
  IMAGES,
  PUBLIC_IMAGE_BASE: `${SITE_URL}/img`,
  PUBLIC_SITE_URL: SITE_URL,
  BANK_INFO: process.env.BANK_INFO ?? 'ธนาคาร (ใส่ข้อมูลบัญชีของร้าน)',
  TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY ?? '',
  TURNSTILE_SECRET: process.env.TURNSTILE_SECRET ?? '',
};

/** ตรวจรหัสผ่านหลังบ้านแบบ Basic (ชื่อผู้ใช้อะไรก็ได้ ต้องใช้รหัสผ่านที่ตั้งไว้) */
function checkAdmin(req: Request): boolean {
  const h = req.headers.get('authorization') ?? '';
  if (!h.startsWith('Basic ')) return false;
  const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  return idx >= 0 && decoded.slice(idx + 1) === ADMIN_PASSWORD;
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // รูปสินค้าและสลิป: อ่านจาก R2 จำลอง (สลิปเปิดได้เฉพาะหลังบ้านผ่าน /admin/orders/:id/slip)
  if (url.pathname.startsWith('/img/')) {
    const key = decodeURIComponent(url.pathname.slice(5));
    if (!key.startsWith('products/')) return new Response('not found', { status: 404 });
    const obj = await IMAGES.get(key);
    if (!obj) return new Response('not found', { status: 404 });
    return new Response(obj.body as unknown as BodyInit, {
      headers: {
        'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
        'cache-control': 'public, max-age=86400',
      },
    });
  }

  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    if (!checkAdmin(req)) {
      return new Response('เข้าหลังบ้านต้องใส่รหัสผ่าน', {
        status: 401,
        headers: { 'www-authenticate': 'Basic realm="admin"' },
      });
    }
    // ผ่านรหัสแล้ว: ส่งอีเมลผู้ดูแลให้ระบบบันทึกประวัติ (แทน Cloudflare Access)
    const headers = new Headers(req.headers);
    headers.set('cf-access-authenticated-user-email', ADMIN_EMAIL);
    req = new Request(req, { headers });
  }

  return app.fetch(req, env);
}

serve({ fetch: handle, port: PORT }, (info) => {
  console.log(`หน้าร้าน: ${SITE_URL} (พอร์ต ${info.port})`);
});

// คืนสต๊อกออเดอร์ที่หมดเวลาทุก 5 นาที (แทน Cron Trigger)
setInterval(() => {
  releaseExpiredOrders(DB)
    .then((n) => n > 0 && console.log(`คืนสต๊อกออเดอร์ที่หมดเวลา: ${n} รายการ`))
    .catch((e) => console.error(e));
}, 5 * 60 * 1000);
