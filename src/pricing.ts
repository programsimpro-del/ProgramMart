export interface DiscountRow {
  kind: 'percent' | 'fixed';
  value: number;
  starts_at: string | null;
  ends_at: string | null;
  active: number;
}

/** เวลาปัจจุบันเป็นเวลาไทย รูปแบบ YYYY-MM-DDTHH:MM ให้เทียบกับค่าจาก datetime-local ได้ตรง */
export function nowBangkok(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16);
}

export function isDiscountActive(d: DiscountRow, now: string): boolean {
  if (!d.active) return false;
  if (d.starts_at && now < d.starts_at) return false;
  if (d.ends_at && now > d.ends_at) return false;
  return true;
}

/** คำนวณราคาขายจริงฝั่งเซิร์ฟเวอร์ ใช้ส่วนลดที่ทำให้ราคาต่ำที่สุดและยัง active อยู่ */
export function priceFor(base: number, discounts: DiscountRow[], now: string = nowBangkok()) {
  let price = base;
  for (const d of discounts) {
    if (!isDiscountActive(d, now)) continue;
    const p =
      d.kind === 'percent'
        ? Math.floor((base * (100 - d.value)) / 100)
        : Math.max(0, base - d.value);
    if (p < price) price = p;
  }
  const discounted = price < base;
  return {
    original: base,
    price,
    discounted,
    percentOff: discounted && base > 0 ? Math.round((1 - price / base) * 100) : 0,
  };
}
