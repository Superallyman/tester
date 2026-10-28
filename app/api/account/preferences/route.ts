import { HttpError, handler } from '@/server/auth';
import { query } from '@/server/db';

// GET → this account's display preferences
export const GET = handler(async (_req, user) => {
    const [row] = await query<{ simple_reveal: boolean }>('select simple_reveal from app_users where id = $1', [user.id]);
    return { simpleReveal: !!row?.simple_reveal };
});

// PUT { simpleReveal: boolean }
export const PUT = handler(async (req, user) => {
    const { simpleReveal } = await req.json();
    if (typeof simpleReveal !== 'boolean') throw new HttpError(400, 'simpleReveal must be true or false');
    await query('update app_users set simple_reveal = $1 where id = $2', [simpleReveal, user.id]);
    return { simpleReveal };
});
