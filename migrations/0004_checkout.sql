-- ค่าจัดส่งต่อสินค้า (ชั่วคราว: กรอกเองในหลังบ้านจนกว่าจะเชื่อม API ขนส่ง)
ALTER TABLE products ADD COLUMN shipping_fee INTEGER NOT NULL DEFAULT 40 CHECK (shipping_fee >= 0);

-- วิธีชำระ: transfer = โอนเต็มจำนวน, cod = โอนค่าจัดส่งก่อน แล้วชำระค่าสินค้าตอนรับของ
ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'transfer' CHECK (payment_method IN ('transfer', 'cod'));
ALTER TABLE orders ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN shipping_fee INTEGER NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0);
ALTER TABLE orders ADD COLUMN amount_due_now INTEGER NOT NULL DEFAULT 0 CHECK (amount_due_now >= 0);
ALTER TABLE orders ADD COLUMN amount_on_delivery INTEGER NOT NULL DEFAULT 0 CHECK (amount_on_delivery >= 0);
-- คีย์ของสลิปโอนเงินใน R2
ALTER TABLE orders ADD COLUMN slip_key TEXT;
