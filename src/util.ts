/** อ่านค่าจากฟอร์มเป็นสตริงที่ตัดช่องว่างแล้ว */
export function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** อ่านค่าจากฟอร์มเป็นจำนวนเต็ม ถ้าไม่ใช่เลขจำนวนเต็มจะได้ NaN */
export function int(v: unknown): number {
  const t = s(v);
  return /^-?\d+$/.test(t) ? parseInt(t, 10) : NaN;
}

export function esc(v: unknown): string {
  return String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export function baht(n: number): string {
  return '฿' + n.toLocaleString('th-TH');
}
