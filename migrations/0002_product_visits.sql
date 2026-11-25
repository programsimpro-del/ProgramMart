-- นับการเข้าหน้าสินค้าที่มาจากลิงก์ที่แชร์ (?src=...)
CREATE TABLE product_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
