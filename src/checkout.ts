import type { ProductView } from './db';
import { s, int } from './util';

export type PaymentMethod = 'transfer' | 'cod';

export interface CheckoutInput {
  qty: number;
  name: string;
  phone: string;
  address: string;
  note: string;
  method: PaymentMethod;
}

/** อ่านค่าจากฟอร์มทั้งขั้นที่ 2 และขั้นที่ 3 (ขั้นที่ 3 ส่งค่าเดิมมาเป็น hidden field) */
export function parseCheckout(f: Record<string, unknown>): { input: CheckoutInput; error?: string } {
  const input: CheckoutInput = {
    qty: int(f.qty),
    name: s(f.customer_name),
    phone: s(f.phone),
    address: s(f.address),
    note: s(f.note),
    method: s(f.payment_method) === 'cod' ? 'cod' : 'transfer',
  };
  if (!(input.qty >= 1 && input.qty <= 50)) return { input, error: 'จำนวนต้องอยู่ระหว่าง 1 ถึง 50' };
  if (!input.name) return { input, error: 'กรุณากรอกชื่อผู้รับ' };
  if (!/^[0-9+\-\s]{9,15}$/.test(input.phone)) return { input, error: 'กรุณากรอกเบอร์โทรที่ถูกต้อง' };
  if (input.address.length < 10) return { input, error: 'กรุณากรอกที่อยู่จัดส่งให้ครบ' };
  return { input };
}

/**
 * แบ่งยอดตามวิธีชำระ
 * - โอนเต็มจำนวน: ชำระตอนนี้ = ค่าสินค้า + ค่าจัดส่ง
 * - เก็บเงินปลายทาง: ชำระตอนนี้เฉพาะค่าจัดส่ง ส่วนค่าสินค้าชำระตอนรับของ
 */
export function amountsFor(p: ProductView, input: CheckoutInput) {
  const subtotal = p.pricing.price * input.qty;
  const shipping = p.shipping_fee;
  if (input.method === 'cod') {
    return { subtotal, shipping, total: subtotal + shipping, dueNow: shipping, onDelivery: subtotal };
  }
  return { subtotal, shipping, total: subtotal + shipping, dueNow: subtotal + shipping, onDelivery: 0 };
}
