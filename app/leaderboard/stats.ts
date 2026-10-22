// stats.ts — per-user leaderboard aggregates built from the shared user_activity table

import { BLUEPRINT, blueprintKey } from '@/app/exam/blueprint';

export interface ActivityRow {
    question_id: string;
    is_correct: boolean;
    attempted_at: string;
    user: string | null; // name part of the email; the API never sends full addresses
    answered: boolean; // false for blank submissions
    category: string | null;
}

export type Window = 'all' | '30' | '7';

export interface Tally { correct: number; total: number }

export interface UserStats {
    key: string;
    name: string;
    attempts: number;
    correct: number;
    accuracy: number;
    firstTry: Tally; // first-ever attempt at each question, so re-drilling can't inflate it
    unique: number;
    mastered: number;
    coverage: number; // unique / bank size
    activeDays: number;
    streak: number; // consecutive days up to today (or yesterday)
    bestStreak: number;
    lastActive: string | null;
    byRow: Record<string, Tally>;
}

// Accounts that never show on the board
const HIDDEN = new Set(['anonymous', 'claude-e2e']);

export const MIN_ATTEMPTS_TO_RANK = 25;
export const MIN_ATTEMPTS_PER_CELL = 8;

const dayKey = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const categoryOf = (row: ActivityRow) => {
    return row.category?.trim().replace(/\s+/g, ' ') || 'General';
};

export const rowKeyOf = (row: ActivityRow) => blueprintKey(categoryOf(row)) ?? 'other';

export const ROW_LABELS: Record<string, string> = {
    ...Object.fromEntries(BLUEPRINT.map(r => [r.key, r.key === 'pharm' ? 'Pharmacology' : r.label])),
    antseg: 'Lids / Adnexa / Sclera / Anterior Uvea',
    other: 'Other',
};

const streaks = (days: Set<string>) => {
    const sorted = [...days].sort();
    let best = 0;
    let run = 0;
    let prev: Date | null = null;
    sorted.forEach(k => {
        const d = new Date(`${k}T00:00:00`);
        run = prev && Math.round((d.getTime() - prev.getTime()) / 86400000) === 1 ? run + 1 : 1;
        best = Math.max(best, run);
        prev = d;
    });

    // Current streak survives until the end of today, so yesterday still counts
    const cursor = new Date();
    if (!days.has(dayKey(cursor.toISOString()))) cursor.setDate(cursor.getDate() - 1);
    let current = 0;
    while (days.has(dayKey(cursor.toISOString()))) {
        current++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return { current, best };
};

export const buildStats = (rows: ActivityRow[], window: Window, bankSize: number): UserStats[] => {
    const since = window === 'all' ? 0 : Date.now() - Number(window) * 86400000;
    const byUser = new Map<string, ActivityRow[]>();
    rows.forEach(r => {
        if (!r.user || HIDDEN.has(r.user)) return;
        // Blank submissions are skips or bulk-inserted dev data, not real attempts
        if (!r.answered) return;
        if (!byUser.has(r.user)) byUser.set(r.user, []);
        byUser.get(r.user)!.push(r);
    });

    return [...byUser.entries()].map(([key, all]) => {
        all.sort((a, b) => a.attempted_at.localeCompare(b.attempted_at));
        const allDays = new Set(all.map(r => dayKey(r.attempted_at)));
        const { current, best } = streaks(allDays);

        const firstSeen = new Set<string>();
        const firstTry: Tally = { correct: 0, total: 0 };
        const seen = new Set<string>();
        const mastered = new Set<string>();
        const days = new Set<string>();
        const byRow: Record<string, Tally> = {};
        let correct = 0;
        let attempts = 0;

        all.forEach(r => {
            const isFirst = !firstSeen.has(r.question_id);
            firstSeen.add(r.question_id);
            if (new Date(r.attempted_at).getTime() < since) return;

            attempts++;
            if (r.is_correct) { correct++; mastered.add(r.question_id); }
            seen.add(r.question_id);
            days.add(dayKey(r.attempted_at));
            if (isFirst) { firstTry.total++; if (r.is_correct) firstTry.correct++; }
            const t = (byRow[rowKeyOf(r)] ||= { correct: 0, total: 0 });
            t.total++;
            if (r.is_correct) t.correct++;
        });

        return {
            key,
            name: key,
            attempts,
            correct,
            accuracy: attempts ? (correct / attempts) * 100 : 0,
            firstTry,
            unique: seen.size,
            mastered: mastered.size,
            coverage: bankSize ? (seen.size / bankSize) * 100 : 0,
            activeDays: days.size,
            streak: current,
            bestStreak: best,
            lastActive: all.length ? all[all.length - 1].attempted_at : null,
            byRow,
        };
    });
};

export const pct = (t: Tally | undefined) => (t && t.total ? (t.correct / t.total) * 100 : null);
