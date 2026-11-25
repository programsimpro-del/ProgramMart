import { Hono, type MiddlewareHandler } from 'hono';
import type { Env } from './types';
import { store } from './routes/store';
import { admin } from './routes/admin';
import { layout, errorBox } from './views';
import { releaseExpiredOrders } from './expiry';

const app = new Hono<{ Bindings: Env }>();

/**
 * ป้องกันหลังบ้าน:
 * 1) ต้องผ่าน Cloudflare Access (Access ส่ง header อีเมลผู้ใช้มาให้)
 * 2) POST ต้องมาจาก origin เดียวกันเท่านั้น (กัน CSRF เบื้องต้น)
 */
const adminGuard: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (c.env.ALLOW_DEV_ADMIN !== 'true' && !c.req.header('cf-access-authenticated-user-email')) {
    return c.text('เข้าหลังบ้านได้ผ่าน Cloudflare Access เท่านั้น', 401);
  }
  if (c.req.method === 'POST') {
    const origin = c.req.header('origin');
    if (origin && new URL(origin).host !== new URL(c.req.url).host) {
      return c.text('Forbidden', 403);
    }
  }
  await next();
};

app.use('/admin', adminGuard);
app.use('/admin/*', adminGuard);

app.route('/', store);
app.route('/admin', admin);

app.notFound((c) => c.html(layout('ไม่พบหน้า', errorBox('ไม่พบหน้าที่ต้องการ')), 404));

app.onError((err, c) => {
  console.error(err);
  return c.html(layout('ผิดพลาด', errorBox('เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่')), 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      releaseExpiredOrders(env.DB).then((n) => console.log(`คืนสต๊อกออเดอร์ที่หมดเวลา: ${n} รายการ`)),
    );
  },
} satisfies ExportedHandler<Env>;
