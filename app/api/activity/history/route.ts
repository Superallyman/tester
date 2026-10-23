import { HttpError, handler } from '@/server/auth';
import { query } from '@/server/db';

const SORTS: Record<string, string> = {
    newest: 'a.attempted_at desc',
    oldest: 'a.attempted_at asc',
    confidence: 'a.user_rating desc nulls last',
    satisfaction: 'a.satisfaction_rating desc nulls last',
};

// GET ?status=correct|incorrect&sat=1-4&category=…&sort=newest&offset=0&limit=20 → the user's attempts joined to their questions
export const GET = handler(async (req, user) => {
    const p = req.nextUrl.searchParams;
    const where = ['a.user_email = $1'];
    const args: unknown[] = [user.email];

    const status = p.get('status');
    if (status === 'correct' || status === 'incorrect') {
        args.push(status === 'correct');
        where.push(`a.is_correct = $${args.length}`);
    }
    const sat = p.get('sat');
    if (sat) {
        args.push(Number(sat));
        where.push(`a.satisfaction_rating = $${args.length}`);
    }
    const categories = p.getAll('category');
    if (categories.length) {
        args.push(categories);
        where.push(`q.category = any($${args.length})`);
    }

    const order = SORTS[p.get('sort') || 'newest'];
    const offset = Number(p.get('offset') || 0);
    const limit = Number(p.get('limit') || 20);
    if (!order || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new HttpError(400, 'Bad query');
    args.push(limit, offset);

    const rows = await query<Record<string, unknown>>(`
        select a.id, a.question_id, a.attempted_at, a.updated_at, a.is_correct, a.user_rating, a.satisfaction_rating, a.submitted_answer,
               q.question_text, q.options, q.correct_answers, q.explanation, q.category
        from user_activity a
        join questions q on q.id = a.question_id
        where ${where.join(' and ')}
        order by ${order}, a.id
        limit $${args.length - 1} offset $${args.length}`, args);

    // Same nesting the page used with Supabase's embedded select
    return rows.map(({ question_text, options, correct_answers, explanation, category, ...a }) => ({
        ...a,
        questions: { question_text, options, correct_answers, explanation, category },
    }));
});
