import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/**
 * ตัวจำลอง D1 ด้วย SQLite ของ Node (node:sqlite) ให้ใช้ API แบบเดียวกับโค้ดหลัก
 * ใช้สำหรับรันบนเครื่องหรือเซิร์ฟเวอร์ที่ไม่ใช่ Cloudflare
 */
export function makeD1(db: DatabaseSync): D1Database {
  type Stmt = {
    sql: string;
    params: SQLInputValue[];
  };

  const runSync = (st: Stmt) => {
    const r = db.prepare(st.sql).run(...st.params);
    return {
      success: true,
      results: [],
      meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid), duration: 0 },
    };
  };

  const makeStmt = (sql: string, params: SQLInputValue[] = []) => {
    const st: Stmt = { sql, params };
    const api = {
      bind(...vals: SQLInputValue[]) {
        return makeStmt(sql, vals);
      },
      async run() {
        return runSync(st);
      },
      async all<T>() {
        const rows = db.prepare(sql).all(...params) as T[];
        return { success: true, results: rows, meta: { changes: 0, last_row_id: 0, duration: 0 } };
      },
      async first<T>() {
        return (db.prepare(sql).get(...params) ?? null) as T | null;
      },
      /** ให้ batch ใช้ได้ */
      _st: st,
    };
    return api;
  };

  const d1 = {
    prepare(sql: string) {
      return makeStmt(sql);
    },
    /** รันทุกคำสั่งในทรานแซกชันเดียว: สำเร็จทั้งหมดหรือไม่มีอะไรเปลี่ยนเลย */
    async batch(stmts: ReturnType<typeof makeStmt>[]) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => runSync(s._st));
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
    },
  };
  return d1 as unknown as D1Database;
}
