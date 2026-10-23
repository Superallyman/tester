// Shared checks for the practice exam routes. The browser builds and scores exams; the server stores them per account.

import { HttpError } from './auth';

export const MAX_ITEMS = 400;

/** What the server needs from an ExamState; the rest is stored as-is. */
export interface StateLike {
    id: string;
    config: { label: string };
    questionIds: string[];
    elapsedSec: number;
    savedAt?: string;
}

/** What the server needs from an ExamSummary. */
export interface SummaryLike {
    id: string;
    label: string;
    total: number;
    answered: number;
    correct: number;
    elapsedSec: number;
    finishedAt: string;
}

const isText = (v: unknown, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;
const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;

export function checkState(v: unknown): StateLike {
    const s = v as StateLike;
    if (!s || !isText(s.id) || !isText(s.config?.label) || !Array.isArray(s.questionIds)
        || s.questionIds.length > MAX_ITEMS || !isCount(s.elapsedSec)) throw new HttpError(400, 'Bad exam state');
    return s;
}

export function checkSummary(v: unknown): SummaryLike {
    const s = v as SummaryLike;
    if (!s || !isText(s.id) || !isText(s.label) || ![s.total, s.answered, s.correct, s.elapsedSec].every(isCount)
        || s.total > MAX_ITEMS || Number.isNaN(Date.parse(s.finishedAt))) throw new HttpError(400, 'Bad exam summary');
    return s;
}

export function checkQuestions(v: unknown, count: number) {
    if (!Array.isArray(v) || v.length !== count) throw new HttpError(400, 'Bad exam questions');
    return v;
}
