import { esc, baht } from './util';
import type { Category, ProductView, LinkInfo } from './db';
import type { Channel } from './links';
import { CHANNELS } from './links';

type Links = Partial<Record<Channel, LinkInfo>>;

const CSS = `
body{font-family:system-ui,"Noto Sans Thai",sans-serif;margin:0;color:#1f1f1f;background:#fff}
header{display:flex;justify-content:space-between;align-items:center;padding:16px 32px;border-bottom:1px solid #e4e4e0}
header a{color:inherit;text-decoration:none}
main{max-width:1100px;margin:0 auto;padding:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px}
.card{border:1px solid #e4e4e0;border-radius:12px;padding:12px;color:inherit;text-decoration:none;display:block}
.thumb{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;background:#f1efe8;display:flex;align-items:center;justify-content:center;color:#888;font-size:13px}
.price{font-weight:600}.old{text-decoration:line-through;color:#888;margin-left:6px}
.badge{font-size:12px;padding:2px 8px;border-radius:6px;background:#faece7;color:#712b13;margin-left:6px}
.stock{font-size:13px;color:#27500a}.out{color:#a32d2d}
.btn{display:inline-block;padding:12px 18px;border-radius:8px;border:1px solid #1f1f1f;background:#1f1f1f;color:#fff;text-decoration:none;cursor:pointer;font-size:16px;text-align:center;box-sizing:border-box}
.btn.alt{background:#fff;color:#1f1f1f;border-color:#b4b2a9;width:100%;margin-top:8px}
.btn[disabled]{opacity:.4;cursor:not-allowed}
label{display:block;margin:10px 0 4px;font-size:14px}
input,select,textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #b4b2a9;border-radius:6px;font-size:15px}
table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e4e4e0;padding:8px;text-align:left;font-size:14px;vertical-align:top}
.row{display:flex;gap:12px}.row>*{flex:1}
.err{color:#a32d2d}.muted{color:#5f5e5a;font-size:14px}
.pill{display:inline-block;padding:4px 12px;border:1px solid #e4e4e0;border-radius:999px;margin:4px;color:inherit;text-decoration:none;font-size:14px}
.section{margin:28px 0 12px;font-size:18px;font-weight:500}
`;

export function layout(title: string, body: string, admin = false, head = ''): string {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${head}<style>${CSS}</style></head><body>
<header><a href="/" style="font-size:20px;font-weight:600">ร้านของฉัน</a>${
    admin ? '<a href="/admin">หลังบ้าน</a>' : ''
  }</header><main>${body}</main></body></html>`;
}

/**
 * meta สำหรับการ์ดตัวอย่างลิงก์ (Facebook, LINE และแอปอื่นๆ ดึงรูปและชื่อจากแท็กเหล่านี้)
 * รูปต้องเป็น URL แบบเต็ม (https) ซึ่ง cover ได้มาจาก PUBLIC_IMAGE_BASE อยู่แล้ว
 */
export function productMeta(p: ProductView, siteUrl: string): string {
  const url = `${siteUrl}/p/${p.slug}`;
  const desc = (p.description || p.name).replace(/\s+/g, ' ').slice(0, 160);
  return `<link rel="canonical" href="${esc(url)}">
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="ร้านของฉัน">
<meta property="og:title" content="${esc(p.name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
${p.cover ? `<meta property="og:image" content="${esc(p.cover)}">\n<meta property="og:image:alt" content="${esc(p.name)}">` : ''}
<meta property="product:price:amount" content="${p.pricing.price}">
<meta property="product:price:currency" content="THB">
<meta name="twitter:card" content="${p.cover ? 'summary_large_image' : 'summary'}">`;
}

/** กล่องลิงก์สำหรับแชร์: ลิงก์หลักและลิงก์ที่มี ?src= เพื่อวัดยอดแต่ละช่องทาง */
function shareBox(p: ProductView, siteUrl: string): string {
  const base = `${siteUrl}/p/${p.slug}`;
  const row = (label: string, url: string) =>
    `<label>${esc(label)}</label><input readonly value="${esc(url)}" onclick="this.select()">`;
  return `<div class="section">ลิงก์สำหรับแชร์</div>
<p class="muted" style="margin:0 0 8px">วางลิงก์ในโพสต์ Facebook หรือข้อความ LINE ได้เลย เมื่อลูกค้ากดรูปหรือการ์ดตัวอย่าง ระบบจะพาไปหน้าสินค้านี้</p>
${row('ลิงก์หลัก', base)}
${row('Facebook', base + '?src=facebook')}
${row('LINE', base + '?src=line')}`;
}

export function errorBox(msg: string): string {
  return `<p class="err">${esc(msg)}</p><p><a href="javascript:history.back()">ย้อนกลับ</a></p>`;
}

function priceHtml(p: ProductView): string {
  const pr = p.pricing;
  if (!pr.discounted) return `<span class="price">${baht(pr.price)}</span>`;
  return `<span class="price">${baht(pr.price)}</span><span class="old">${baht(pr.original)}</span><span class="badge">ลด ${pr.percentOff}%</span>`;
}

function stockHtml(p: ProductView): string {
  return p.available > 0
    ? `<span class="stock">คงเหลือในร้าน ${p.available} ชิ้น</span>`
    : `<span class="stock out">สินค้าหมดในร้าน</span>`;
}

function productCard(p: ProductView): string {
  const img = p.cover
    ? `<img class="thumb" src="${esc(p.cover)}" alt="${esc(p.name)}" style="object-fit:cover">`
    : `<div class="thumb">ยังไม่มีรูป</div>`;
  return `<a class="card" href="/p/${esc(p.slug)}">${img}
<div style="margin-top:8px;font-size:15px">${esc(p.name)}</div>
<div>${priceHtml(p)}</div>${stockHtml(p)}</a>`;
}

function categoryNav(cats: Category[]): string {
  return cats.map((c) => `<a class="pill" href="/c/${esc(c.slug)}">${esc(c.name)}</a>`).join('');
}

export function homeView(cats: Category[], products: ProductView[]): string {
  return `<div>${categoryNav(cats)}</div>
<div class="section">สินค้าทั้งหมด</div>
${products.length ? `<div class="grid">${products.map(productCard).join('')}</div>` : '<p class="muted">ยังไม่มีสินค้าให้แสดง</p>'}`;
}

export function categoryView(cat: Category, cats: Category[], products: ProductView[]): string {
  return `<div>${categoryNav(cats)}</div>
<div class="section">${esc(cat.name)}</div>
${products.length ? `<div class="grid">${products.map(productCard).join('')}</div>` : '<p class="muted">ยังไม่มีสินค้าในหมวดนี้</p>'}`;
}

export function productView(p: ProductView, links: Links, turnstileKey = ''): string {
  const img = p.cover
    ? `<img src="${esc(p.cover)}" alt="${esc(p.name)}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px">`
    : `<div class="thumb" style="border-radius:12px;height:100%;min-height:360px">ยังไม่มีรูปสินค้า</div>`;

  const shopForm =
    p.available > 0
      ? `<form method="post" action="/p/${esc(p.slug)}/order" style="margin-top:12px">
  <label>จำนวน (คงเหลือ ${p.available} ชิ้น)</label>
  <input name="qty" type="number" min="1" max="${Math.min(50, p.available)}" value="1" required>
  <label>ชื่อผู้รับ</label><input name="customer_name" required>
  <label>เบอร์โทร</label><input name="phone" required>
  <label>หมายเหตุ</label><textarea name="note" rows="2"></textarea>
  ${
    turnstileKey
      ? `<div class="cf-turnstile" data-sitekey="${esc(turnstileKey)}" style="margin-top:12px"></div>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
      : ''
  }
  <button class="btn" type="submit" style="margin-top:12px;width:100%">ซื้อที่ร้าน</button>
</form>`
      : `<button class="btn" disabled style="margin-top:12px;width:100%">ซื้อที่ร้าน (สินค้าหมด)</button>`;

  const extern = CHANNELS.filter((ch) => links[ch]?.active);
  const externHtml = extern
    .map((ch) => `<a class="btn alt" href="/go/${ch}/${p.id}">ซื้อผ่าน ${ch === 'shopee' ? 'Shopee' : 'TikTok'}</a>`)
    .join('');
  const disclosure = extern.length
    ? `<p class="muted" style="font-size:12px">ปุ่ม Shopee และ TikTok เป็นลิงก์พันธมิตร ราคาและสต๊อกอาจต่างกันตามแพลตฟอร์ม</p>`
    : '';

  return `<div class="row" style="gap:40px;align-items:flex-start;flex-wrap:wrap">
  <div style="flex:1;min-width:280px">${img}</div>
  <div style="flex:1;min-width:280px">
    <h1 style="font-size:28px;font-weight:500;margin:0 0 8px">${esc(p.name)}</h1>
    ${p.category_name ? `<div class="muted">หมวด ${esc(p.category_name)}</div>` : ''}
    <div style="margin:16px 0;font-size:24px">${priceHtml(p)}</div>
    <div>${stockHtml(p)}</div>
    ${shopForm}
    ${externHtml}
    ${disclosure}
    ${!p.available && !extern.length ? '<p class="muted">ติดต่อสอบถามทางร้านได้โดยตรง</p>' : ''}
    <div style="border-top:1px solid #e4e4e0;margin-top:20px;padding-top:16px;line-height:1.7;white-space:pre-line">${esc(p.description)}</div>
  </div>
</div>`;
}

export function orderView(
  order: { id: number; total: number; status: string },
  items: { name: string; qty: number; unit_price: number }[],
  bankInfo: string,
): string {
  const statusText: Record<string, string> = {
    pending: 'รอการชำระเงิน',
    paid: 'ชำระเงินแล้ว',
    cancelled: 'ยกเลิกแล้ว',
  };
  return `<h1 style="font-size:24px;font-weight:500">คำสั่งซื้อ #${order.id}</h1>
<p class="muted">สถานะ: ${esc(statusText[order.status] ?? order.status)}</p>
<table><tr><th>สินค้า</th><th>จำนวน</th><th>ราคา</th></tr>
${items.map((i) => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${baht(i.unit_price * i.qty)}</td></tr>`).join('')}
<tr><th colspan="2">รวมทั้งสิ้น</th><th>${baht(order.total)}</th></tr></table>
${
  order.status === 'pending'
    ? `<div style="margin-top:20px;padding:16px;border:1px solid #e4e4e0;border-radius:12px">
<p style="margin:0 0 8px">โอนเงินตามรายละเอียดด้านล่าง แล้วทีมงานจะยืนยันคำสั่งซื้อให้</p>
<p style="margin:0 0 8px" class="muted">หากไม่ชำระภายใน 30 นาที ระบบจะยกเลิกออเดอร์นี้และคืนสต๊อกอัตโนมัติ</p>
<p style="margin:0;white-space:pre-line">${esc(bankInfo)}</p></div>`
    : ''
}`;
}

export interface AdminOrder {
  id: number;
  customer_name: string;
  phone: string;
  total: number;
  status: string;
  created_at: string;
}

export function adminDashboard(products: ProductView[], orders: AdminOrder[], cats: Category[]): string {
  const prodRows = products
    .map(
      (p) => `<tr><td><a href="/admin/products/${p.id}">${esc(p.name)}</a></td>
<td>${esc(p.category_name ?? '-')}</td><td>${baht(p.pricing.price)}${p.pricing.discounted ? ` <span class="muted">(ปกติ ${baht(p.pricing.original)})</span>` : ''}</td>
<td>${p.on_hand} / จอง ${p.reserved}</td><td>${p.status === 'published' ? 'เผยแพร่' : 'ร่าง'}</td></tr>`,
    )
    .join('');

  const orderRows = orders
    .map(
      (o) => `<tr><td>#${o.id}</td><td>${esc(o.customer_name)}<br><span class="muted">${esc(o.phone)}</span></td>
<td>${baht(o.total)}</td><td>${esc(o.status)}</td><td>${esc(o.created_at)}</td>
<td>${
        o.status === 'pending'
          ? `<form method="post" action="/admin/orders/${o.id}/paid" style="display:inline"><button class="btn" style="padding:6px 10px;font-size:13px">ชำระแล้ว</button></form>
<form method="post" action="/admin/orders/${o.id}/cancel" style="display:inline"><button class="btn alt" style="padding:6px 10px;font-size:13px;width:auto;margin-top:0">ยกเลิก</button></form>`
          : ''
      }</td></tr>`,
    )
    .join('');

  return `<div class="row" style="justify-content:space-between;align-items:center">
  <h1 style="font-size:24px;font-weight:500;flex:none">หลังบ้าน</h1>
  <a class="btn" href="/admin/products/new" style="flex:none">เพิ่มสินค้า</a>
</div>

<div class="section">สินค้า</div>
<table><tr><th>ชื่อ</th><th>หมวด</th><th>ราคาขาย</th><th>สต๊อก / จอง</th><th>สถานะ</th></tr>${prodRows || '<tr><td colspan="5">ยังไม่มีสินค้า</td></tr>'}</table>

<div class="section">ออเดอร์ล่าสุด</div>
<table><tr><th>เลขที่</th><th>ผู้สั่ง</th><th>ยอด</th><th>สถานะ</th><th>วันที่</th><th></th></tr>${orderRows || '<tr><td colspan="6">ยังไม่มีออเดอร์</td></tr>'}</table>

<div class="section">หมวดสินค้า</div>
<div>${cats.map((c) => `<span class="pill">${esc(c.name)} (${esc(c.slug)})</span>`).join('')}</div>
<form method="post" action="/admin/categories" class="row" style="margin-top:12px;max-width:520px">
  <input name="name" placeholder="ชื่อหมวด เช่น เสื้อผ้า" required>
  <input name="slug" placeholder="slug เช่น clothes" required pattern="[a-z0-9-]+">
  <button class="btn" type="submit" style="flex:none">เพิ่มหมวด</button>
</form>`;
}

export function productForm(
  p: ProductView | null,
  disc: { kind: string; value: number; starts_at: string | null; ends_at: string | null } | null,
  links: Links,
  cats: Category[],
  siteUrl: string,
): string {
  const sel = (v: string, cur: string | number | null | undefined) => (String(cur ?? '') === v ? 'selected' : '');
  const linkRow = (ch: Channel, label: string) => {
    const l = links[ch];
    return `<label>ลิงก์ ${label} (affiliate)</label>
<input name="${ch}_url" value="${esc(l?.url ?? '')}" placeholder="https://...">
<label style="font-weight:normal"><input type="checkbox" name="${ch}_active" style="width:auto" ${l?.active !== false && l ? 'checked' : ''}> เปิดใช้งานปุ่ม ${label}</label>`;
  };

  const images = p
    ? `<div class="section">รูปภาพ</div>
<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">${p.images
        .map((u) => `<img src="${esc(u)}" style="width:100%;border-radius:8px">`)
        .join('')}</div>
<form method="post" action="/admin/products/${p.id}/images" enctype="multipart/form-data" class="row" style="margin-top:12px;max-width:520px">
  <input type="file" name="image" accept="image/jpeg,image/png,image/webp" required>
  <button class="btn" type="submit" style="flex:none">อัปโหลดรูป</button>
</form>`
    : '<p class="muted">บันทึกสินค้าก่อน แล้วค่อยอัปโหลดรูป</p>';

  const share = p ? shareBox(p, siteUrl) : '';

  return `<h1 style="font-size:24px;font-weight:500">${p ? 'แก้ไขสินค้า' : 'สินค้าใหม่'}</h1>
<form method="post" action="/admin/products" style="max-width:680px">
  ${p ? `<input type="hidden" name="id" value="${p.id}">` : ''}
  <label>ชื่อสินค้า</label><input name="name" value="${esc(p?.name ?? '')}" required>
  <label>slug (ใช้ใน URL เช่น mini-tote)</label><input name="slug" value="${esc(p?.slug ?? '')}" required pattern="[a-z0-9-]+">
  <label>หมวด</label>
  <select name="category_id"><option value="">ไม่ระบุ</option>${cats
    .map((c) => `<option value="${c.id}" ${sel(String(c.id), p?.category_id)}>${esc(c.name)}</option>`)
    .join('')}</select>
  <label>รายละเอียด</label><textarea name="description" rows="4">${esc(p?.description ?? '')}</textarea>
  <div class="row">
    <div><label>ราคาปกติ (บาท)</label><input name="base_price" type="number" min="0" step="1" value="${p?.base_price ?? ''}" required></div>
    <div><label>สต๊อกในร้าน (ชิ้น)</label><input name="on_hand" type="number" min="0" step="1" value="${p?.on_hand ?? 0}" required></div>
  </div>
  <label>สถานะ</label>
  <select name="status"><option value="draft" ${sel('draft', p?.status ?? 'draft')}>ร่าง</option><option value="published" ${sel('published', p?.status)}>เผยแพร่</option></select>

  <div class="section">ส่วนลด (ตัวเดียวต่อสินค้า)</div>
  <div class="row">
    <div><label>ประเภท</label>
      <select name="discount_kind">
        <option value="none" ${disc ? '' : 'selected'}>ไม่มี</option>
        <option value="percent" ${sel('percent', disc?.kind)}>ลดเป็น %</option>
        <option value="fixed" ${sel('fixed', disc?.kind)}>ลดเป็นบาท</option>
      </select></div>
    <div><label>ค่าส่วนลด</label><input name="discount_value" type="number" min="1" step="1" value="${disc?.value ?? ''}"></div>
  </div>
  <div class="row">
    <div><label>เริ่ม (เวลาไทย)</label><input name="starts_at" type="datetime-local" value="${esc(disc?.starts_at ?? '')}"></div>
    <div><label>สิ้นสุด (เวลาไทย)</label><input name="ends_at" type="datetime-local" value="${esc(disc?.ends_at ?? '')}"></div>
  </div>

  <div class="section">ลิงก์ซื้อออนไลน์</div>
  ${linkRow('shopee', 'Shopee')}
  ${linkRow('tiktok', 'TikTok')}

  <button class="btn" type="submit" style="margin-top:20px">บันทึก</button>
</form>
${share}
${images}`;
}
