import { HttpError, handler, isUuid } from '@/server/auth';
import { query } from '@/server/db';
import { hashPassword, tempPassword } from '@/server/passwords';

type Ctx = { params: Promise<{ id: string }> };

// Boolean columns an admin can set with { action, value }
const SWITCHES: Record<string, string> = { 'set-admin': 'is_admin', 'set-leaderboard': 'can_see_leaderboard' };

// PATCH { action }: "reset-password" sets a new temporary password (also how a GitHub-only user gets a password),
// "disable" and "enable" switch access, "set-admin" and "set-leaderboard" take { value: boolean }
export const PATCH = handler<Ctx>(async (req, admin, ctx) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, 'Bad id');
    const { action, value } = await req.json();

    if (action in SWITCHES) {
        if (typeof value !== 'boolean') throw new HttpError(400, 'Bad value');
        // An admin removing their own admin could leave nobody able to manage accounts
        if (action === 'set-admin' && id === admin.id && !value) throw new HttpError(400, "You can't remove your own admin");
        const rows = await query(`update app_users set ${SWITCHES[action]} = $1 where id = $2 returning id`, [value, id]);
        if (!rows.length) throw new HttpError(404, 'Not found');
        return { ok: true };
    }

    if (action === 'reset-password') {
        const password = tempPassword();
        const rows = await query<{ email: string }>(
            'update app_users set password_hash = $1, must_change_password = true where id = $2 returning email',
            [await hashPassword(password), id]);
        if (!rows.length) throw new HttpError(404, 'Not found');
        return { email: rows[0].email, tempPassword: password };
    }
    if (action === 'disable' || action === 'enable') {
        if (id === admin.id) throw new HttpError(400, "You can't disable your own account");
        const rows = await query('update app_users set disabled = $1 where id = $2 returning id', [action === 'disable', id]);
        if (!rows.length) throw new HttpError(404, 'Not found');
        return { ok: true };
    }
    throw new HttpError(400, 'Unknown action');
}, { admin: true });
