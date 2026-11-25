/**
 * ยกเลิกออเดอร์ที่หมดเวลาชำระ และคืนสต๊อกที่จองไว้
 * ใช้ "ยืนยันสถานะก่อน" (claim) เพื่อไม่ให้คืนสต๊อกซ้ำถ้ามีการชำระหรือยกเลิกพร้อมกัน
 */
export async function releaseExpiredOrders(DB: D1Database): Promise<number> {
  const expired = await DB.prepare(
    "SELECT id FROM orders WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < datetime('now') LIMIT 100",
  ).all<{ id: number }>();

  let released = 0;
  for (const o of expired.results) {
    const claim = await DB.prepare(
      "UPDATE orders SET status = 'cancelled', cancel_reason = 'หมดเวลาชำระเงิน' WHERE id = ? AND status = 'pending'",
    )
      .bind(o.id)
      .run();
    if (!claim.meta.changes) continue;

    const items = await DB.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ?')
      .bind(o.id)
      .all<{ product_id: number; qty: number }>();
    await DB.batch(
      items.results.map((it) =>
        DB.prepare('UPDATE inventory SET reserved = reserved - ? WHERE product_id = ?').bind(it.qty, it.product_id),
      ),
    );
    released++;
  }
  return released;
}
