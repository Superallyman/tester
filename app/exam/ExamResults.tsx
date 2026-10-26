"use client"

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ExamQuestion, ExamSummary, LETTERS, PENDING_QUIZ_KEY, formatClock, isCorrect } from './examUtils';
import ReportQuestion from '../components/ReportQuestion';
import QuestionNotes from '../components/QuestionNotes';
import { useNotes } from '../components/useNotes';
import DifficultyLine from '../components/DifficultyLine';
import { useDifficulty } from '../components/useDifficulty';
import { edge, glass, glassCard } from '@/utils/orbitStyles';

interface ExamResultsProps {
    summary: ExamSummary;
    questions: ExamQuestion[];
    onNewExam: () => void;
}

type ItemFilter = 'incorrect' | 'all' | 'flagged' | 'unanswered' | 'critiqued' | 'slowest';

// Orbit glass surface
const card: React.CSSProperties = glassCard;

const scoreColor = (pct: number) => (pct >= 70 ? 'var(--orbit-good)' : pct >= 55 ? 'var(--orbit-warn)' : 'var(--orbit-bad)');

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div style={{ ...card, padding: '0.9rem 1rem' }}>
            <div style={{ fontSize: '0.65rem', opacity: 0.6, letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 2 }}>{value}</div>
            {sub && <div style={{ fontSize: '0.75rem', opacity: 0.65, marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

export default function ExamResults({ summary, questions, onNewExam }: ExamResultsProps) {
    const router = useRouter();
    const [filter, setFilter] = useState<ItemFilter>(summary.incorrectIds.length ? 'incorrect' : 'all');
    const [category, setCategory] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const questionIds = useMemo(() => questions.map(q => q.id), [questions]);
    const { notes, save: saveNote } = useNotes(questionIds);
    const difficulty = useDifficulty(questionIds);

    const pct = summary.total ? (summary.correct / summary.total) * 100 : 0;
    const answeredPct = summary.answered ? (summary.correct / summary.answered) * 100 : 0;
    const secPerItem = summary.answered ? summary.elapsedSec / summary.answered : 0;

    const breakdown = useMemo(() =>
        Object.entries(summary.byCategory)
            .map(([cat, r]) => ({ cat, ...r, pct: r.total ? (r.correct / r.total) * 100 : 0 }))
            .sort((a, b) => a.pct - b.pct || b.total - a.total),
    [summary.byCategory]);

    const insights = useMemo(() => {
        const single = questions.filter(q => q.correct_answers.length <= 1);
        const multi = questions.filter(q => q.correct_answers.length > 1);
        const flagged = questions.filter(q => summary.flaggedIds.includes(q.id));
        const rate = (list: ExamQuestion[]) => list.length ? list.filter(q => isCorrect(q, summary.answers[q.id])).length : 0;
        const spent = summary.timeSpent || {};
        const avgTime = (list: ExamQuestion[]) => list.length ? list.reduce((sum, q) => sum + (spent[q.id] || 0), 0) / list.length : 0;
        const answeredQs = questions.filter(q => (summary.answers[q.id] || []).length);
        return {
            timeRight: avgTime(answeredQs.filter(q => isCorrect(q, summary.answers[q.id]))),
            timeWrong: avgTime(answeredQs.filter(q => !isCorrect(q, summary.answers[q.id]))),
            hasTiming: Object.keys(spent).length > 0,
            single: { correct: rate(single), total: single.length },
            multi: { correct: rate(multi), total: multi.length },
            flagged: { correct: rate(flagged), total: flagged.length },
        };
    }, [questions, summary]);

    const spent = summary.timeSpent || {};
    const slowestIds = new Set(
        [...questions].filter(q => spent[q.id]).sort((a, b) => (spent[b.id] || 0) - (spent[a.id] || 0)).slice(0, 10).map(q => q.id),
    );

    const items = questions.filter(q => {
        if (category && (q.category?.trim() || 'General') !== category) return false;
        const sel = summary.answers[q.id] || [];
        if (filter === 'incorrect') return !isCorrect(q, sel);
        if (filter === 'flagged') return summary.flaggedIds.includes(q.id);
        if (filter === 'unanswered') return sel.length === 0;
        if (filter === 'critiqued') return !!summary.critiques[q.id];
        if (filter === 'slowest') return slowestIds.has(q.id);
        return true;
    });
    if (filter === 'slowest') items.sort((a, b) => (spent[b.id] || 0) - (spent[a.id] || 0));

    const counts: Record<ItemFilter, number> = {
        incorrect: summary.incorrectIds.length,
        all: questions.length,
        flagged: summary.flaggedIds.length,
        unanswered: questions.filter(q => !(summary.answers[q.id] || []).length).length,
        critiqued: Object.keys(summary.critiques).length,
        slowest: slowestIds.size,
    };

    const drillMissed = () => {
        try { sessionStorage.setItem(PENDING_QUIZ_KEY, JSON.stringify(summary.incorrectIds)); } catch { /* ignore */ }
        router.push('/');
    };

    return (
        <main style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
            <div style={{ ...card, borderColor: 'var(--orbit-primary-bg)', textAlign: 'center', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.75rem', opacity: 0.7, letterSpacing: '0.05em' }}>NBEO PART I ABS PRACTICE · {summary.label.toUpperCase()}</div>
                <div style={{ fontSize: '3rem', fontWeight: 800, color: scoreColor(pct), lineHeight: 1.1, margin: '8px 0' }}>{pct.toFixed(1)}%</div>
                <div style={{ fontSize: '1rem' }}>{summary.correct} of {summary.total} correct</div>
                <div className="orbit-progress" style={{ margin: '14px auto 0', maxWidth: 480 }}>
                    <div style={{ background: scoreColor(pct), height: '100%', width: `${pct}%` }} />
                </div>
                <p style={{ fontSize: '0.75rem', opacity: 0.6, margin: '12px 0 0' }}>
                    NBEO reports a scaled score, so this raw percentage is a practice gauge, not a predicted board score.
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: '1.25rem' }}>
                <Stat label="ANSWERED" value={`${summary.answered}/${summary.total}`} sub={summary.answered < summary.total ? `${summary.total - summary.answered} left blank` : 'none left blank'} />
                <Stat label="ACCURACY ON ANSWERED" value={`${answeredPct.toFixed(0)}%`} />
                <Stat
                    label="TIME USED"
                    value={formatClock(summary.elapsedSec)}
                    sub={summary.timeLimitSec ? `of ${formatClock(summary.timeLimitSec)} allowed` : 'untimed'}
                />
                <Stat label="PACE" value={`${Math.round(secPerItem)}s / item`} sub={secPerItem > 78 ? 'slower than exam pace (78s)' : 'within exam pace (78s)'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: '1.25rem' }}>
                {insights.multi.total > 0 && (
                    <Stat label="SINGLE-ANSWER ITEMS" value={`${insights.single.correct}/${insights.single.total}`} sub={`${insights.single.total ? ((insights.single.correct / insights.single.total) * 100).toFixed(0) : 0}% correct`} />
                )}
                {insights.multi.total > 0 && (
                    <Stat label="MULTIPLE-RESPONSE ITEMS" value={`${insights.multi.correct}/${insights.multi.total}`} sub="all-or-nothing scoring" />
                )}
                {insights.flagged.total > 0 && (
                    <Stat label="FLAGGED ITEMS" value={`${insights.flagged.correct}/${insights.flagged.total}`} sub="how your second-guesses turned out" />
                )}
                {insights.hasTiming && (
                    <Stat
                        label="AVG TIME: RIGHT vs WRONG"
                        value={`${Math.round(insights.timeRight)}s / ${Math.round(insights.timeWrong)}s`}
                        sub={insights.timeWrong > insights.timeRight * 1.3 ? 'you linger on the ones you miss' : 'similar pacing either way'}
                    />
                )}
                <Stat
                    label="SAVED TO HISTORY"
                    value={summary.savedCount ? `${summary.savedCount} items` : '—'}
                    sub={summary.savedCount ? 'blank items stay "unseen"' : 'not saved'}
                />
            </div>

            <section style={{ ...card, marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                    <h2 className="orbit-h2">By category</h2>
                    {category && <button onClick={() => setCategory(null)} style={{ background: 'none', border: 'none', color: 'var(--orbit-accent)', cursor: 'pointer', fontSize: '0.85rem' }}>Clear filter</button>}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                    {breakdown.map(b => (
                        <button
                            key={b.cat}
                            onClick={() => { setCategory(category === b.cat ? null : b.cat); setFilter('all'); }}
                            style={{
                                display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(60px, 1fr) 70px', gap: 10, alignItems: 'center',
                                background: category === b.cat ? 'rgba(0,112,243,0.12)' : 'transparent', border: 'none', color: 'inherit',
                                padding: '4px 6px', borderRadius: 6, cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem',
                            }}
                        >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.cat}>{b.cat}</span>
                            <span className="orbit-progress">
                                <span style={{ display: 'block', background: scoreColor(b.pct), height: '100%', width: `${b.pct}%` }} />
                            </span>
                            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{b.correct}/{b.total}</span>
                        </button>
                    ))}
                </div>
            </section>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                {summary.incorrectIds.length > 0 && (
                    <button onClick={drillMissed} className="orbit-btn orbit-btn--accent" style={{ flex: '1 1 220px', padding: 14 }}>
                        Drill the {summary.incorrectIds.length} missed items in Quick Test
                    </button>
                )}
                <button onClick={onNewExam} className="orbit-btn orbit-btn--primary" style={{ flex: '1 1 220px', padding: 14 }}>
                    New Practice Exam
                </button>
            </div>

            <section>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    {(['incorrect', 'all', 'flagged', 'unanswered', 'critiqued', 'slowest'] as ItemFilter[]).filter(f => f === 'all' || counts[f] > 0).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            style={{
                                padding: '6px 12px', borderRadius: 16, cursor: 'pointer', fontSize: '0.8rem',
                                border: `1px solid ${filter === f ? 'var(--orbit-accent)' : 'rgba(128,128,128,0.3)'}`,
                                background: filter === f ? 'var(--orbit-accent)' : 'transparent', color: filter === f ? 'white' : 'inherit',
                            }}
                        >
                            {f[0].toUpperCase() + f.slice(1)} ({counts[f]})
                        </button>
                    ))}
                    {category && <span style={{ fontSize: '0.8rem', alignSelf: 'center', opacity: 0.7 }}>in {category}</span>}
                </div>

                {items.length === 0 && <p style={{ opacity: 0.6, textAlign: 'center' }}>Nothing here.</p>}

                {items.map(q => {
                    const idx = questions.indexOf(q);
                    const sel = summary.answers[q.id] || [];
                    const ok = isCorrect(q, sel);
                    const open = expanded[q.id] ?? filter === 'incorrect';
                    return (
                        <article key={q.id} style={{ ...card, marginBottom: 10, padding: '1rem 1.1rem' }}>
                            <button
                                onClick={() => setExpanded(e => ({ ...e, [q.id]: !open }))}
                                style={{ display: 'flex', gap: 10, width: '100%', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                            >
                                <span style={{ fontWeight: 700, color: sel.length === 0 ? '#9ca3af' : ok ? 'var(--orbit-good)' : 'var(--orbit-bad)', minWidth: 52 }}>
                                    #{idx + 1} {sel.length === 0 ? '—' : ok ? '✓' : '✕'}
                                </span>
                                <span style={{ flex: 1, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: open ? 'unset' : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {q.question_text}
                                </span>
                                {spent[q.id] > 0 && <span title="Time on this item" style={{ fontSize: '0.75rem', opacity: 0.6, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatClock(spent[q.id]).replace(/^0:/, '')}</span>}
                                {summary.flaggedIds.includes(q.id) && <span title="Flagged" style={{ color: 'var(--orbit-warn)' }}>⚑</span>}
                            </button>
                            {open && (
                                <div style={{ marginTop: 12 }}>
                                    <div style={{ fontSize: '0.7rem', opacity: 0.6, marginBottom: 8 }}>{q.category}</div>
                                    <div style={{ display: 'grid', gap: 6 }}>
                                        {q.options.map((opt, i) => {
                                            const picked = sel.includes(opt);
                                            const right = q.correct_answers.includes(opt);
                                            return (
                                                <div key={i} style={{
                                                    display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 8, fontSize: '0.88rem',
                                                    border: `1px solid ${right ? 'rgba(16,185,129,0.5)' : picked ? 'rgba(239,68,68,0.5)' : 'rgba(128,128,128,0.2)'}`,
                                                    background: right ? 'rgba(16,185,129,0.08)' : picked ? 'rgba(239,68,68,0.08)' : 'transparent',
                                                }}>
                                                    <span><strong>{LETTERS[i]}.</strong> {opt}</span>
                                                    <span style={{ fontWeight: 700, color: right ? (picked ? 'var(--orbit-good)' : 'var(--orbit-accent)') : 'var(--orbit-bad)' }}>
                                                        {right ? (picked ? '✓' : 'answer') : picked ? '✕' : ''}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {q.explanation && (
                                        <div style={{ ...glass, padding: 12, fontSize: '0.88rem', marginTop: 12, whiteSpace: 'pre-wrap', ...edge('var(--orbit-accent)') }}>
                                            <strong style={{ color: 'var(--orbit-accent)' }}>Explanation:</strong> {q.explanation}
                                        </div>
                                    )}
                                    {summary.critiques[q.id] && (
                                        <div style={{ ...glass, padding: 10, fontSize: '0.85rem', marginTop: 8, ...edge('var(--orbit-warn)') }}>
                                            <strong style={{ color: 'var(--orbit-warn)' }}>Your critique:</strong> {summary.critiques[q.id]}
                                        </div>
                                    )}
                                    <div style={{ marginTop: 12 }}><DifficultyLine stat={difficulty[q.id]} /></div>
                                    <div style={{ marginTop: 12 }}><QuestionNotes value={notes[q.id]} onSave={patch => saveNote(q.id, patch)} /></div>
                                    <div style={{ marginTop: 10 }}><ReportQuestion questionId={q.id} /></div>
                                </div>
                            )}
                        </article>
                    );
                })}
            </section>
        </main>
    );
}
