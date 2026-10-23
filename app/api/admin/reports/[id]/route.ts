import { HttpError, handler, isUuid } from '@/server/auth';
import { query } from '@/server/db';

type Ctx = { params: Promise<{ id: string }> };

// PATCH { status: "resolved" | "dismissed" | "open" } → closes a report (or reopens it)
export const PATCH = handler<Ctx>(async (req, admin, ctx) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, 'Bad id');
    const { status } = await req.json();
    if (!['resolved', 'dismissed', 'open'].includes(status)) throw new HttpError(400, 'Bad status');
    const rows = await query(
        `update question_reports set status = $1,
                resolved_at = case when $1 = 'open' then null else now() end,
                resolved_by = case when $1 = 'open' then null else $2::uuid end
         where id = $3 returning id`, [status, admin.id, id]);
    if (!rows.length) throw new HttpError(404, 'Not found');
    return { ok: true };
}, { admin: true });
