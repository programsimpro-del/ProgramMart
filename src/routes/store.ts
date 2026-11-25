import { Hono } from 'hono';
import type { Env } from '../types';
import * as db from '../db';
import { layout, homeView, categoryView, productView, productMeta, orderView, errorBox } from '../views';
import { isAllowedAffiliate, CHANNELS, type Channel } from '../links';
import { s, int } from '../util';
import { verifyTurnstile } from '../turnstile';

export const store = new Hono<{ Bindings: Env }>();

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
  return c.html(
    layout(
      p.name,
      productView(p, links, c.env.TURNSTILE_SITE_KEY ?? ''),
      false,
      productMeta(p, c.env.PUBLIC_SITE_URL),
    ),
  );
});

store.post('/p/:slug/order', async (c) => {
  const DB = c.env.DB;
  const p = await db.getProduct(DB, c.env.PUBLIC_IMAGE_BASE, 'slug', c.req.param('slug'), true);
  if (!p) return c.notFound();

  const f = await c.req.parseBody();
  const qty = int(f.qty);
  const name = s(f.customer_name);
  const phone = s(f.phone);
  const note = s(f.note);

  if (!(qty >= 1 && qty <= 50)) return c.html(layout('ผิดพลาด', errorBox('จำนวนต้องอยู่ระหว่าง 1 ถึง 50')), 400);
  if (!name || !/^[0-9+\-\s]{9,15}$/.test(phone)) {
    return c.html(layout('ผิดพลาด', errorBox('กรุณากรอกชื่อและเบอร์โทรที่ถูกต้อง')), 400);
  }

  const human = await verifyTurnstile(c.env, s(f['cf-turnstile-response']), c.req.header('cf-connecting-ip') ?? null);
  if (!human) {
    return c.html(layout('ผิดพลาด', errorBox('ยืนยันว่าไม่ใช่บอทไม่สำเร็จ กรุณาลองใหม่')), 400);
  }

  // จองสต๊อกแบบมีเงื่อนไข: ถ้าสต๊อกไม่พอจะไม่มีแถวถูกแก้ไข
  const reserve = await DB.prepare(
    'UPDATE inventory SET reserved = reserved + ? WHERE product_id = ? AND on_hand - reserved >= ?',
  )
    .bind(qty, p.id, qty)
    .run();
  if (!reserve.meta.changes) {
    return c.html(layout('ผิดพลาด', errorBox('สินค้าไม่พอ กรุณาลดจำนวนลง')), 409);
  }

  const unit = p.pricing.price;
  try {
    const o = await DB.prepare(
      "INSERT INTO orders (customer_name, phone, note, total, expires_at) VALUES (?, ?, ?, ?, datetime('now', '+30 minutes'))",
    )
      .bind(name, phone, note, unit * qty)
      .run();
    const orderId = Number(o.meta.last_row_id);
    await DB.prepare('INSERT INTO order_items (order_id, product_id, qty, unit_price) VALUES (?, ?, ?, ?)')
      .bind(orderId, p.id, qty, unit)
      .run();
    return c.redirect(`/order/${orderId}`, 303);
  } catch (e) {
    // คืนสต๊อกที่จองไว้ถ้าบันทึกออเดอร์ไม่สำเร็จ
    await DB.prepare('UPDATE inventory SET reserved = reserved - ? WHERE product_id = ?').bind(qty, p.id).run();
    throw e;
  }
});

store.get('/order/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const DB = c.env.DB;
  const order = await DB.prepare('SELECT id, total, status FROM orders WHERE id = ?')
    .bind(id)
    .first<{ id: number; total: number; status: string }>();
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
