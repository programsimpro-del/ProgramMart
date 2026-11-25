# ร้านของฉัน (Cloudflare Workers + D1 + R2)

ระบบหน้าร้านและหลังบ้านสำหรับขายสินค้าหลายหมวด
- หน้าร้าน: แสดงหมวด รายการสินค้า ราคาหลังลด สต๊อกคงเหลือ และปุ่มซื้อ
- ปุ่ม "ซื้อที่ร้าน" สร้างออเดอร์และจองสต๊อกก่อนชำระเงิน
- ปุ่ม "ซื้อผ่าน Shopee / TikTok" ไปที่ `/go/...` ซึ่งบันทึกการคลิกแล้วส่งต่อไปยังลิงก์ affiliate
- หลังบ้าน: จัดการหมวด สินค้า รูป ราคา ส่วนลดตามช่วงเวลา สต๊อก ลิงก์ affiliate และออเดอร์

## ติดตั้งและรันบนเครื่อง

```bash
npm install
echo 'ALLOW_DEV_ADMIN=true' > .dev.vars   # ให้เข้าหลังบ้านได้ตอนพัฒนาเท่านั้น
npm run db:migrate:local
npm run dev
```

เปิด `http://localhost:8787/admin` เพื่อเข้าหลังบ้าน

## ตั้งค่า Cloudflare ครั้งแรก

1. สร้างฐานข้อมูล D1 แล้วนำ `database_id` ไปใส่ใน `wrangler.toml`
   `npx wrangler d1 create shop-db`
2. สร้าง R2 bucket ชื่อ `shop-images` แล้วผูกโดเมนสาธารณะ (เช่น `images.example.com`) กับ bucket นั้น และแก้ `PUBLIC_IMAGE_BASE` ใน `wrangler.toml`
3. ตั้งค่า `BANK_INFO` ใน `wrangler.toml` ให้เป็นบัญชีรับโอนจริง
4. ใช้ Cloudflare Access ป้องกันเส้นทาง `/admin/*` โดยกำหนดให้เฉพาะอีเมลของเจ้าของร้านเข้าได้
   - ปิดการเข้าผ่าน `*.workers.dev` หรือให้เข้าได้เฉพาะโดเมนที่มี Access ป้องกัน เพราะระบบเชื่อ header จาก Access
5. ตั้ง GitHub Secrets ใน repo:
   - `CLOUDFLARE_API_TOKEN` (สิทธิ์ Workers, D1 และ R2 เท่านั้น)
   - `CLOUDFLARE_ACCOUNT_ID`
6. ตั้ง environment ชื่อ `production` ใน GitHub และเปิด branch protection บน `main`

## Deploy

- เปิด PR เพื่อตรวจ typecheck อัตโนมัติ
- merge เข้า `main` แล้ว workflow จะรัน migration และ `wrangler deploy` ให้

## ข้อควรรู้

- ราคาและสต๊อกเป็นจำนวนเต็ม (บาท และชิ้น)
- เวลาส่วนลดใช้เวลาประเทศไทย
- ส่วนลดมีได้ 1 รายการต่อสินค้า เมื่อบันทึกสินค้าใหม่ ส่วนลดเดิมจะถูกแทนที่
- โดเมนที่อนุญาตสำหรับลิงก์ affiliate อยู่ใน `src/links.ts` ควรตรวจกับเอกสารของ Shopee และ TikTok ก่อนใช้งานจริง
- ระบบนี้ยังไม่มีระบบชำระเงินอัตโนมัติ ทีมงานยืนยันการโอนจากหลังบ้านด้วยปุ่ม "ชำระแล้ว"
- ยังไม่มีการจำกัดอัตราการส่งฟอร์มสั่งซื้อ ควรเพิ่ม Turnstile ก่อนเปิดใช้งานจริง

## รันบนเซิร์ฟเวอร์ของตัวเอง (ไม่ใช้ Cloudflare)

ต้องใช้ Node.js 22.13 ขึ้นไป (ข้อมูลเก็บในไฟล์ SQLite และโฟลเดอร์รูปในโฟลเดอร์ `DATA_DIR`)

```bash
npm ci
ADMIN_PASSWORD="ตั้งรหัสที่เดายาก" SITE_URL="https://shop.example.com" \
  BANK_INFO="ธนาคาร... เลขบัญชี... ชื่อบัญชี..." npm start
```

ตัวแปรที่ใช้ได้

- `ADMIN_PASSWORD` (บังคับ) รหัสหลังบ้าน ใช้ล็อกอินที่ `/admin` ด้วย Basic Auth (ชื่อผู้ใช้อะไรก็ได้)
- `SITE_URL` โดเมนของร้าน ใช้สร้างลิงก์และรูป
- `PORT` พอร์ต ค่าเริ่มต้น 3000
- `DATA_DIR` โฟลเดอร์เก็บฐานข้อมูลและรูป ค่าเริ่มต้น `./data`
- `BANK_INFO` ข้อมูลบัญชีที่แสดงให้ลูกค้าโอนเงิน
- `ADMIN_EMAIL` ชื่อที่ใช้บันทึกประวัติการแก้ไข ค่าเริ่มต้น `admin@local`

หมายเหตุ
- Basic Auth ส่งรหัสแบบไม่เข้ารหัสถ้าไม่ผ่าน HTTPS ให้วางระบบไว้หลัง reverse proxy ที่เปิด HTTPS เสมอ
- สร้างอิมเมจด้วย `docker build -t shop .` แล้วรันด้วย `docker run -p 3000:3000 -v shop-data:/data -e ADMIN_PASSWORD=... -e SITE_URL=... shop`
- ตัวตั้งเวลาคืนสต๊อกทำงานทุก 5 นาทีในโปรเซสเดียวกัน จึงต้องรันเพียง 1 ตัว
