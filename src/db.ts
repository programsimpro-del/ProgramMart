import { priceFor, nowBangkok, type DiscountRow } from './pricing';
import type { Channel } from './links';

export interface Category {
  id: number;
  name: string;
  slug: string;
}

export interface ProductRow {
  id: number;
  name: string;
  slug: string;
  description: string;
  base_price: number;
  shipping_fee: number;
  status: 'draft' | 'published';
  category_id: number | null;
  category_slug: string | null;
  category_name: string | null;
  on_hand: number;
  reserved: number;
}

export interface ProductView extends ProductRow {
  images: string[];
  cover: string | null;
  available: number;
  pricing: ReturnType<typeof priceFor>;
}

export interface LinkInfo {
  url: string;
  active: boolean;
}

const SELECT_PRODUCTS = `
  SELECT p.id, p.name, p.slug, p.description, p.base_price, p.shipping_fee, p.status, p.category_id,
         c.slug AS category_slug, c.name AS category_name,
         COALESCE(i.on_hand, 0) AS on_hand, COALESCE(i.reserved, 0) AS reserved
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN inventory i ON i.product_id = p.id`;

export async function listCategories(DB: D1Database): Promise<Category[]> {
  const r = await DB.prepare('SELECT id, name, slug FROM categories ORDER BY name').all<Category>();
  return r.results;
}

async function hydrate(DB: D1Database, rows: ProductRow[], imageBase: string): Promise<ProductView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const [discounts, images] = await Promise.all([
    DB.prepare(
      `SELECT product_id, kind, value, starts_at, ends_at, active FROM discounts WHERE product_id IN (${ph})`,
    )
      .bind(...ids)
      .all<DiscountRow & { product_id: number }>(),
    DB.prepare(
      `SELECT product_id, object_key FROM product_images WHERE product_id IN (${ph}) ORDER BY sort_order, id`,
    )
      .bind(...ids)
      .all<{ product_id: number; object_key: string }>(),
  ]);
  const now = nowBangkok();
  return rows.map((r) => {
    const imgs = images.results
      .filter((i) => i.product_id === r.id)
      .map((i) => `${imageBase}/${i.object_key}`);
    const ds = discounts.results.filter((d) => d.product_id === r.id);
    return {
      ...r,
      images: imgs,
      cover: imgs[0] ?? null,
      available: Math.max(0, r.on_hand - r.reserved),
      pricing: priceFor(r.base_price, ds, now),
    };
  });
}

export async function listProducts(
  DB: D1Database,
  imageBase: string,
  opts: { publishedOnly?: boolean; categorySlug?: string } = {},
): Promise<ProductView[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (opts.publishedOnly) where.push("p.status = 'published'");
  if (opts.categorySlug) {
    where.push('c.slug = ?');
    binds.push(opts.categorySlug);
  }
  const sql =
    SELECT_PRODUCTS + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY p.id DESC';
  const r = await DB.prepare(sql).bind(...binds).all<ProductRow>();
  return hydrate(DB, r.results, imageBase);
}

export async function getProduct(
  DB: D1Database,
  imageBase: string,
  by: 'id' | 'slug',
  value: string | number,
  publishedOnly = false,
): Promise<ProductView | null> {
  const cond = by === 'id' ? 'p.id = ?' : 'p.slug = ?';
  const sql = SELECT_PRODUCTS + ` WHERE ${cond}` + (publishedOnly ? " AND p.status = 'published'" : '');
  const row = await DB.prepare(sql).bind(value).first<ProductRow>();
  if (!row) return null;
  return (await hydrate(DB, [row], imageBase))[0] ?? null;
}

export async function getLinks(DB: D1Database, productId: number): Promise<Partial<Record<Channel, LinkInfo>>> {
  const r = await DB.prepare('SELECT channel, url, active FROM affiliate_links WHERE product_id = ?')
    .bind(productId)
    .all<{ channel: Channel; url: string; active: number }>();
  const out: Partial<Record<Channel, LinkInfo>> = {};
  for (const l of r.results) out[l.channel] = { url: l.url, active: !!l.active };
  return out;
}

export async function getDiscount(DB: D1Database, productId: number) {
  return DB.prepare(
    'SELECT kind, value, starts_at, ends_at, active FROM discounts WHERE product_id = ? ORDER BY id DESC LIMIT 1',
  )
    .bind(productId)
    .first<DiscountRow>();
}
