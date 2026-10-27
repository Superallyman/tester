import { HttpError, handler } from '@/server/auth';
import { query } from '@/server/db';
import { Difficulty, difficultySql } from '@/utils/difficulty';

const SORTS: Record<string, string> = {
    newest: 'a.attempted_at desc',
    oldest: 'a.attempted_at asc',
    confidence: 'a.user_rating desc nulls last',
    satisfaction: 'a.satisfaction_rating desc nulls last',
};

// GET → the user's attempts joined to their questions, newest first by default. Filters (all optional):
//   status=correct|incorrect|skipped   sat=1-4   confidence=1-4   category=…(repeatable)
//   mastery=mastered|unmastered        (the question was / was never answered right, in any attempt)
//   saved=bookmarked|notes             difficulty=easy|medium|hard (everyone's first tries)
//   days=7|30|90                       q=text in the question, options or explanation
//   latest=1                           only each question's most recent attempt
// Paging: sort=newest|oldest|confidence|satisfaction, offset, limit. With count=1 it returns { total } instead.
export const GET = handler(async (req, user) => {
    const p = req.nextUrl.searchParams;
    const where = ['a.user_email = $1'];
    const args: unknown[] = [user.email];
    const arg = (v: unknown) => { args.push(v); return `$${args.length}`; };

    const status = p.get('status');
    if (status === 'correct') where.push('a.is_correct');
    else if (status === 'incorrect') where.push('not a.is_correct and cardinality(a.submitted_answer) > 0');
    else if (status === 'skipped') where.push('cardinality(a.submitted_answer) = 0');
    const rating = (name: string, column: string) => {
        const v = p.get(name);
        if (!v) return;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 4) throw new HttpError(400, `Bad ${name}`);
        where.push(`${column} = ${arg(n)}`);
    };
    rating('sat', 'a.satisfaction_rating');
    rating('confidence', 'a.user_rating');
    const categories = p.getAll('category');
    if (categories.length) where.push(`q.category = any(${arg(categories)})`);

    const mastery = p.get('mastery');
    const everRight = `exists (select 1 from user_activity b where b.user_email = a.user_email and b.question_id = a.question_id and b.is_correct)`;
    if (mastery === 'mastered') where.push(everRight);
    else if (mastery === 'unmastered') where.push(`not ${everRight}`);

    const saved = p.get('saved');
    if (saved === 'bookmarked' || saved === 'notes') {
        where.push(`exists (select 1 from question_notes n where n.user_id = ${arg(user.id)} and n.question_id = a.question_id and ${saved === 'bookmarked' ? 'n.bookmarked' : "n.note <> ''"})`);
    }
    const difficulty = p.get('difficulty');
    if (difficulty) {
        if (!(difficulty in difficultySql)) throw new HttpError(400, 'Bad difficulty');
        where.push(difficultySql[difficulty as Difficulty]);
    }
    const days = p.get('days');
    if (days) {
        if (!['7', '30', '90'].includes(days)) throw new HttpError(400, 'Bad period');
        where.push(`a.attempted_at > now() - make_interval(days => ${arg(Number(days))})`);
    }
    const text = p.get('q')?.trim();
    if (text) {
        const like = arg(`%${text}%`);
        where.push(`(q.question_text ilike ${like} or q.explanation ilike ${like} or q.options::text ilike ${like})`);
    }
    if (p.get('latest') === '1') {
        where.push(`a.id = (select l.id from user_activity l where l.user_email = a.user_email and l.question_id = a.question_id
                            order by l.attempted_at desc, l.id desc limit 1)`);
    }

    const from = `
        from user_activity a
        join questions q on q.id = a.question_id
        left join question_difficulty d on d.question_id = a.question_id
        where ${where.join(' and ')}`;

    if (p.get('count') === '1') {
        const [{ total }] = await query<{ total: number }>(`select count(*)::int as total ${from}`, args);
        return { total };
    }

    const order = SORTS[p.get('sort') || 'newest'];
    const offset = Number(p.get('offset') || 0);
    const limit = Number(p.get('limit') || 20);
    if (!order || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new HttpError(400, 'Bad query');

    const rows = await query<Record<string, unknown>>(`
        select a.id, a.question_id, a.attempted_at, a.updated_at, a.is_correct, a.user_rating, a.satisfaction_rating, a.submitted_answer,
               q.question_text, q.options, q.correct_answers, q.explanation, q.category
        ${from}
        order by ${order}, a.id
        limit ${arg(limit)} offset ${arg(offset)}`, args);

    // Same nesting the page used with Supabase's embedded select
    return rows.map(({ question_text, options, correct_answers, explanation, category, ...a }) => ({
        ...a,
        questions: { question_text, options, correct_answers, explanation, category },
    }));
});
