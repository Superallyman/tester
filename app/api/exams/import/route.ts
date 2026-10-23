import { HttpError, handler } from '@/server/auth';
import { query } from '@/server/db';
import { checkQuestions, checkSummary } from '@/server/exams';

// POST { summaries, last? } → copies the exam history a browser kept locally (before exams were saved on the server).
// `last` is the one result the browser kept in full, with its questions. Exams already on the server are skipped.
export const POST = handler(async (req, user) => {
    const body = await req.json();
    if (!Array.isArray(body.summaries) || body.summaries.length > 100) throw new HttpError(400, 'Bad summaries');
    const full = body.last ? { summary: checkSummary(body.last.summary), questions: body.last.questions } : null;
    if (full) checkQuestions(full.questions, full.summary.total);

    let imported = 0;
    for (const raw of body.summaries) {
        const s = checkSummary(raw);
        const detail = full?.summary.id === s.id ? full : null;
        const rows = await query(
            `insert into exam_attempts (user_id, client_id, label, status, questions, summary, total, answered, correct,
                                        elapsed_sec, started_at, finished_at)
             values ($1, $2, $3, 'finished', $4, $5, $6, $7, $8, $9::int, $10::timestamptz - make_interval(secs => $9::int), $10)
             on conflict (user_id, client_id) do nothing returning id`,
            [user.id, s.id, s.label, detail ? JSON.stringify(detail.questions) : null, JSON.stringify(detail?.summary ?? s),
             s.total, s.answered, s.correct, s.elapsedSec, s.finishedAt]);
        imported += rows.length;
    }
    return { imported };
});
