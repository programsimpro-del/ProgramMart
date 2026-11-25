import { Hono, type Context } from 'hono';
import type { Env } from '../types';
import * as db from '../db';
import { layout, adminDashboard, productForm, errorBox, type AdminOrder } from '../views';
import { isAllowedAffiliate, CHANNELS, type Channel } from '../links';
import { s, int } from '../util';
import { actorOf, audit } from '../audit';

export const admin = new Hono<{ Bindings: Env }>();

type Ctx = Context<{ Bindings: Env }>;

const fail = (c: Ctx, msg: string, status = 400) =>
  c.html(layout('ผิดพลาด', errorBox(msg), true), status as 400);

admin.get('/', async (c) => {
  const [products, orders, cats] = await Promise.all([
    db.listProducts(c.env.DB, c.env.PUBLIC_IMAGE_BASE),
    c.env.DB.prepare("SELECT id, customer_name, phone, total, status, created_at, payment_method, amount_due_now, amount_on_delivery, (slip_key IS NOT NULL) AS has_slip FROM orders ORDER BY id DESC LIMIT 50").all<AdminOrder>(),
    db.listCategories(c.env.DB),
  ]);
  return c.html(layout('หลังบ้าน', adminDashboard(products, orders.results, cats), true));
});

admin.post('/categories', async (c) => {
  const f = await c.req.parseBody();
  const name = s(f.name);
  const slug = s(f.slug).toLowerCase();
  if (!name || !/^[a-z0-9-]+$/.test(slug)) return fail(c, 'ชื่อหมวดหรือ slug ไม่ถูกต้อง (slug ใช้ได้เฉพาะ a-z 0-9 และ -)');
  try {
    await c.env.DB.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)').bind(name, slug).run();
  } catch {
    return fail(c, 'slug นี้มีอยู่แล้ว');
  }
  await audit(c.env.DB, actorOf(c), 'category.create', 'category', slug, name);
  return c.redirect('/admin', 303);
});

admin.get('/products/new', async (c) => {
  const cats = await db.listCategories(c.env.DB);
  return c.html(layout('สินค้าใหม่', productForm(null, null, {}, cats, c.env.PUBLIC_SITE_URL), true));
});

admin.get('/products/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const p = await db.getProduct(c.env.DB, c.env.PUBLIC_IMAGE_BASE, 'id', id);
  if (!p) return c.notFound();
  const [cats, disc, links] = await Promise.all([
    db.listCategories(c.env.DB),
    db.getDiscount(c.env.DB, id),
    db.getLinks(c.env.DB, id),
  ]);
  return c.html(layout(p.name, productForm(p, disc, links, cats, c.env.PUBLIC_SITE_URL), true));
});

admin.post('/products', async (c) => {
  const DB = c.env.DB;
  const f = await c.req.parseBody();

  const id = int(f.id);
  const isNew = !(id > 0);
  const name = s(f.name);
  const slug = s(f.slug).toLowerCase();
  const description = s(f.description);
  const price = int(f.base_price);
  const onHand = int(f.on_hand);
  const status = s(f.status) === 'published' ? 'published' : 'draft';
  const categoryId = int(f.category_id) > 0 ? int(f.category_id) : null;
  const shippingFee = int(f.shipping_fee);

  if (!name) return fail(c, 'กรุณากรอกชื่อสินค้า');
  if (!/^[a-z0-9-]+$/.test(slug)) return fail(c, 'slug ใช้ได้เฉพาะ a-z 0-9 และ -');
  if (!(price >= 0)) return fail(c, 'ราคาต้องเป็นจำนวนเต็มตั้งแต่ 0');
  if (!(onHand >= 0)) return fail(c, 'สต๊อกต้องเป็นจำนวนเต็มตั้งแต่ 0');
  if (!(shippingFee >= 0)) return fail(c, 'ค่าจัดส่งต้องเป็นจำนวนเต็มตั้งแต่ 0');

  const dk = s(f.discount_kind);
  const dkind = dk === 'percent' || dk === 'fixed' ? dk : null;
  const dv = int(f.discount_value);
  if (dkind === 'percent' && !(dv >= 1 && dv <= 99)) return fail(c, 'ส่วนลดเป็น % ต้องอยู่ระหว่าง 1 ถึง 99');
  if (dkind === 'fixed' && !(dv >= 1 && dv <= price)) return fail(c, 'ส่วนลดเป็นบาทต้องมากกว่า 0 และไม่เกินราคาสินค้า');
  const startsAt = s(f.starts_at) || null;
  const endsAt = s(f.ends_at) || null;
  if (startsAt && endsAt && startsAt > endsAt) return fail(c, 'วันสิ้นสุดส่วนลดต้องอยู่หลังวันเริ่มต้น');

  const links: { channel: Channel; url: string; active: number }[] = [];
  for (const ch of CHANNELS) {
    const url = s(f[`${ch}_url`]);
    if (!url) continue;
    if (!isAllowedAffiliate(ch, url)) return fail(c, `ลิงก์ ${ch} ไม่ถูกต้องหรือไม่ใช่โดเมนที่อนุญาต`);
    links.push({ channel: ch, url, active: s(f[`${ch}_active`]) === 'on' ? 1 : 0 });
  }

  let productId = id;
  try {
    // ตรวจสต๊อกใหม่ไม่ให้ต่ำกว่าจำนวนที่ถูกจองอยู่ก่อนเขียนข้อมูล
    const cur = isNew
      ? null
      : await DB.prepare('SELECT on_hand, reserved FROM inventory WHERE product_id = ?')
          .bind(id)
          .first<{ on_hand: number; reserved: number }>();
    if (cur && onHand < cur.reserved) {
      return fail(c, `สต๊อกใหม่ต่ำกว่าจำนวนที่ถูกจองอยู่ (${cur.reserved} ชิ้น)`);
    }

    if (isNew) {
      const r = await DB.prepare(
        'INSERT INTO products (name, slug, description, base_price, shipping_fee, status, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(name, slug, description, price, shippingFee, status, categoryId)
        .run();
      productId = Number(r.meta.last_row_id);
    } else {
      await DB.prepare(
        'UPDATE products SET name = ?, slug = ?, description = ?, base_price = ?, shipping_fee = ?, status = ?, category_id = ? WHERE id = ?',
      )
        .bind(name, slug, description, price, shippingFee, status, categoryId, id)
        .run();
    }

    const oldOnHand = cur?.on_hand ?? 0;
    const stmts = [
      DB.prepare('INSERT OR IGNORE INTO inventory (product_id, on_hand, reserved) VALUES (?, 0, 0)').bind(productId),
      DB.prepare('UPDATE inventory SET on_hand = ? WHERE product_id = ?').bind(onHand, productId),
      DB.prepare('DELETE FROM discounts WHERE product_id = ?').bind(productId),
      DB.prepare('DELETE FROM affiliate_links WHERE product_id = ?').bind(productId),
    ];
    if (onHand !== oldOnHand) {
      stmts.push(
        DB.prepare('INSERT INTO inventory_movements (product_id, change, reason) VALUES (?, ?, ?)').bind(
          productId,
          onHand - oldOnHand,
          'ปรับสต๊อกจากหน้าสินค้า',
        ),
      );
    }
    if (dkind) {
      stmts.push(
        DB.prepare(
          'INSERT INTO discounts (product_id, kind, value, starts_at, ends_at, active) VALUES (?, ?, ?, ?, ?, 1)',
        ).bind(productId, dkind, dv, startsAt, endsAt),
      );
    }
    for (const l of links) {
      stmts.push(
        DB.prepare('INSERT INTO affiliate_links (product_id, channel, url, active) VALUES (?, ?, ?, ?)').bind(
          productId,
          l.channel,
          l.url,
          l.active,
        ),
      );
    }
    await DB.batch(stmts);
    await audit(
      DB,
      actorOf(c),
      isNew ? 'product.create' : 'product.update',
      'product',
      productId,
      `${name} | ราคา ${price} | สต๊อก ${onHand}`,
    );
  } catch (e) {
    const msg = e instanceof Error && /UNIQUE/i.test(e.message) ? 'slug นี้ถูกใช้แล้ว' : 'บันทึกไม่สำเร็จ';
    return fail(c, msg);
  }

  return c.redirect(`/admin/products/${productId}`, 303);
});

admin.post('/products/:id/images', async (c) => {
  const id = Number(c.req.param('id'));
  const exists = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
  if (!exists) return c.notFound();

  const f = await c.req.parseBody();
  const file = f.image;
  if (!(file instanceof File)) return fail(c, 'ไม่พบไฟล์รูป');
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[file.type];
  if (!ext) return fail(c, 'รองรับเฉพาะไฟล์ JPG, PNG และ WEBP');
  if (file.size > 5 * 1024 * 1024) return fail(c, 'ไฟล์ต้องไม่เกิน 5 MB');

  const key = `products/${id}/${crypto.randomUUID()}.${ext}`;
  await c.env.IMAGES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const cnt = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM product_images WHERE product_id = ?')
    .bind(id)
    .first<{ n: number }>();
  await c.env.DB.prepare('INSERT INTO product_images (product_id, object_key, sort_order) VALUES (?, ?, ?)')
    .bind(id, key, cnt?.n ?? 0)
    .run();
  await audit(c.env.DB, actorOf(c), 'product.image_upload', 'product', id, key);
  return c.redirect(`/admin/products/${id}`, 303);
});

/**
 * ชำระแล้ว: ตัดสต๊อกจริงและปลดการจอง / ยกเลิก: คืนการจองกลับเข้าสต๊อก
 * ยืนยันสถานะก่อน (claim) แล้วจึงแก้สต๊อก เพื่อไม่ให้ตัดหรือคืนซ้ำเมื่อกดพร้อมกัน
 */
async function settleOrder(c: Ctx, action: 'paid' | 'cancelled') {
  const DB = c.env.DB;
  const id = Number(c.req.param('id'));
  const order = await DB.prepare('SELECT id FROM orders WHERE id = ?').bind(id).first<{ id: number }>();
  if (!order) return c.notFound();

  const claim = await DB.prepare("UPDATE orders SET status = ? WHERE id = ? AND status = 'pending'")
    .bind(action, id)
    .run();
  if (!claim.meta.changes) return fail(c, 'ออเดอร์นี้ดำเนินการไปแล้ว');

  const items = (
    await DB.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ?')
      .bind(id)
      .all<{ product_id: number; qty: number }>()
  ).results;

  const stmts = [];
  for (const it of items) {
    if (action === 'paid') {
      stmts.push(
        DB.prepare('UPDATE inventory SET on_hand = on_hand - ?, reserved = reserved - ? WHERE product_id = ?').bind(
          it.qty,
          it.qty,
          it.product_id,
        ),
      );
      stmts.push(
        DB.prepare('INSERT INTO inventory_movements (product_id, change, reason) VALUES (?, ?, ?)').bind(
          it.product_id,
          -it.qty,
          `ขายออเดอร์ #${id}`,
        ),
      );
    } else {
      stmts.push(
        DB.prepare('UPDATE inventory SET reserved = reserved - ? WHERE product_id = ?').bind(it.qty, it.product_id),
      );
    }
  }
  if (stmts.length) await DB.batch(stmts);

  await audit(DB, actorOf(c), `order.${action}`, 'order', id);
  return c.redirect('/admin', 303);
}

/** ดูสลิปการโอนของออเดอร์ (อ่านจาก R2 ผ่านหลังบ้านเท่านั้น) */
admin.get('/orders/:id/slip', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT slip_key FROM orders WHERE id = ?')
    .bind(id)
    .first<{ slip_key: string | null }>();
  if (!row?.slip_key) return c.notFound();
  const obj = await c.env.IMAGES.get(row.slip_key);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: { 'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'cache-control': 'private, no-store' },
  });
});

admin.post('/orders/:id/paid', (c) => settleOrder(c, 'paid'));
admin.post('/orders/:id/cancel', (c) => settleOrder(c, 'cancelled'));
