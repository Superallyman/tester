import { handler } from '@/server/auth';
import { query } from '@/server/db';

// GET → how many reports are waiting, for the admin tab badge
export const GET = handler(async () => {
    const [{ open }] = await query<{ open: number }>(`select count(*)::int as open from question_reports where status = 'open'`);
    return { open };
}, { admin: true });
