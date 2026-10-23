"use client"

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from "next-auth/react";
import { api } from '@/utils/api';
import { smartClean } from '@/utils/formatters';

import ExamSetup, { PoolFilter } from './ExamSetup';
import ExamShell from './ExamShell';
import ExamResults from './ExamResults';
import {
    CategoryResult, ExamConfig, ExamQuestion, ExamState, ExamSummary, clearExam, isCorrect, loadExam,
    newExamId, saveExamQuestions, saveExamState,
} from './examUtils';
import {
    FinishedExam, createRemoteExam, createSaver, deleteRemoteExam, fetchExam, finishRemoteExam, importLocalHistory,
    listExams, reconcileInProgress,
} from './examSync';
import { blueprintSample } from './blueprint';
import { Challenge } from './Challenges';

type Phase = 'setup' | 'exam' | 'results';

const normalizeCategory = (c: string | null) => c?.trim().replace(/\s+/g, ' ') || 'General';

export default function PracticeExamPage() {
    const { data: session } = useSession();
    const email = session?.user?.email || null;

    const [phase, setPhase] = useState<Phase>('setup');
    const [saved, setSaved] = useState<{ state: ExamState; questions: ExamQuestion[] } | null>(null);
    const [result, setResult] = useState<{ summary: ExamSummary; questions: ExamQuestion[] } | null>(null);
    const [history, setHistory] = useState<FinishedExam[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);
    const saver = useRef<ReturnType<typeof createSaver> | null>(null);

    const keepLocal = (exam: { state: ExamState; questions: ExamQuestion[] }) => {
        saveExamQuestions(exam.questions);
        saveExamState(exam.state);
        setSaved(exam);
    };

    const refreshHistory = useCallback(() => listExams().then(l => { setHistory(l.finished); return l; }), []);

    // Challenges follow the leaderboard switch
    const canChallenge = session?.user?.canSeeLeaderboard !== false && !!email;
    const [challenges, setChallenges] = useState<Challenge[] | null>(null);
    const refreshChallenges = useCallback(() => {
        api<Challenge[]>('/api/challenges').then(setChallenges, () => setChallenges([]));
    }, []);
    useEffect(() => { if (canChallenge) refreshChallenges(); }, [canChallenge, refreshChallenges]);

    // The browser's copy shows at once; then the server's list decides what to resume and fills in history
    useEffect(() => {
        const local = loadExam();
        setSaved(local);
        if (!email) return;
        (async () => {
            try {
                await importLocalHistory().catch(err => console.error('Could not import local exam history', err));
                const list = await refreshHistory();
                const winner = await reconcileInProgress(loadExam() ?? local, list.inProgress);
                if (winner) keepLocal(winner);
            } catch (err) {
                console.error(err);
                setSyncError("Couldn't reach the server, so exams on other devices aren't shown. This device's exam still works.");
            }
        })();
    }, [email, refreshHistory]);

    // Mirror progress to the server while the exam is open, and once more as the page closes
    const serverId = saved?.state.serverId;
    useEffect(() => {
        if (phase !== 'exam' || !serverId) return;
        const s = createSaver(serverId);
        saver.current = s;
        const onHide = () => { s.flush(true); };
        window.addEventListener('pagehide', onHide);
        return () => {
            window.removeEventListener('pagehide', onHide);
            s.flush();
            saver.current = null;
        };
    }, [phase, serverId]);
    const onSave = useCallback((state: ExamState) => saver.current?.save(state), []);

    // The exam shell is a fixed full-screen overlay; stop the page behind it from scrolling
    useEffect(() => {
        if (phase !== 'exam') return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [phase]);

    // Builds an exam on exactly these questions, in this order, and opens it
    const launch = async (ids: string[], config: ExamConfig) => {
        const rows = await api<ExamQuestion[]>('/api/questions', { body: { ids } });
        const byId = new Map(rows.map(r => [r.id, r]));
        const questions: ExamQuestion[] = ids
            .map(id => byId.get(id))
            .filter((q): q is ExamQuestion => !!q)
            .map(q => ({
                id: q.id,
                category: normalizeCategory(q.category),
                question_text: smartClean(q.question_text),
                options: q.options.map(smartClean),
                correct_answers: q.correct_answers.map(smartClean),
                explanation: smartClean(q.explanation || ''),
            }));

        const state: ExamState = {
            version: 1,
            id: newExamId(),
            startedAt: new Date().toISOString(),
            config: { ...config, count: questions.length },
            questionIds: questions.map(q => q.id),
            answers: {},
            flags: [],
            seen: questions.length ? [questions[0].id] : [],
            critiques: {},
            notes: '',
            marks: {},
            current: 0,
            remainingSec: config.timeLimitSec,
            elapsedSec: 0,
            phase: 'exam',
            reviewQueue: null,
            colorScheme: 'default',
            timeSpent: {},
        };
        // Starting doesn't wait on the server: if this fails, the exam is uploaded the next time the page loads
        const serverId = await createRemoteExam(state, questions).catch(err => { console.error(err); return undefined; });
        keepLocal({ state: { ...state, serverId }, questions });
        setPhase('exam');
    };

    const takeChallenge = async (id: string) => {
        setBusy(true);
        setError(null);
        try {
            const c = await api<{ title: string; question_ids: string[]; time_limit_sec: number | null }>(`/api/challenges/${id}`);
            await launch(c.question_ids, {
                label: `Challenge: ${c.title}`, count: c.question_ids.length, timeLimitSec: c.time_limit_sec, saveToHistory: true, challengeId: id,
            });
        } catch (err) {
            console.error(err);
            setError('Could not open that challenge. Check your connection and try again.');
        } finally {
            setBusy(false);
        }
    };

    // challengeTitle: also publish the exam as a challenge with this name
    const startExam = async (config: ExamConfig, filter: PoolFilter, categories: string[], challengeTitle?: string) => {
        setBusy(true);
        setError(null);
        try {
            let pool = (await api<{ id: string; category: string }[]>('/api/questions'))
                .map(p => ({ ...p, category: normalizeCategory(p.category) }));
            if (categories.length) pool = pool.filter(p => categories.includes(p.category));

            if (filter !== 'all' && email) {
                const activity = await api<{ question_id: string; is_correct: boolean }[]>('/api/activity');
                const seen = new Set(activity.map(a => a.question_id));
                const mastered = new Set(activity.filter(a => a.is_correct).map(a => a.question_id));
                pool = pool.filter(p => {
                    if (filter === 'unseen') return !seen.has(p.id);
                    if (filter === 'notMastered') return !mastered.has(p.id);
                    return seen.has(p.id) && !mastered.has(p.id); // missed
                });
            }

            if (!pool.length) {
                setError('No questions match those settings.');
                return;
            }

            const ids = blueprintSample(pool, config.count);
            let challengeId: string | undefined;
            if (challengeTitle !== undefined) {
                challengeId = (await api<{ id: string }>('/api/challenges', {
                    body: { title: challengeTitle, questionIds: ids, timeLimitSec: config.timeLimitSec },
                })).id;
            }
            await launch(ids, { ...config, challengeId });
        } catch (err) {
            console.error(err);
            setError('Could not build the exam. Check your connection and try again.');
        } finally {
            setBusy(false);
        }
    };

    const finishExam = async (state: ExamState) => {
        if (!saved) return;
        const questions = saved.questions;
        const byCategory: Record<string, CategoryResult> = {};
        let correct = 0;
        let answered = 0;
        const incorrectIds: string[] = [];

        questions.forEach(q => {
            const sel = state.answers[q.id] || [];
            const ok = isCorrect(q, sel);
            const cat = (byCategory[q.category] ||= { correct: 0, total: 0 });
            cat.total++;
            if (sel.length) answered++;
            if (ok) { correct++; cat.correct++; } else incorrectIds.push(q.id);
        });

        // Only answered items go to user_activity, so blank ones still count as "unseen" in Quick Test filters
        let savedCount = 0;
        if (state.config.saveToHistory && email) {
            const rows = questions
                .filter(q => (state.answers[q.id] || []).length > 0)
                .map(q => ({
                    question_id: q.id,
                    is_correct: isCorrect(q, state.answers[q.id]),
                    user_rating: null,
                    satisfaction_rating: null,
                    submitted_answer: state.answers[q.id],
                }));
            for (let i = 0; i < rows.length; i += 100) {
                const inserted = await api<unknown[]>('/api/activity', { body: { rows: rows.slice(i, i + 100) } }).catch(err => { console.error(err); return null; });
                if (!inserted) break;
                savedCount += inserted.length;
            }
        }

        const summary: ExamSummary = {
            id: state.id,
            finishedAt: new Date().toISOString(),
            label: state.config.label,
            total: questions.length,
            answered,
            correct,
            elapsedSec: state.elapsedSec,
            timeLimitSec: state.config.timeLimitSec,
            byCategory,
            questionIds: questions.map(q => q.id),
            incorrectIds,
            flaggedIds: state.flags,
            answers: state.answers,
            critiques: state.critiques,
            timeSpent: state.timeSpent || {},
            savedCount,
        };

        try {
            const id = state.serverId ?? await createRemoteExam(state, questions);
            await finishRemoteExam(id, state, summary);
            if (state.config.challengeId) {
                await api(`/api/challenges/${state.config.challengeId}/entry`, { body: { examId: id } });
                refreshChallenges();
            }
            refreshHistory().catch(console.error);
        } catch (err) {
            console.error(err);
            setSyncError("This result couldn't be saved to your exam history. Its answers are in your History if you chose to save them.");
        }
        clearExam();
        setSaved(null);
        setResult({ summary, questions });
        setPhase('results');
        window.scrollTo(0, 0);
    };

    if (phase === 'exam' && saved) {
        return (
            <ExamShell
                key={saved.state.id}
                questions={saved.questions}
                initialState={saved.state}
                candidateName={session?.user?.name || 'Candidate'}
                onFinish={finishExam}
                onExit={state => { setSaved(s => (s ? { ...s, state } : s)); setPhase('setup'); }}
                onAbandon={() => {
                    if (saved.state.serverId) deleteRemoteExam(saved.state.serverId).catch(console.error);
                    clearExam(); setSaved(null); setPhase('setup');
                }}
                onSave={onSave}
            />
        );
    }

    if (phase === 'results' && result) {
        return <ExamResults summary={result.summary} questions={result.questions} onNewExam={() => { setResult(null); setPhase('setup'); window.scrollTo(0, 0); }} />;
    }

    return (
        <ExamSetup
            signedIn={!!email}
            resumable={saved ? { state: saved.state, total: saved.questions.length } : null}
            history={history}
            challenges={canChallenge ? challenges : null}
            onTakeChallenge={takeChallenge}
            onDeleteChallenge={async id => {
                await api(`/api/challenges/${id}`, { method: 'DELETE' }).catch(console.error);
                refreshChallenges();
            }}
            busy={busy}
            error={error ?? syncError}
            onStart={startExam}
            onResume={() => {
                const latest = loadExam();
                if (latest) setSaved(latest);
                setPhase('exam');
            }}
            onDiscardResume={() => {
                if (saved?.state.serverId) deleteRemoteExam(saved.state.serverId).catch(console.error);
                clearExam(); setSaved(null);
            }}
            onReview={async id => {
                const exam = await fetchExam(id).catch(() => null);
                if (exam?.summary && exam.questions) {
                    setResult({ summary: exam.summary, questions: exam.questions });
                    setPhase('results');
                    window.scrollTo(0, 0);
                }
            }}
            onDelete={async id => {
                await deleteRemoteExam(id).catch(console.error);
                refreshHistory().catch(console.error);
            }}
        />
    );
}
