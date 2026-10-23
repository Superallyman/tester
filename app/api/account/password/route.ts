import { HttpError, handler } from '@/server/auth';
import { accountById } from '@/server/authOptions';
import { query } from '@/server/db';
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from '@/server/passwords';

// The signed-in user's sign-in methods, for the account page
export const GET = handler(async (_req, user) => {
    const account = (await accountById(user.id))!;
    return { email: account.email, name: account.name, hasPassword: !!account.password_hash, githubLogin: account.github_login };
});

// POST { currentPassword?, newPassword }. Someone who signed in with GitHub and has no password yet can set one
// without a current password, which is how a GitHub user moves to email + password.
export const POST = handler(async (req, user) => {
    const { currentPassword, newPassword } = await req.json();
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new HttpError(400, `Use at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const account = (await accountById(user.id))!;
    if (account.password_hash && !(typeof currentPassword === 'string' && await verifyPassword(currentPassword, account.password_hash))) {
        throw new HttpError(400, 'Current password is wrong');
    }
    await query('update app_users set password_hash = $1, must_change_password = false where id = $2', [await hashPassword(newPassword), user.id]);
    return { ok: true };
});
