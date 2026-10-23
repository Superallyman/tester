import { HttpError, handler } from '@/server/auth';
import { query } from '@/server/db';
import { hashPassword, tempPassword } from '@/server/passwords';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Every account with its sign-in methods and history size, plus emails that have history but no account
export const GET = handler(async () => {
    const [users, orphans] = await Promise.all([
        query(`
            select u.id, u.email, u.name, u.github_login, u.password_hash is not null as has_password,
                   u.is_admin, u.disabled, u.must_change_password, u.created_at, u.last_login_at,
                   (select count(*)::int from user_activity a where lower(trim(a.user_email)) = u.email) as attempts
            from app_users u
            order by u.last_login_at desc nulls last, u.created_at`),
        query(`
            select lower(trim(user_email)) as email, count(*)::int as attempts
            from user_activity
            where user_email like '%_@_%' and lower(trim(user_email)) not in (select email from app_users)
            group by 1 order by 2 desc`),
    ]);
    return { users, orphans };
}, { admin: true });

// POST { email, name } creates an account with a temporary password, returned once to show the admin
export const POST = handler(async req => {
    const body = await req.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const name = String(body.name ?? '').trim() || email.split('@')[0];
    if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email');
    const password = tempPassword();
    const rows = await query(
        `insert into app_users (email, name, password_hash, must_change_password) values ($1, $2, $3, true)
         on conflict (email) do nothing returning id`,
        [email, name, await hashPassword(password)]);
    if (!rows.length) throw new HttpError(409, 'That email already has an account');
    return { email, tempPassword: password };
}, { admin: true });
