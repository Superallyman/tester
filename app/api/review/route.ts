import { HttpError, handler } from '@/server/auth';
import { query } from '@/server/db';
import { ensureSchedule } from '@/server/schedule';
import { isTimeZone } from '@/app/leaderboard/stats';

const MAX_IDS = 500;

// GET ?tz=America/Toronto → questions due for review (most overdue first; due means before the end of the viewer's
// day) and how many fall due on each of the next 7 days
export const GET = handler(async (req, user) => {
    const tz = req.nextUrl.searchParams.get('tz') || 'UTC';
    if (!isTimeZone(tz)) throw new HttpError(400, 'Unknown time zone');
    await ensureSchedule(user);
    // End of the viewer's today, as a timestamp
    const endOfToday = `(date_trunc('day', now() at time zone $2) + interval '1 day') at time zone $2`;
    const [due, [{ dueCount, scheduled }], upcoming] = await Promise.all([
        query<{ question_id: string }>(`
            select s.question_id from review_schedule s join questions q on q.id = s.question_id
            where s.user_id = $1 and s.due_at < ${endOfToday} order by s.due_at limit ${MAX_IDS}`, [user.id, tz]),
        query<{ dueCount: number; scheduled: number }>(`
            select count(*) filter (where due_at < ${endOfToday})::int as "dueCount", count(*)::int as scheduled
            from review_schedule where user_id = $1`, [user.id, tz]),
        query<{ day: string; n: number }>(`
            select to_char(due_at at time zone $2, 'YYYY-MM-DD') as day, count(*)::int as n from review_schedule
            where user_id = $1 and due_at >= ${endOfToday} and due_at < ${endOfToday} + interval '7 days'
            group by 1 order by 1`, [user.id, tz]),
    ]);
    return { dueIds: due.map(d => d.question_id), dueCount, scheduled, upcoming };
});
