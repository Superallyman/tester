// Validation for questions written in the admin editor

import { HttpError } from './auth';

export interface QuestionInput {
    category: string;
    question_text: string;
    options: string[];
    correct_answers: string[];
    explanation: string;
}

export const QUESTION_FIELDS = 'category, question_text, options, correct_answers, explanation';

const text = (v: unknown, field: string, max: number, required = true) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (required && !s) throw new HttpError(400, `${field} is required`);
    if (s.length > max) throw new HttpError(400, `${field} is too long`);
    return s;
};

/** Trims everything, drops blank options, and checks the answer key against the options. */
export function checkQuestion(body: Record<string, unknown>): QuestionInput {
    const options = Array.isArray(body.options) ? body.options.map(o => text(o, 'Option', 1000, false)).filter(Boolean) : [];
    if (options.length < 2) throw new HttpError(400, 'Give at least two options');
    if (options.length > 16) throw new HttpError(400, 'Too many options');
    if (new Set(options).size !== options.length) throw new HttpError(400, 'Two options are identical');
    const correct = Array.isArray(body.correct_answers) ? body.correct_answers.map(o => text(o, 'Answer', 1000, false)).filter(Boolean) : [];
    if (!correct.length) throw new HttpError(400, 'Mark at least one correct option');
    if (!correct.every(c => options.includes(c))) throw new HttpError(400, 'Every correct answer must be one of the options');
    return {
        category: text(body.category, 'Category', 200),
        question_text: text(body.question_text, 'Question', 5000),
        options,
        correct_answers: [...new Set(correct)],
        explanation: text(body.explanation, 'Explanation', 10000, false),
    };
}
