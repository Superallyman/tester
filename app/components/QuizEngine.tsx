"use client"

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { api } from '@/utils/api';

import { smartClean } from '@/utils/formatters';
import ReportQuestion from './ReportQuestion';
import ReviewedOption from './ReviewedOption';
import { Timer } from 'lucide-react';

interface Question {
    id: string;
    question_text: string;
    options: string[];
    correct_answers: string[];
    explanation: string;
    category: string;
}

interface QuizEngineProps {
    questionIds: string[];
}

type QuizMode = 'all' | 'one';
const MODE_KEY = 'quiz_mode';
const LETTERS = 'ABCDEFGH';

const SHORTCUTS: [string, string][] = [
    ['A–H', 'Pick or unpick an answer'],
    ['1–4', 'Rate confidence (before submitting) or satisfaction (after)'],
    ['→ / K', 'Next question'],
    ['← / J', 'Previous question'],
    ['Enter', 'Next question'],
    ['Ctrl + Enter', 'Submit all answers'],
    ['?', 'Show or hide these shortcuts'],
];

interface RatingPickerProps {
    current: number | undefined;
    onSelect: (val: number | undefined) => void;
    label: string;
}

export default function QuizEngine({ questionIds }: QuizEngineProps) {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [userSelections, setUserSelections] = useState<Record<string, string[]>>({});
    const [ratings, setRatings] = useState<Record<string, number | undefined>>({});
    const [satisfaction, setSatisfaction] = useState<Record<string, number | undefined>>({});
    const [activityIds, setActivityIds] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // The question the keyboard acts on; in one-at-a-time mode, the one on screen
    const [active, setActive] = useState(0);
    const [mode, setMode] = useState<QuizMode>('all');
    const [showHelp, setShowHelp] = useState(false);
    const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        try { if (localStorage.getItem(MODE_KEY) === 'one') setMode('one'); } catch { /* storage unavailable */ }
    }, []);

    const changeMode = (m: QuizMode) => {
        setMode(m);
        try { localStorage.setItem(MODE_KEY, m); } catch { /* storage unavailable */ }
    };

    const formatTime = (totalSeconds: number) => {
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const calculateScore = () => {
        let correctCount = 0;
        questions.forEach(q => {
            const selected = userSelections[q.id] || [];
            const isCorrect = selected.length === q.correct_answers.length &&
                selected.every(val => q.correct_answers.includes(val));
            if (isCorrect) correctCount++;
        });
        return correctCount;
    };

    const score = hasSubmitted ? calculateScore() : 0;
    const percentage = questions.length > 0 ? (score / questions.length) * 100 : 0;

    useEffect(() => {
        async function fetchQuestions() {
            if (questionIds.length === 0) return;
            const data = await api<Question[]>('/api/questions', { body: { ids: questionIds } }).catch(() => null);
            if (data) {
                const sortedData = questionIds
                    .map(id => data.find(q => q.id === id))
                    .filter((q): q is Question => !!q);

                const decodedData = sortedData.map(q => ({
                    ...q,
                    question_text: smartClean(q.question_text),
                    options: q.options.map((opt: string) => smartClean(opt)),
                    correct_answers: q.correct_answers.map((ans: string) => smartClean(ans)),
                    explanation: smartClean(q.explanation)
                }));

                setQuestions(decodedData);
                timerRef.current = setInterval(() => setSeconds(prev => prev + 1), 1000);
            }
        }
        fetchQuestions();
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [questionIds]);

    // One correct answer: options act like radio buttons. Several: like checkboxes, as on the exam ("Select 2").
    const toggleOption = (qId: string, option: string) => {
        if (hasSubmitted) return;
        const multi = (questions.find(q => q.id === qId)?.correct_answers.length ?? 1) > 1;
        setUserSelections(prev => {
            const current = prev[qId] || [];
            const next = current.includes(option) ? current.filter(i => i !== option) : multi ? [...current, option] : [option];
            return { ...prev, [qId]: next };
        });
    };

    const handleAllSubmit = async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsSubmitting(true);

        const activitiesToInsert = questions
            .filter(q => ratings[q.id] !== undefined)
            .map(q => {
                const selected = userSelections[q.id] || [];
                const isCorrect = selected.length === q.correct_answers.length &&
                    selected.every(val => q.correct_answers.includes(val));
                return {
                    question_id: q.id,
                    is_correct: isCorrect,
                    user_rating: ratings[q.id],
                    satisfaction_rating: ratings[q.id],
                    submitted_answer: selected,
                };
            });

        if (activitiesToInsert.length > 0) {
            const data = await api<{ id: string; question_id: string }[]>('/api/activity', { body: { rows: activitiesToInsert } }).catch(err => { console.error(err); return null; });
            if (data) {
                const idMap: Record<string, string> = {};
                const satMap: Record<string, number> = {};
                data.forEach(row => {
                    idMap[row.question_id] = row.id;
                    satMap[row.question_id] = ratings[row.question_id] as number;
                });
                setActivityIds(idMap);
                setSatisfaction(satMap);
            }
        }
        setHasSubmitted(true);
        setIsSubmitting(false);
    };

    const handleSatisfactionUpdate = async (qId: string, scoreVal: number | undefined) => {
        setSatisfaction(prev => ({ ...prev, [qId]: scoreVal }));
        const dbId = activityIds[qId];

        if (dbId && scoreVal === undefined) {
            const ok = await api(`/api/activity/${dbId}`, { method: 'DELETE' }).then(() => true, () => false);
            if (ok) {
                setActivityIds(prev => {
                    const next = { ...prev };
                    delete next[qId];
                    return next;
                });
            }
            return;
        }

        if (!dbId && scoreVal !== undefined) {
            const selected = userSelections[qId] || [];
            const q = questions.find(item => item.id === qId)!;
            const isCorrect = selected.length === q.correct_answers.length &&
                selected.every(val => q.correct_answers.includes(val));

            const data = await api<{ id: string }[]>('/api/activity', {
                body: { rows: [{ question_id: qId, is_correct: isCorrect, user_rating: scoreVal, satisfaction_rating: scoreVal, submitted_answer: selected }] },
            }).catch(() => null);

            if (data?.[0]) {
                setActivityIds(prev => ({ ...prev, [qId]: data[0].id }));
            }
            return;
        }

        if (dbId && scoreVal !== undefined) {
            await api(`/api/activity/${dbId}`, { method: 'PATCH', body: { satisfaction_rating: scoreVal } }).catch(console.error);
        }
    };

    const goTo = useCallback((index: number) => {
        const next = Math.max(0, Math.min(questions.length - 1, index));
        setActive(next);
        if (mode === 'all') cardRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [questions.length, mode]);

    const rate = useCallback((qId: string, val: number | undefined) => {
        if (hasSubmitted) handleSatisfactionUpdate(qId, val);
        else setRatings(prev => ({ ...prev, [qId]: val }));
        // handleSatisfactionUpdate changes every render; reading it here is what the buttons do too
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasSubmitted, activityIds, userSelections, questions]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('input, textarea, select, [contenteditable="true"]') || e.altKey || e.metaKey) return;
            const q = questions[active];
            if (!q) return;
            const key = e.key;
            if (key === 'Enter' && e.ctrlKey) {
                if (!hasSubmitted && !isSubmitting) { e.preventDefault(); handleAllSubmit(); }
                return;
            }
            if (e.ctrlKey) return;
            const letter = LETTERS.indexOf(key.toUpperCase());
            if (key.length === 1 && letter >= 0 && letter < q.options.length && !hasSubmitted) {
                e.preventDefault();
                toggleOption(q.id, q.options[letter]);
            } else if (/^[1-4]$/.test(key)) {
                e.preventDefault();
                const val = Number(key);
                rate(q.id, (hasSubmitted ? satisfaction[q.id] : ratings[q.id]) === val ? undefined : val);
            } else if (key === 'ArrowRight' || key === 'k' || key === 'K' || key === 'Enter') {
                // Enter on a focused button should press it, not skip ahead
                if (key === 'Enter' && target.closest('button, a')) return;
                e.preventDefault();
                goTo(active + 1);
            } else if (key === 'ArrowLeft' || key === 'j' || key === 'J') {
                e.preventDefault();
                goTo(active - 1);
            } else if (key === '?') {
                setShowHelp(h => !h);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // handleAllSubmit and toggleOption are plain functions over the same state listed here
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [questions, active, hasSubmitted, isSubmitting, ratings, satisfaction, userSelections, goTo, rate]);

    const RatingPicker = ({ current, onSelect, label }: RatingPickerProps) => (
        <div style={{ marginTop: '15px' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: '#888', marginBottom: '8px' }}>{label}</label>
            <div style={{ display: 'flex', gap: '8px' }}>
                {[1, 2, 3, 4].map(num => (
                    <button
                        key={num}
                        onClick={() => onSelect(current === num ? undefined : num)}
                        style={{
                            flex: 1, padding: '8px', borderRadius: '6px',
                            border: current === num ? '1px solid #0070f3' : '1px solid rgba(128,128,128,0.4)',
                            cursor: 'pointer',
                            background: current === num ? '#0070f3' : 'transparent',
                            transition: 'all 0.2s', fontSize: '0.8rem', color: current === num ? 'white' : 'inherit'
                        }}
                    >
                        {num}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div style={{ color: 'inherit' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <div role="group" aria-label="Show questions" style={{ display: 'flex', border: '1px solid rgba(128,128,128,0.3)', borderRadius: '8px', overflow: 'hidden', fontSize: '0.8rem' }}>
                    {([['all', 'All at once'], ['one', 'One at a time']] as [QuizMode, string][]).map(([m, text]) => (
                        <button key={m} aria-pressed={mode === m} onClick={() => changeMode(m)}
                            style={{ padding: '6px 12px', border: 'none', cursor: 'pointer', color: mode === m ? 'white' : 'inherit', background: mode === m ? '#0070f3' : 'transparent' }}>
                            {text}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <button onClick={() => setShowHelp(h => !h)} aria-expanded={showHelp}
                        style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>
                        ⌨ Shortcuts
                    </button>
                    <span style={{ fontWeight: 'bold', opacity: 0.8, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Timer size={16} aria-hidden="true" /> {formatTime(seconds)}</span>
                </div>
            </div>

            {showHelp && (
                <div style={{ marginBottom: '1rem', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(128,128,128,0.25)', background: 'rgba(128,128,128,0.05)', fontSize: '0.85rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px' }}>
                        {SHORTCUTS.map(([k, what]) => (
                            <React.Fragment key={k}>
                                <kbd style={{ fontFamily: 'inherit', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{k}</kbd><span style={{ opacity: 0.8 }}>{what}</span>
                            </React.Fragment>
                        ))}
                    </div>
                    <p style={{ margin: '8px 0 0', opacity: 0.6, fontSize: '0.75rem' }}>Keys act on the outlined question. Click a question to choose it. An answer is saved to your history once it has a rating.</p>
                </div>
            )}

            {hasSubmitted && (
                <div style={{ padding: '1.5rem', borderRadius: '12px', border: '2px solid #0070f3', marginBottom: '2rem', textAlign: 'center', background: 'rgba(128,128,128,0.05)' }}>
                    <h2 style={{ margin: 0 }}>Quiz Complete!</h2>
                    <p style={{ fontSize: '1.1rem', margin: '10px 0' }}>
                        You scored <strong>{score}</strong>/<strong>{questions.length}</strong> ({percentage.toFixed(1)}%)
                    </p>
                    <div style={{ background: 'rgba(128,128,128,0.2)', height: '8px', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ background: '#0070f3', height: '100%', width: `${percentage}%`, transition: 'width 1s' }} />
                    </div>
                </div>
            )}

            {(mode === 'one' ? questions.slice(active, active + 1) : questions).map((q, i) => {
                const idx = mode === 'one' ? active : i;
                const isActive = idx === active && questions.length > 1;
                const isTracked = hasSubmitted ? !!activityIds[q.id] : ratings[q.id] !== undefined;
                const selected = userSelections[q.id] || [];
                const isCorrect = selected.length === q.correct_answers.length && selected.every(val => q.correct_answers.includes(val));
                const multi = q.correct_answers.length > 1;

                return (
                    <div key={q.id} ref={el => { cardRefs.current[idx] = el; }} onMouseDown={() => setActive(idx)}
                        style={{
                            marginBottom: mode === 'one' ? '1rem' : '2rem', padding: '1.5rem', background: 'rgba(128,128,128,0.05)', borderRadius: '12px', position: 'relative',
                            border: isActive && mode === 'all' ? '1px solid #0070f3' : '1px solid rgba(128,128,128,0.2)',
                            boxShadow: isActive && mode === 'all' ? '0 0 0 1px #0070f3' : 'none', scrollMarginTop: '12px',
                        }}>
                        {hasSubmitted && (
                            <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', fontWeight: 'bold', letterSpacing: '0.04em', color: isCorrect ? '#10b981' : '#ef4444' }}>
                                {isCorrect ? 'CORRECT' : 'INCORRECT'}
                            </div>
                        )}

                        <h3 style={{ marginTop: 0, lineHeight: 1.4 }}>{idx + 1}. {q.question_text}</h3>
                        {multi && (
                            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#3b82f6' }}>
                                Select {q.correct_answers.length}
                                {!hasSubmitted && <span style={{ fontWeight: 'normal', opacity: 0.8 }}> · {selected.length} chosen</span>}
                            </div>
                        )}

                        <div role={hasSubmitted ? undefined : multi ? 'group' : 'radiogroup'} aria-label={`Answers for question ${idx + 1}`}
                            style={{ display: 'grid', gap: '8px', marginTop: '15px' }}>
                            {q.options.map((opt, optIdx) => {
                                const wasSelected = selected.includes(opt);
                                const isOptCorrect = q.correct_answers.includes(opt);

                                if (!hasSubmitted) {
                                    return (
                                        <button
                                            key={optIdx}
                                            role={multi ? 'checkbox' : 'radio'}
                                            aria-checked={wasSelected}
                                            onClick={() => toggleOption(q.id, opt)}
                                            style={{
                                                padding: '12px',
                                                textAlign: 'left',
                                                borderRadius: '8px',
                                                color: 'inherit',
                                                cursor: 'pointer',
                                                backgroundColor: wasSelected ? 'rgba(0,112,243,0.12)' : 'transparent',
                                                border: wasSelected ? '1.5px solid #0070f3' : '1px solid rgba(128,128,128,0.4)',
                                                display: 'flex', gap: '10px', alignItems: 'baseline',
                                            }}
                                        >
                                            <span aria-hidden="true" style={{ flexShrink: 0, width: '1em', textAlign: 'center' }}>{multi ? (wasSelected ? '☑' : '☐') : (wasSelected ? '●' : '○')}</span>
                                            <span style={{ fontWeight: 'bold', opacity: 0.6, flexShrink: 0 }}>{LETTERS[optIdx]}.</span>
                                            <span>{opt}</span>
                                        </button>
                                    );
                                }

                                return <ReviewedOption key={optIdx} letter={LETTERS[optIdx]} text={opt} picked={wasSelected} correct={isOptCorrect} />;
                            })}
                        </div>

                        {hasSubmitted && (
                            <div style={{ marginTop: '20px', borderTop: '1px solid rgba(128,128,128,0.2)', paddingTop: '15px' }}>
                                <div style={{
                                    background: 'rgba(59, 130, 246, 0.1)',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    fontSize: '0.9rem',
                                    marginBottom: '15px',
                                    borderLeft: '4px solid #3b82f6',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    <strong style={{ color: '#3b82f6' }}>Explanation:</strong> {q.explanation}
                                </div>
                            </div>
                        )}

                        <RatingPicker
                            label={hasSubmitted ? "Update Satisfaction (1-4)" : "Confidence Level (1-4)"}
                            current={hasSubmitted ? satisfaction[q.id] : ratings[q.id]}
                            onSelect={(val: number | undefined) => rate(q.id, val)}
                        />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '12px' }}>
                            <ReportQuestion key={q.id} questionId={q.id} />
                            {hasSubmitted ? (
                                isTracked
                                    ? <span style={{ fontSize: '0.65rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', padding: '1px 6px', borderRadius: '3px' }}>✓ SAVED TO HISTORY</span>
                                    : <span style={{ fontSize: '0.65rem', opacity: 0.6, border: '1px solid rgba(128,128,128,0.3)', padding: '1px 6px', borderRadius: '3px' }}>NOT SAVED · rate it to save</span>
                            ) : (
                                <span style={{ fontSize: '0.65rem', opacity: isTracked ? 0.8 : 0.5, border: '1px solid rgba(128,128,128,0.3)', padding: '1px 6px', borderRadius: '3px' }}>
                                    {isTracked ? 'WILL BE SAVED' : 'RATE IT TO SAVE IT'}
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}

            {mode === 'one' && questions.length > 1 && (
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <button onClick={() => goTo(active - 1)} disabled={active === 0}
                            style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.4)', background: 'transparent', color: 'inherit', cursor: 'pointer', opacity: active === 0 ? 0.4 : 1 }}>
                            ← Previous
                        </button>
                        <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>Question {active + 1} of {questions.length}</span>
                        <button onClick={() => goTo(active + 1)} disabled={active === questions.length - 1}
                            style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', background: '#0070f3', color: 'white', cursor: 'pointer', opacity: active === questions.length - 1 ? 0.4 : 1 }}>
                            Next →
                        </button>
                    </div>
                    <div aria-label="Jump to question" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
                        {questions.map((q, i) => {
                            const answered = (userSelections[q.id] || []).length > 0;
                            const sel = userSelections[q.id] || [];
                            const right = hasSubmitted && sel.length === q.correct_answers.length && sel.every(v => q.correct_answers.includes(v));
                            const bg = hasSubmitted ? (right ? '#10b981' : '#ef4444') : answered ? '#444' : 'transparent';
                            return (
                                <button key={q.id} onClick={() => goTo(i)} aria-current={i === active ? 'step' : undefined}
                                    aria-label={`Question ${i + 1}${answered ? ', answered' : ''}`}
                                    style={{
                                        width: '30px', height: '30px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer',
                                        border: i === active ? '2px solid #0070f3' : '1px solid rgba(128,128,128,0.4)',
                                        background: bg, color: hasSubmitted || answered ? 'white' : 'inherit',
                                    }}>
                                    {i + 1}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <button onClick={hasSubmitted ? () => window.location.reload() : handleAllSubmit} disabled={isSubmitting}
                style={{ width: '100%', padding: '15px', background: hasSubmitted ? '#10b981' : '#0070f3', color: 'white', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', transition: 'filter 0.2s' }}>
                {isSubmitting ? "Submitting..." : hasSubmitted ? "Take Another Quiz" : "Submit All Answers"}
            </button>
        </div>
    );
}