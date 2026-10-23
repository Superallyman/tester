// examSync.ts — keeps practice exams on the server (/api/exams) so they survive across devices.
// The browser still keeps its own copy in localStorage (examUtils), which is written every second and never waits
// on the network; this module mirrors it to the server in the background.

import { api } from '@/utils/api';
import { ExamQuestion, ExamState, ExamSummary, clearLocalHistory, loadHistory, loadLastResult } from './examUtils';

export interface FinishedExam {
    id: string;
    client_id: string;
    label: string;
    total: number;
    answered: number;
    correct: number;
    elapsed_sec: number;
    finished_at: string;
    time_limit_sec: number | null;
    by_category: ExamSummary['byCategory'] | null;
    has_detail: boolean;
}

interface ExamList {
    inProgress: { id: string; client_id: string; label: string; total: number; state: ExamState; updated_at: string } | null;
    finished: FinishedExam[];
}

interface ExamRecord {
    id: string;
    client_id: string;
    status: 'in_progress' | 'finished';
    questions: ExamQuestion[] | null;
    state: ExamState | null;
    summary: ExamSummary | null;
}

export const listExams = () => api<ExamList>('/api/exams');
export const fetchExam = (id: string) => api<ExamRecord>(`/api/exams/${id}`);
export const createRemoteExam = (state: ExamState, questions: ExamQuestion[]) =>
    api<{ id: string }>('/api/exams', { body: { state, questions } }).then(r => r.id);
export const finishRemoteExam = (id: string, state: ExamState, summary: ExamSummary) =>
    api(`/api/exams/${id}/finish`, { body: { state, summary } });
export const deleteRemoteExam = (id: string) => api(`/api/exams/${id}`, { method: 'DELETE' });

// More exam time means further along; device clocks only break ties (they can disagree between devices)
const newer = (a: ExamState, b: ExamState) =>
    a.elapsedSec !== b.elapsedSec ? a.elapsedSec > b.elapsedSec : (a.savedAt ?? '') > (b.savedAt ?? '');

/**
 * Decides which unfinished exam to offer: the browser's or the server's, whichever is further along.
 * Returns the winner with its server id, after making sure the server has it.
 */
export async function reconcileInProgress(
    local: { state: ExamState; questions: ExamQuestion[] } | null,
    remote: ExamList['inProgress'],
): Promise<{ state: ExamState; questions: ExamQuestion[] } | null> {
    if (remote?.state && (!local || newer(remote.state, local.state))) {
        const full = await fetchExam(remote.id);
        if (full.state && full.questions) return { state: { ...full.state, serverId: full.id }, questions: full.questions };
    }
    if (!local) return null;
    // Started before exams were synced, offline, or simply ahead of the server: upload it
    const serverId = await createRemoteExam(local.state, local.questions);
    return { ...local, state: { ...local.state, serverId } };
}

/** Uploads the exam history this browser kept before exams were saved on the server, then forgets it. */
export async function importLocalHistory() {
    const summaries = loadHistory();
    if (!summaries.length) return 0;
    const { imported } = await api<{ imported: number }>('/api/exams/import', { body: { summaries, last: loadLastResult() } });
    clearLocalHistory();
    return imported;
}

// Answers, flags and navigation are worth saving within seconds; the ticking clock only every so often
const QUICK_MS = 1500;
const CLOCK_MS = 20000;

const progressKey = (s: ExamState) => JSON.stringify([s.answers, s.flags, s.current, s.phase, s.critiques, s.notes, s.marks]);

/** Background saver for one exam. save() is cheap to call on every state change. */
export function createSaver(serverId: string) {
    let latest: ExamState | null = null;
    let sentKey = '';
    let sentAt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let timerIsQuick = false;

    const send = (keepalive = false) => {
        if (timer) { clearTimeout(timer); timer = null; }
        if (!latest) return Promise.resolve();
        const state = latest;
        sentKey = progressKey(state);
        sentAt = Date.now();
        // keepalive lets the request finish while the page is closing
        return fetch(`/api/exams/${serverId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state }),
            keepalive,
        }).then(() => undefined, err => console.error('Could not save exam progress', err));
    };

    return {
        save(state: ExamState) {
            latest = state;
            const changed = progressKey(state) !== sentKey;
            // A pending save already covers this, unless it's a slow clock save and something real just changed
            if (timer && (timerIsQuick || !changed)) return;
            if (timer) clearTimeout(timer);
            timerIsQuick = changed;
            timer = setTimeout(() => send(), changed ? QUICK_MS : Math.max(0, CLOCK_MS - (Date.now() - sentAt)));
        },
        flush: (keepalive = false) => send(keepalive),
    };
}
