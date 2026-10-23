import { HttpError, handler } from '@/server/auth';
import { query } from '@/server/db';
import { ActivityRow, UserStats, Window, buildStats, isTimeZone } from '@/app/leaderboard/stats';

const nameOf = (email: string) => email.split('@')[0];
const WINDOWS: Window[] = ['all', '30', '7'];

// GET ?tz=America/Toronto → per-person totals for each time window. Attempts never leave the server; streak days
// are counted in the viewer's time zone.
export const GET = handler(async (req, user) => {
    if (!user.canSeeLeaderboard) throw new HttpError(403, "The leaderboard isn't turned on for your account.");
    const tz = req.nextUrl.searchParams.get('tz') || 'UTC';
    if (!isTimeZone(tz)) throw new HttpError(400, 'Unknown time zone');

    const [rows, [{ total }], accounts] = await Promise.all([
        query<{ question_id: string; is_correct: boolean; attempted_at: Date; user_email: string | null; answered: boolean; category: string | null }>(`
            select a.question_id, a.is_correct, a.attempted_at, a.user_email,
                   coalesce(cardinality(a.submitted_answer), 0) > 0 as answered, q.category
            from user_activity a
            left join questions q on q.id = a.question_id
            order by a.attempted_at, a.id`),
        query<{ total: number }>('select count(*)::int as total from questions'),
        query<{ email: string; name: string }>('select email, name from app_users'),
    ]);

    const activity: ActivityRow[] = rows.map(({ user_email, attempted_at, ...r }) => ({
        ...r,
        attempted_at: attempted_at.toISOString(),
        user: user_email ? nameOf(user_email.trim().toLowerCase()) : null,
    }));
    // Show account names where there is an account; the key stays the email's name part
    const names = new Map(accounts.map(a => [nameOf(a.email), a.name]));
    const named = (stats: UserStats[]) => stats.filter(u => u.attempts > 0).map(u => ({ ...u, name: names.get(u.key) ?? u.name }));

    return {
        me: nameOf(user.email.toLowerCase()),
        bankSize: total,
        windows: Object.fromEntries(WINDOWS.map(w => [w, named(buildStats(activity, w, total, tz))])) as Record<Window, UserStats[]>,
    };
});
