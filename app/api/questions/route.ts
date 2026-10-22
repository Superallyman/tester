import { HttpError, handler, isUuid } from '@/server/auth';
import { query } from '@/server/db';

// GET ?search=phrase      → ids of questions containing the phrase
// GET ?category=A&category=B → id + category for those categories (no params: the whole bank)
export const GET = handler(async req => {
    const params = req.nextUrl.searchParams;
    const search = params.get('search');
    if (search !== null) {
        if (!search.trim()) throw new HttpError(400, 'Empty search');
        return query<{ id: string }>('select id from search_questions_by_phrase($1) order by id', [search]);
    }
    const categories = params.getAll('category');
    return categories.length
        ? query<{ id: string; category: string }>('select id, category from questions where category = any($1) order by id', [categories])
        : query<{ id: string; category: string }>('select id, category from questions order by id');
});

// POST { ids } → full question rows (POST because hundreds of UUIDs don't fit in a URL)
export const POST = handler(async req => {
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length > 1000 || !ids.every(isUuid)) throw new HttpError(400, 'Bad ids');
    return query('select id, category, question_text, options, correct_answers, explanation from questions where id = any($1::uuid[])', [ids]);
});
