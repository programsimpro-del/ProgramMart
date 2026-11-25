import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';

/**
 * ตัวจำลอง R2 ด้วยโฟลเดอร์บนเครื่อง: ไฟล์เก็บที่ <dir>/<key> และชนิดไฟล์เก็บไว้ที่ <key>.meta.json
 */
export function makeR2(dir: string): R2Bucket {
  const root = path.resolve(dir);
  const safe = (key: string) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error('invalid key');
    return p;
  };

  const r2 = {
    async put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
      const p = safe(key);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, Buffer.from(value));
      await writeFile(p + '.meta.json', JSON.stringify({ contentType: opts?.httpMetadata?.contentType ?? '' }));
    },
    async get(key: string) {
      const p = safe(key);
      try {
        await stat(p);
      } catch {
        return null;
      }
      let contentType = 'application/octet-stream';
      try {
        contentType = JSON.parse(await readFile(p + '.meta.json', 'utf8')).contentType || contentType;
      } catch {
        /* ไม่มีไฟล์ meta ใช้ค่าเริ่มต้น */
      }
      return {
        body: Readable.toWeb(createReadStream(p)),
        httpMetadata: { contentType },
      };
    },
    async delete(key: string) {
      const p = safe(key);
      await rm(p, { force: true });
      await rm(p + '.meta.json', { force: true });
    },
  };
  return r2 as unknown as R2Bucket;
}
