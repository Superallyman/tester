import { HttpError, handler } from '@/server/auth';
import { query } from '@/server/db';
import { isTimeZone } from '@/app/leaderboard/stats';

const WEEKS = 26;

/** YYYY-MM-DD of the day before, by calendar arithmetic */
const dayBefore = (key: string) => {
    const d = new Date(`${key}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
};

/** Consecutive days ending today, or yesterday when today hasn't started yet */
const runEndingToday = (days: Set<string>, today: string) => {
    let cursor = days.has(today) ? today : dayBefore(today);
    let n = 0;
    while (days.has(cursor)) { n++; cursor = dayBefore(cursor); }
    return n;
};

// GET ?tz=America/Toronto → answers per day for the last 26 weeks (in the viewer's time zone), today's count,
// the daily goal, and two streaks: days with any practice, and days that met the goal
export const GET = handler(async (req, user) => {
    const tz = req.nextUrl.searchParams.get('tz') || 'UTC';
    if (!isTimeZone(tz)) throw new HttpError(400, 'Unknown time zone');
    const [days, [{ today }], [account]] = await Promise.all([
        // Blank submissions are skips, not practice
        query<{ day: string; answered: number; correct: number }>(`
            select to_char(attempted_at at time zone $2, 'YYYY-MM-DD') as day,
                   count(*)::int as answered, count(*) filter (where is_correct)::int as correct
            from user_activity
            where user_email = $1 and cardinality(submitted_answer) > 0
            group by 1 order by 1`, [user.email, tz]),
        query<{ today: string }>(`select to_char(now() at time zone $1, 'YYYY-MM-DD') as today`, [tz]),
        query<{ daily_goal: number | null }>('select daily_goal from app_users where id = $1', [user.id]),
    ]);
    const goal = account?.daily_goal ?? null;
    const active = new Set(days.map(d => d.day));
    const metGoal = new Set(goal ? days.filter(d => d.answered >= goal).map(d => d.day) : []);

    let since = today;
    for (let i = 0; i < WEEKS * 7 - 1; i++) since = dayBefore(since);
    return {
        today,
        goal,
        todayCount: days.find(d => d.day === today)?.answered ?? 0,
        streak: runEndingToday(active, today),
        goalStreak: goal ? runEndingToday(metGoal, today) : 0,
        days: days.filter(d => d.day >= since),
    };
});

// PUT { goal: number | null } → sets or clears the daily goal
export const PUT = handler(async (req, user) => {
    const { goal } = await req.json();
    if (goal !== null && !(Number.isInteger(goal) && goal >= 1 && goal <= 500)) throw new HttpError(400, 'Pick a goal between 1 and 500 questions');
    await query('update app_users set daily_goal = $1 where id = $2', [goal, user.id]);
    return { ok: true };
});
