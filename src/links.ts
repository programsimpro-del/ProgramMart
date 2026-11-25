export type Channel = 'shopee' | 'tiktok';

export const CHANNELS: Channel[] = ['shopee', 'tiktok'];

/**
 * โดเมนที่อนุญาตให้ใส่เป็นลิงก์ affiliate
 * ควรตรวจกับเอกสาร affiliate ปัจจุบันของ Shopee และ TikTok ก่อนใช้งานจริง
 */
const ALLOWED_HOSTS: Record<Channel, string[]> = {
  shopee: ['shopee.co.th', 's.shopee.co.th', 'shope.ee'],
  tiktok: ['tiktok.com', 'vt.tiktok.com', 'shop.tiktok.com'],
};

export function isAllowedAffiliate(channel: Channel, raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return ALLOWED_HOSTS[channel].some(
    (host) => url.hostname === host || url.hostname.endsWith('.' + host),
  );
}
