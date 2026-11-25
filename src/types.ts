export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  PUBLIC_IMAGE_BASE: string;
  /** โดเมนหน้าร้าน เช่น https://shop.example.com ใช้สร้างลิงก์สินค้าและ og:url */
  PUBLIC_SITE_URL: string;
  BANK_INFO: string;
  /** คีย์สาธารณะของ Turnstile (ใส่ใน wrangler.toml ได้) */
  TURNSTILE_SITE_KEY?: string;
  /** คีย์ลับของ Turnstile ตั้งด้วย `wrangler secret put TURNSTILE_SECRET` */
  TURNSTILE_SECRET?: string;
  /** ตั้งเป็น "true" เฉพาะตอนพัฒนาบนเครื่องเท่านั้น ห้ามตั้งบน production */
  ALLOW_DEV_ADMIN?: string;
}
