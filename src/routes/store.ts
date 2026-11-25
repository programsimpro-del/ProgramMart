import { Hono } from 'hono';
import type { Env } from '../types';
import * as db from '../db';
import {
  layout,
  homeView,
  categoryView,
  productView,
  productMeta,
  orderView,
  checkoutStep2View,
  checkoutStep3View,
} from '../views';
import { isAllowedAffiliate, CHANNELS, type Channel } from '../links';
import { s } from '../util';
import { verifyTurnstile } from '../turnstile';
import { parseCheckout, amountsFor, type CheckoutInput } from '../checkout';

export const store = new Hono<{ Bindings: Env }>();

const SLIP_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const SLIP_MAX_BYTES = 5 * 1024 * 1024;

store.get('/', async (c) => {
  const [cats, products] = await Promise.all([
    db.listCategories(c.env.DB),
    db.listProducts(c.env.DB, c.env.PUBLIC_IMAGE_BASE, { publishedOnly: true }),
  ]);
  return c.html(layout('หน้าแรก', homeView(cats, products)));
});

store.get('/c/:slug', async (c) => {
  const slug = c.req.param('slug');
  const cats = await db.listCategories(c.env.DB);
  const cat = cats.find((x) => x.slug === slug);
  if (!cat) return c.notFound();
  const products = await db.listProducts(c.env.DB, c.env.PUBLIC_IMAGE_BASE, {
    publishedOnly: true,
    categorySlug: slug,
  });
  return c.html(layout(cat.name, categoryView(cat, cats, products)));
});

store.get('/p/:slug', async (c) => {
  const p = await db.getProduct(c.env.DB, c.env.PUBLIC_IMAGE_BASE, 'slug', c.req.param('slug'), true);
  if (!p) return c.notFound();

  // นับการเข้ามาจากลิงก์ที่แชร์ (เช่น ?src=facebook หรือ ?src=line)
  const src = (c.req.query('src') ?? '').toLowerCase();
  if (/^[a-z0-9_-]{1,20}$/.test(src)) {
    await c.env.DB.prepare('INSERT INTO product_visits (product_id, source) VALUES (?, ?)').bind(p.id, src).run();
  }

  const links = await db.getLinks(c.env.DB, p.id);
  return c.html(layout(p.name, productView(p, links), false, productMeta(p, c.env.PUBLIC_SITE_URL)));
});

/** ขั้นตอนที่ 2: ฟอร์มข้อมูลผู้รับ */
store.get('/p/:slug/checkout', async (c) => {
  const p = await db.getProduct(c.env.DB, c.env.PUBLIC_IMAGE_BASE, 'slug', c.req.param('slug'), true);
  if (!p) return c.notFound();
  if (p.available < 1) return c.redirect(`/p/${p.slug}`, 303);
  const input: CheckoutInput = { qty: 1, name: '', phone: '', address: '', note: '', method: 'transfer' };
  return c.html(layout(`สั่งซื้อ ${p.name}`, checkoutStep2View(p, input)));
});

/** รับข้อมูลจากขั้นตอนที่ 2 แล้วแสดงขั้นตอนที่ 3 (สรุปยอด แนบสลิป ยืนยัน) */
store.post('/p/:slug/checkout', async (c) => {
  const p = await db.getProduct(c.env.DB, c.env.PUBLIC_IMAGE_BASE, 'slug', c.req.param('slug'), true);
  if (!p) return c.notFound();
  const f = await c.req.parseBody();
  const { input, error } = parseCheckout(f);
  if (error) return c.html(layout(`สั่งซื้อ ${p.name}`, checkoutStep2View(p, input, error)), 400);
  if (p.available < input.qty) {
    return c.html(layout(`สั่งซื้อ ${p.name}`, checkoutStep2View(p, input, `สินค้าเหลือ ${p.available} ชิ้น`)), 409);
  }
  return c.html(
    layout(`ยืนยันการสั่งซื้อ ${p.name}`, checkoutStep3View(p, input, c.env.BANK_INFO, c.env.TURNSTILE_SITE_KEY ?? '')),
  );
});

store.post('/p/:slug/order', async (c) => {
  const DB = c.env.DB;
  const p = await db.getProduct(DB, c.env.PUBLIC_IMAGE_BASE, 'slug', c.req.param('slug'), true);
  if (!p) return c.notFound();

  const f = await c.req.parseBody();
  const { input, error } = parseCheckout(f);
  const turnstileKey = c.env.TURNSTILE_SITE_KEY ?? '';
  const step3 = (msg: string, status: 400 | 409 = 400) =>
    c.html(
      layout(`ยืนยันการสั่งซื้อ ${p.name}`, checkoutStep3View(p, input, c.env.BANK_INFO, turnstileKey, msg)),
      status,
    );
  if (error) return c.html(layout(`สั่งซื้อ ${p.name}`, checkoutStep2View(p, input, error)), 400);

  const slip = f.slip;
  if (!(slip instanceof File)) return step3('กรุณาแนบสลิปการโอน');
  const ext = SLIP_TYPES[slip.type];
  if (!ext) return step3('รองรับเฉพาะไฟล์ JPG, PNG และ WEBP');
  if (slip.size > SLIP_MAX_BYTES) return step3('ไฟล์สลิปต้องไม่เกิน 5 MB');

  const human = await verifyTurnstile(c.env, s(f['cf-turnstile-response']), c.req.header('cf-connecting-ip') ?? null);
  if (!human) return step3('ยืนยันว่าไม่ใช่บอทไม่สำเร็จ กรุณาลองใหม่');

  // จองสต๊อกแบบมีเงื่อนไข: ถ้าสต๊อกไม่พอจะไม่มีแถวถูกแก้ไข
  const reserve = await DB.prepare(
    'UPDATE inventory SET reserved = reserved + ? WHERE product_id = ? AND on_hand - reserved >= ?',
  )
    .bind(input.qty, p.id, input.qty)
    .run();
  if (!reserve.meta.changes) return step3('สินค้าไม่พอ กรุณาลดจำนวนลง', 409);

  const a = amountsFor(p, input);
  const slipKey = `slips/${crypto.randomUUID()}.${ext}`;
  let orderId: number | null = null;
  try {
    await c.env.IMAGES.put(slipKey, await slip.arrayBuffer(), { httpMetadata: { contentType: slip.type } });
    const o = await DB.prepare(
      `INSERT INTO orders (customer_name, phone, address, note, total, payment_method, shipping_fee,
         amount_due_now, amount_on_delivery, slip_key, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+30 minutes'))`,
    )
      .bind(
        input.name,
        input.phone,
        input.address,
        input.note,
        a.total,
        input.method,
        a.shipping,
        a.dueNow,
        a.onDelivery,
        slipKey,
      )
      .run();
    orderId = Number(o.meta.last_row_id);
    await DB.prepare('INSERT INTO order_items (order_id, product_id, qty, unit_price) VALUES (?, ?, ?, ?)')
      .bind(orderId, p.id, input.qty, p.pricing.price)
      .run();
    return c.redirect(`/order/${orderId}`, 303);
  } catch (e) {
    // ย้อนสิ่งที่ทำไปแล้ว: คืนสต๊อกที่จอง ลบออเดอร์ที่เขียนไม่ครบ และลบสลิป
    if (orderId !== null) {
      await DB.batch([
        DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(orderId),
        DB.prepare('DELETE FROM orders WHERE id = ?').bind(orderId),
      ]);
    }
    await DB.prepare('UPDATE inventory SET reserved = reserved - ? WHERE product_id = ?')
      .bind(input.qty, p.id)
      .run();
    await c.env.IMAGES.delete(slipKey).catch(() => undefined);
    throw e;
  }
});

store.get('/order/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const DB = c.env.DB;
  const order = await DB.prepare(
    `SELECT id, total, status, payment_method, shipping_fee, amount_due_now, amount_on_delivery, slip_key
     FROM orders WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: number;
      total: number;
      status: string;
      payment_method: string;
      shipping_fee: number;
      amount_due_now: number;
      amount_on_delivery: number;
      slip_key: string | null;
    }>();
  if (!order) return c.notFound();
  const items = (
    await DB.prepare(
      `SELECT pr.name, oi.qty, oi.unit_price FROM order_items oi JOIN products pr ON pr.id = oi.product_id WHERE oi.order_id = ?`,
    )
      .bind(id)
      .all<{ name: string; qty: number; unit_price: number }>()
  ).results;
  return c.html(layout(`คำสั่งซื้อ #${id}`, orderView(order, items, c.env.BANK_INFO)));
});

/** ลิงก์ซื้อผ่าน Shopee / TikTok: บันทึกการคลิกแล้วส่งต่อไปยังลิงก์ affiliate */
store.get('/go/:channel/:id', async (c) => {
  const ch = c.req.param('channel') as Channel;
  const id = Number(c.req.param('id'));
  if (!CHANNELS.includes(ch)) return c.notFound();

  const link = await c.env.DB.prepare(
    `SELECT l.url, l.active FROM affiliate_links l JOIN products p ON p.id = l.product_id
     WHERE l.product_id = ? AND l.channel = ? AND p.status = 'published'`,
  )
    .bind(id, ch)
    .first<{ url: string; active: number }>();
  if (!link || !link.active || !isAllowedAffiliate(ch, link.url)) return c.notFound();

  await c.env.DB.prepare('INSERT INTO affiliate_clicks (product_id, channel) VALUES (?, ?)').bind(id, ch).run();
  return c.redirect(link.url, 302);
});
