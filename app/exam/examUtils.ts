// examUtils.ts — types, persistence and scoring for the NBEO-style practice exam

export interface ExamQuestion {
    id: string;
    question_text: string;
    options: string[];
    correct_answers: string[];
    explanation: string;
    category: string;
}

export interface ExamConfig {
    label: string;
    count: number;
    timeLimitSec: number | null; // null = untimed
    saveToHistory: boolean;
}

// Word-level marks made with the Highlight / Strikethrough tools.
// Keys look like "s:12" (stem word 12) or "o2:4" (option C, word 4).
export interface ItemMarks {
    hl: Record<string, string>;
    st: string[];
}

export type ExamPhase = 'exam' | 'review';
export type ReviewFilter = 'all' | 'incomplete' | 'unseen' | 'flagged';

export interface ExamState {
    version: 1;
    id: string;
    startedAt: string;
    config: ExamConfig;
    questionIds: string[];
    answers: Record<string, string[]>;
    flags: string[];
    seen: string[];
    critiques: Record<string, string>;
    notes: string;
    marks: Record<string, ItemMarks>;
    current: number;
    remainingSec: number | null;
    elapsedSec: number;
    phase: ExamPhase;
    // When the candidate is stepping through a filtered set from the Review screen
    reviewQueue: string[] | null;
    colorScheme: string;
    timeSpent?: Record<string, number>; // seconds on each item while it was on screen
}

export interface CategoryResult {
    correct: number;
    total: number;
}

export interface ExamSummary {
    id: string;
    finishedAt: string;
    label: string;
    total: number;
    answered: number;
    correct: number;
    elapsedSec: number;
    timeLimitSec: number | null;
    byCategory: Record<string, CategoryResult>;
    questionIds: string[];
    incorrectIds: string[];
    flaggedIds: string[];
    answers: Record<string, string[]>;
    critiques: Record<string, string>;
    timeSpent?: Record<string, number>;
    savedCount: number;
}

// Official Part I ABS session: 185 items in 4 hours (~78 s per item)
export const SECONDS_PER_ITEM = (4 * 60 * 60) / 185;

export const EXAM_PRESETS = [
    { key: 'full', label: 'Full Session', count: 185, timeLimitSec: 4 * 60 * 60, blurb: '185 items · 4 hours — one real Part I ABS session' },
    { key: 'half', label: 'Half Session', count: 93, timeLimitSec: 2 * 60 * 60, blurb: '93 items · 2 hours' },
    { key: 'block', label: 'Quick Block', count: 50, timeLimitSec: 65 * 60, blurb: '50 items · 65 minutes' },
] as const;

const QUESTIONS_KEY = 'nbeo_exam_questions';
const STATE_KEY = 'nbeo_exam_state';
const HISTORY_KEY = 'nbeo_exam_history';
const LAST_RESULT_KEY = 'nbeo_exam_last_result';
export const PENDING_QUIZ_KEY = 'pending_quiz_ids';

function readJSON<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

function writeJSON(key: string, value: unknown) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
        console.error(`Could not persist ${key}`, err);
    }
}

export const loadExam = () => {
    const state = readJSON<ExamState>(STATE_KEY);
    const questions = readJSON<ExamQuestion[]>(QUESTIONS_KEY);
    if (!state || !questions || state.version !== 1) return null;
    return { state, questions };
};

export const saveExamQuestions = (questions: ExamQuestion[]) => writeJSON(QUESTIONS_KEY, questions);
export const saveExamState = (state: ExamState) => writeJSON(STATE_KEY, state);

export const clearExam = () => {
    try {
        localStorage.removeItem(STATE_KEY);
        localStorage.removeItem(QUESTIONS_KEY);
    } catch { /* storage unavailable */ }
};

export const loadHistory = () => readJSON<ExamSummary[]>(HISTORY_KEY) || [];

export const saveSummary = (summary: ExamSummary, questions: ExamQuestion[]) => {
    // Keep the per-question detail only for the most recent result to stay well under storage limits
    const slim = { ...summary, answers: {}, critiques: {}, timeSpent: {} };
    writeJSON(HISTORY_KEY, [slim, ...loadHistory()].slice(0, 30));
    writeJSON(LAST_RESULT_KEY, { summary, questions });
};

export const loadLastResult = () => readJSON<{ summary: ExamSummary; questions: ExamQuestion[] }>(LAST_RESULT_KEY);

export const isCorrect = (q: ExamQuestion, selected: string[] = []) =>
    selected.length === q.correct_answers.length && selected.every(v => q.correct_answers.includes(v));

export const requiredCount = (q: ExamQuestion) => Math.max(1, q.correct_answers.length);

export type ItemStatus = 'Complete' | 'Incomplete' | 'Unseen';

export const itemStatus = (q: ExamQuestion, state: ExamState): ItemStatus => {
    const selected = state.answers[q.id] || [];
    if (selected.length >= requiredCount(q)) return 'Complete';
    if (!state.seen.includes(q.id) && selected.length === 0) return 'Unseen';
    return 'Incomplete';
};

export const formatClock = (totalSeconds: number) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

export const shuffle = <T,>(arr: T[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

// Pick `count` ids so each category is represented in proportion to its share of the pool,
// the way a real form is built from a content matrix rather than pure random draw.
export const newExamId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const LETTERS = 'ABCDEFGHIJKLMNOP';

export const COLOR_SCHEMES: Record<string, { label: string; bg: string; fg: string }> = {
    default: { label: 'Default', bg: '#ffffff', fg: '#000000' },
    cream: { label: 'Black on Cream', bg: '#fdf6e3', fg: '#000000' },
    yellow: { label: 'Black on Light Yellow', bg: '#ffffcc', fg: '#000000' },
    blue: { label: 'Black on Light Blue', bg: '#dceefb', fg: '#000000' },
    grey: { label: 'Black on Light Grey', bg: '#e6e6e6', fg: '#000000' },
    dark: { label: 'White on Black', bg: '#000000', fg: '#ffffff' },
    amber: { label: 'Yellow on Black', bg: '#000000', fg: '#ffff66' },
};

export const HIGHLIGHT_COLORS = ['#ffff00', '#7fff7f', '#7fdbff', '#ffb3de'];
