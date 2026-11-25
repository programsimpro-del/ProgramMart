-- หมดเวลาชำระเงิน: ออเดอร์ที่ยัง pending และเลย expires_at จะถูกยกเลิกและคืนสต๊อกโดย cron
ALTER TABLE orders ADD COLUMN expires_at TEXT;
ALTER TABLE orders ADD COLUMN cancel_reason TEXT;
CREATE INDEX idx_orders_expiry ON orders (status, expires_at);

-- ประวัติการแก้ไขในหลังบ้าน ใครทำอะไร เมื่อไร
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
