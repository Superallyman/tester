// Spaced repetition in the SM-2 family (the scheme behind Anki), with day-sized steps.
// A wrong answer brings the question back tomorrow; a right one pushes it further out, more so when the
// answer was given with high confidence.

import type { PoolClient } from 'pg';
import { pool } from './db';

export interface Card {
    interval_days: number;
    ease: number;
    reps: number;
    lapses: number;
    last_reviewed_at: Date;
    due_at: Date;
}

export type Grade = 'again' | 'hard' | 'good' | 'easy';

const DAY = 86400000;
const MAX_INTERVAL = 365;
const START_EASE = 2.5;
const MIN_EASE = 1.3;

/** Wrong → again. Right: confidence 1-2 → hard (likely a guess), 3 or unrated → good, 4 → easy. */
export const gradeOf = (correct: boolean, confidence: number | null): Grade =>
    !correct ? 'again' : confidence === null ? 'good' : confidence <= 2 ? 'hard' : confidence === 3 ? 'good' : 'easy';

export function nextCard(prev: Card | null, grade: Grade, at: Date): Card {
    let { interval_days: interval, ease, reps, lapses } = prev ?? { interval_days: 0, ease: START_EASE, reps: 0, lapses: 0 };
    if (grade === 'again') {
        if (reps > 0) lapses++;
        reps = 0;
        ease = Math.max(MIN_EASE, ease - 0.2);
        interval = 1;
    } else {
        reps++;
        if (grade === 'hard') {
            ease = Math.max(MIN_EASE, ease - 0.15);
            interval = reps === 1 ? 1 : Math.max(interval + 1, interval * 1.2);
        } else if (grade === 'good') {
            interval = reps === 1 ? 1 : reps === 2 ? 3 : interval * ease;
        } else {
            ease += 0.15;
            interval = reps === 1 ? 4 : Math.max(interval + 1, interval * ease * 1.3);
        }
    }
    interval = Math.min(MAX_INTERVAL, Math.round(interval * 10) / 10);
    return { interval_days: interval, ease: Math.round(ease * 100) / 100, reps, lapses, last_reviewed_at: at, due_at: new Date(at.getTime() + interval * DAY) };
}

export interface Answer { question_id: string; is_correct: boolean; user_rating: number | null; attempted_at: Date }

const upsert = async (client: PoolClient, userId: string, cards: Map<string, Card>) => {
    if (!cards.size) return;
    const ids = [...cards.keys()], c = [...cards.values()];
    await client.query(`
        insert into review_schedule (user_id, question_id, interval_days, ease, reps, lapses, last_reviewed_at, due_at)
        select $1, * from unnest($2::uuid[], $3::real[], $4::real[], $5::int[], $6::int[], $7::timestamptz[], $8::timestamptz[])
        on conflict (user_id, question_id) do update set interval_days = excluded.interval_days, ease = excluded.ease,
            reps = excluded.reps, lapses = excluded.lapses, last_reviewed_at = excluded.last_reviewed_at, due_at = excluded.due_at`,
        [userId, ids, c.map(x => x.interval_days), c.map(x => x.ease), c.map(x => x.reps), c.map(x => x.lapses),
         c.map(x => x.last_reviewed_at), c.map(x => x.due_at)]);
};

/** Builds a person's schedule from their whole history, once. Blank submissions (skips) don't count. */
export async function ensureSchedule(user: { id: string; email: string }) {
    const client = await pool.connect();
    try {
        await client.query('begin');
        const { rows: [acct] } = await client.query<{ review_schedule_built: boolean }>(
            'select review_schedule_built from app_users where id = $1 for update', [user.id]);
        if (!acct || acct.review_schedule_built) { await client.query('commit'); return; }
        const { rows } = await client.query<Answer>(`
            select question_id, is_correct, user_rating, attempted_at from user_activity
            where user_email = $1 and cardinality(submitted_answer) > 0 and question_id is not null
            order by attempted_at, id`, [user.email]);
        const cards = new Map<string, Card>();
        for (const r of rows) cards.set(r.question_id, nextCard(cards.get(r.question_id) ?? null, gradeOf(r.is_correct, r.user_rating), r.attempted_at));
        await client.query('delete from review_schedule where user_id = $1', [user.id]);
        await upsert(client, user.id, cards);
        await client.query('update app_users set review_schedule_built = true where id = $1', [user.id]);
        await client.query('commit');
    } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

/** Moves the schedule on for answers just saved. */
export async function recordAnswers(user: { id: string; email: string }, answers: Answer[]) {
    const answered = answers.filter(a => a.question_id);
    if (!answered.length) return;
    await ensureSchedule(user); // a first build already includes these answers
    const client = await pool.connect();
    try {
        await client.query('begin');
        const { rows } = await client.query<Card & { question_id: string }>(
            `select question_id, interval_days, ease, reps, lapses, last_reviewed_at, due_at from review_schedule
             where user_id = $1 and question_id = any($2::uuid[]) for update`, [user.id, answered.map(a => a.question_id)]);
        const cards = new Map(rows.map(({ question_id, ...c }) => [question_id, c as Card]));
        const changed = new Map<string, Card>();
        for (const a of answered) {
            const prev = cards.get(a.question_id) ?? null;
            // Already counted by a build that ran just now
            if (prev && prev.last_reviewed_at.getTime() >= a.attempted_at.getTime()) continue;
            const next = nextCard(prev, gradeOf(a.is_correct, a.user_rating), a.attempted_at);
            cards.set(a.question_id, next);
            changed.set(a.question_id, next);
        }
        await upsert(client, user.id, changed);
        await client.query('commit');
    } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}
