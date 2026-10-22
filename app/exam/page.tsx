"use client"

import React, { useEffect, useState } from 'react';
import { useSession } from "next-auth/react";
import { supabase } from '@/utils/supabase';
import { smartClean } from '@/utils/formatters';
import { fetchAll, fetchByIds } from '@/utils/fetchAll';

import ExamSetup, { PoolFilter } from './ExamSetup';
import ExamShell from './ExamShell';
import ExamResults from './ExamResults';
import {
    CategoryResult, ExamConfig, ExamQuestion, ExamState, ExamSummary, clearExam, isCorrect, loadExam,
    loadLastResult, newExamId, saveExamQuestions, saveExamState, saveSummary, stratifiedSample,
} from './examUtils';

type Phase = 'setup' | 'exam' | 'results';

const normalizeCategory = (c: string | null) => c?.trim().replace(/\s+/g, ' ') || 'General';

export default function PracticeExamPage() {
    const { data: session } = useSession();
    const email = session?.user?.email || null;

    const [phase, setPhase] = useState<Phase>('setup');
    const [saved, setSaved] = useState<{ state: ExamState; questions: ExamQuestion[] } | null>(null);
    const [result, setResult] = useState<{ summary: ExamSummary; questions: ExamQuestion[] } | null>(null);
    const [hasLastResult, setHasLastResult] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setSaved(loadExam());
        setHasLastResult(!!loadLastResult());
    }, []);

    // The exam shell is a fixed full-screen overlay; stop the page behind it from scrolling
    useEffect(() => {
        if (phase !== 'exam') return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [phase]);

    const startExam = async (config: ExamConfig, filter: PoolFilter, categories: string[]) => {
        setBusy(true);
        setError(null);
        try {
            let pool = (await fetchAll<{ id: string; category: string }>(() => supabase.from('questions').select('id, category').order('id')))
                .map(p => ({ ...p, category: normalizeCategory(p.category) }));
            if (categories.length) pool = pool.filter(p => categories.includes(p.category));

            if (filter !== 'all' && email) {
                const activity = await fetchAll<{ question_id: string; is_correct: boolean }>(() =>
                    supabase.from('user_activity').select('question_id, is_correct').eq('user_email', email).order('id'));
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

            const ids = stratifiedSample(pool, config.count);
            const rows = await fetchByIds<ExamQuestion>(ids, chunk => supabase.from('questions').select('*').in('id', chunk));
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
            saveExamQuestions(questions);
            saveExamState(state);
            setSaved({ state, questions });
            setPhase('exam');
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
                    user_email: email,
                    submitted_answer: state.answers[q.id],
                }));
            for (let i = 0; i < rows.length; i += 100) {
                const { error: insertError } = await supabase.from('user_activity').insert(rows.slice(i, i + 100));
                if (insertError) { console.error(insertError); break; }
                savedCount += rows.slice(i, i + 100).length;
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

        saveSummary(summary, questions);
        clearExam();
        setSaved(null);
        setHasLastResult(true);
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
                onAbandon={() => { clearExam(); setSaved(null); setPhase('setup'); }}
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
            hasLastResult={hasLastResult}
            busy={busy}
            error={error}
            onStart={startExam}
            onResume={() => {
                const latest = loadExam();
                if (latest) setSaved(latest);
                setPhase('exam');
            }}
            onDiscardResume={() => { clearExam(); setSaved(null); }}
            onViewLastResult={() => {
                const last = loadLastResult();
                if (last) { setResult(last); setPhase('results'); }
            }}
        />
    );
}
