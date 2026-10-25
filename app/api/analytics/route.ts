import { HttpError, handler } from '@/server/auth';
import { query } from '@/server/db';
import { BLUEPRINT, SCORED_ITEMS, blueprintKey } from '@/app/exam/blueprint';
import { ROW_LABELS, isTimeZone } from '@/app/leaderboard/stats';

const WEEKS = 26;
const RECENT_DAYS = 90;     // readiness uses recent accuracy, which reflects current ability better than all-time
const MIN_FOR_AREA = 10;    // answers needed before an area counts towards readiness

const areaOf = (category: string | null) => blueprintKey(category?.trim().replace(/\s+/g, ' ') || 'General') ?? 'other';

export interface AreaStats {
    key: string;
    label: string;
    weight: number;         // items out of SCORED_ITEMS on the real exam (0 for "other")
    answered: number;
    correct: number;
    recentAnswered: number;
    recentCorrect: number;
    seen: number;           // distinct questions answered
    mastered: number;       // distinct questions answered right at least once
    bank: number;           // questions in the bank for this area
}

// GET ?tz= → the signed-in user's accuracy per week (26 weeks), per NBEO content area, and an exam-weighted
// readiness estimate. Skips (no answer picked) are left out everywhere.
export const GET = handler(async (req, user) => {
    const tz = req.nextUrl.searchParams.get('tz') || 'UTC';
    if (!isTimeZone(tz)) throw new HttpError(400, 'Unknown time zone');

    const [rows, bank, weeks] = await Promise.all([
        query<{ question_id: string; is_correct: boolean; recent: boolean; category: string | null }>(`
            select a.question_id, a.is_correct, a.attempted_at > now() - interval '${RECENT_DAYS} days' as recent, q.category
            from user_activity a join questions q on q.id = a.question_id
            where a.user_email = $1 and cardinality(a.submitted_answer) > 0`, [user.email]),
        query<{ category: string | null; n: number }>('select category, count(*)::int as n from questions group by category'),
        query<{ week: string; answered: number; correct: number }>(`
            select to_char(date_trunc('week', attempted_at at time zone $2), 'YYYY-MM-DD') as week,
                   count(*)::int as answered, count(*) filter (where is_correct)::int as correct
            from user_activity
            where user_email = $1 and cardinality(submitted_answer) > 0
              and attempted_at at time zone $2 >= date_trunc('week', now() at time zone $2) - interval '${WEEKS - 1} weeks'
            group by 1 order by 1`, [user.email, tz]),
    ]);

    const areas = new Map<string, AreaStats & { seenIds: Set<string>; masteredIds: Set<string> }>();
    const area = (key: string) => {
        let a = areas.get(key);
        if (!a) {
            a = { key, label: ROW_LABELS[key] ?? key, weight: BLUEPRINT.find(r => r.key === key)?.weight ?? 0,
                  answered: 0, correct: 0, recentAnswered: 0, recentCorrect: 0, seen: 0, mastered: 0, bank: 0,
                  seenIds: new Set(), masteredIds: new Set() };
            areas.set(key, a);
        }
        return a;
    };
    BLUEPRINT.forEach(r => area(r.key));
    bank.forEach(b => { area(areaOf(b.category)).bank += b.n; });
    rows.forEach(r => {
        const a = area(areaOf(r.category));
        a.answered++;
        a.seenIds.add(r.question_id);
        if (r.is_correct) { a.correct++; a.masteredIds.add(r.question_id); }
        if (r.recent) { a.recentAnswered++; if (r.is_correct) a.recentCorrect++; }
    });

    const list: AreaStats[] = [...areas.values()]
        .filter(a => a.weight > 0 || a.answered > 0)
        .map(({ seenIds, masteredIds, ...a }) => ({ ...a, seen: seenIds.size, mastered: masteredIds.size }));

    // Readiness: each area's recent accuracy (all-time if it has too few recent answers), weighted by its share of
    // the real exam, over the areas with enough answers to judge
    let weighted = 0, coveredWeight = 0;
    for (const a of list) {
        if (!a.weight) continue;
        const [n, c] = a.recentAnswered >= MIN_FOR_AREA ? [a.recentAnswered, a.recentCorrect] : [a.answered, a.correct];
        if (n < MIN_FOR_AREA) continue;
        weighted += a.weight * (c / n);
        coveredWeight += a.weight;
    }

    return {
        weeks,
        areas: list,
        readiness: {
            pct: coveredWeight ? (weighted / coveredWeight) * 100 : null,
            coveredWeight,
            scoredItems: SCORED_ITEMS,
            minPerArea: MIN_FOR_AREA,
            recentDays: RECENT_DAYS,
        },
    };
});
