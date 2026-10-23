import { HttpError, handler } from '@/server/auth';
import { query } from '@/server/db';

const nameOf = (email: string) => email.split('@')[0];

// Everyone's attempts, minimal columns: emails are reduced to their name part and no answers are sent
export const GET = handler(async (_req, user) => {
    if (!user.canSeeLeaderboard) throw new HttpError(403, "The leaderboard isn't turned on for your account.");
    const [rows, [{ total }]] = await Promise.all([
        query<{ question_id: string; is_correct: boolean; attempted_at: string; user_email: string | null; answered: boolean; category: string | null }>(`
            select a.question_id, a.is_correct, a.attempted_at, a.user_email,
                   coalesce(cardinality(a.submitted_answer), 0) > 0 as answered, q.category
            from user_activity a
            left join questions q on q.id = a.question_id
            order by a.attempted_at, a.id`),
        query<{ total: number }>('select count(*)::int as total from questions'),
    ]);
    return {
        me: nameOf(user.email.toLowerCase()),
        bankSize: total,
        rows: rows.map(({ user_email, ...r }) => ({ ...r, user: user_email ? nameOf(user_email.trim().toLowerCase()) : null })),
    };
});
