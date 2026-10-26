"use client"

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { api } from '@/utils/api';

import { smartClean } from '@/utils/formatters';
import ReportQuestion from './ReportQuestion';
import ReviewedOption from './ReviewedOption';
import QuestionNotes from './QuestionNotes';
import { useNotes } from './useNotes';
import DifficultyLine from './DifficultyLine';
import { useDifficulty } from './useDifficulty';
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
    const { notes, save: saveNote } = useNotes(questionIds);
    // Only after submitting: knowing a question is "hard" beforehand would be a hint
    const difficulty = useDifficulty(questionIds, hasSubmitted);

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
        <div style={{ marginTop: 16 }}>
            <span className="orbit-label" style={{ display: 'block', marginBottom: 8 }}>{label}</span>
            <div style={{ display: 'flex', gap: 8 }} role="group" aria-label={label}>
                {[1, 2, 3, 4].map(num => (
                    <button key={num} aria-pressed={current === num} onClick={() => onSelect(current === num ? undefined : num)}
                        className="orbit-option" style={{ flex: 1, justifyContent: 'center', padding: '9px 0', fontWeight: 600 }}>
                        {num}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: '1rem' }}>
                <div className="orbit-segment" role="group" aria-label="Show questions">
                    {([['all', 'All at once'], ['one', 'One at a time']] as [QuizMode, string][]).map(([m, text]) => (
                        <button key={m} aria-pressed={mode === m} onClick={() => changeMode(m)}>{text}</button>
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <button onClick={() => setShowHelp(h => !h)} aria-expanded={showHelp} className="orbit-btn orbit-btn--ghost">Shortcuts</button>
                    <span style={{ fontWeight: 300, fontSize: '1.15rem', display: 'inline-flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
                        <Timer size={16} aria-hidden="true" style={{ opacity: 0.6 }} /> {formatTime(seconds)}
                    </span>
                </div>
            </div>

            {showHelp && (
                <div className="orbit-card" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 18px' }}>
                        {SHORTCUTS.map(([k, what]) => (
                            <React.Fragment key={k}>
                                <kbd className="orbit-label" style={{ color: 'inherit', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>{k}</kbd><span className="orbit-body" style={{ fontSize: '0.85rem' }}>{what}</span>
                            </React.Fragment>
                        ))}
                    </div>
                    <p className="orbit-muted" style={{ marginTop: 10 }}>Keys act on the outlined question. Click a question to choose it. An answer is saved to your history once it has a rating.</p>
                </div>
            )}

            {hasSubmitted && (
                <div className="orbit-card" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px 28px', flexWrap: 'wrap' }}>
                    <div>
                        <h2 className="orbit-label" style={{ margin: 0 }}>Quiz Complete!</h2>
                        <div className="orbit-stat" style={{ marginTop: 8 }}>{percentage.toFixed(0)}%</div>
                    </div>
                    <div style={{ flex: '1 1 220px' }}>
                        <p className="orbit-body">You scored <strong>{score}</strong>/<strong>{questions.length}</strong> ({percentage.toFixed(1)}%)</p>
                        <div className={`orbit-progress ${percentage >= 70 ? 'orbit-progress--good' : ''}`} style={{ marginTop: 10 }}>
                            <span style={{ width: `${percentage}%`, transition: 'width 1s' }} />
                        </div>
                    </div>
                </div>
            )}

            {(mode === 'one' ? questions.slice(active, active + 1) : questions).map((q, i) => {
                const idx = mode === 'one' ? active : i;
                const isActive = idx === active && questions.length > 1 && mode === 'all';
                const isTracked = hasSubmitted ? !!activityIds[q.id] : ratings[q.id] !== undefined;
                const selected = userSelections[q.id] || [];
                const isCorrect = selected.length === q.correct_answers.length && selected.every(val => q.correct_answers.includes(val));
                const multi = q.correct_answers.length > 1;

                return (
                    <div key={q.id} ref={el => { cardRefs.current[idx] = el; }} onMouseDown={() => setActive(idx)} className="orbit-card"
                        style={{
                            marginBottom: mode === 'one' ? '1rem' : '1.5rem', padding: '1.4rem', scrollMarginTop: '80px',
                            ...(isActive ? { borderColor: 'color-mix(in srgb, var(--orbit-accent) 70%, transparent)', boxShadow: 'inset 0 1px 0 var(--orbit-glass-edge), 0 0 22px color-mix(in srgb, var(--orbit-accent) 22%, transparent)' } : {}),
                        }}>
                        {hasSubmitted && (
                            <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px 12px' }}>
                                <span className="orbit-label" style={{ color: isCorrect ? 'var(--orbit-good)' : 'var(--orbit-bad)' }}>
                                    {isCorrect ? 'Correct' : 'Incorrect'}
                                </span>
                                <DifficultyLine stat={difficulty[q.id]} />
                            </div>
                        )}

                        <h3 style={{ marginTop: 0, marginBottom: 6, lineHeight: 1.45, fontSize: '1.08rem', fontWeight: 500 }}>
                            <span style={{ opacity: 0.45, fontWeight: 300, marginRight: 8 }}>{idx + 1}.</span>{q.question_text}
                        </h3>
                        {multi && (
                            <div className="orbit-label" style={{ color: 'var(--orbit-accent)', opacity: 1 }}>
                                Select {q.correct_answers.length}
                                {!hasSubmitted && <span style={{ color: 'var(--orbit-ink-soft)' }}> · {selected.length} chosen</span>}
                            </div>
                        )}

                        <div role={hasSubmitted ? undefined : multi ? 'group' : 'radiogroup'} aria-label={`Answers for question ${idx + 1}`}
                            style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                            {q.options.map((opt, optIdx) => {
                                const wasSelected = selected.includes(opt);
                                const isOptCorrect = q.correct_answers.includes(opt);

                                if (!hasSubmitted) {
                                    return (
                                        <button key={optIdx} role={multi ? 'checkbox' : 'radio'} aria-checked={wasSelected}
                                            onClick={() => toggleOption(q.id, opt)} className="orbit-option" style={{ alignItems: 'baseline' }}>
                                            <span aria-hidden="true" style={{ flexShrink: 0, width: '1em', textAlign: 'center', opacity: wasSelected ? 1 : 0.5 }}>{multi ? (wasSelected ? '☑' : '☐') : (wasSelected ? '●' : '○')}</span>
                                            <span className="orbit-label" style={{ flexShrink: 0, color: 'inherit' }}>{LETTERS[optIdx]}.</span>
                                            <span>{opt}</span>
                                        </button>
                                    );
                                }

                                return <ReviewedOption key={optIdx} letter={LETTERS[optIdx]} text={opt} picked={wasSelected} correct={isOptCorrect} />;
                            })}
                        </div>

                        {hasSubmitted && (
                            <div className="orbit-glass" style={{ marginTop: 18, padding: '12px 14px', borderRadius: 'var(--orbit-radius)', fontSize: '0.9rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', boxShadow: 'inset 3px 0 0 var(--orbit-accent), var(--orbit-glass-shadow)' }}>
                                <span className="orbit-label" style={{ display: 'block', marginBottom: 6 }}>Explanation:</span>{q.explanation}
                            </div>
                        )}

                        <RatingPicker
                            label={hasSubmitted ? "Update Satisfaction (1-4)" : "Confidence Level (1-4)"}
                            current={hasSubmitted ? satisfaction[q.id] : ratings[q.id]}
                            onSelect={(val: number | undefined) => rate(q.id, val)}
                        />

                        <div style={{ marginTop: 14 }}>
                            <QuestionNotes value={notes[q.id]} onSave={patch => saveNote(q.id, patch)} showNote={hasSubmitted} />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                            <ReportQuestion key={q.id} questionId={q.id} />
                            {hasSubmitted ? (
                                isTracked
                                    ? <span className="orbit-badge orbit-badge--good">✓ Saved to history</span>
                                    : <span className="orbit-badge" style={{ opacity: 0.7 }}>Not saved · rate it to save</span>
                            ) : (
                                <span className="orbit-badge" style={{ opacity: isTracked ? 0.9 : 0.55 }}>{isTracked ? 'Will be saved' : 'Rate it to save it'}</span>
                            )}
                        </div>
                    </div>
                );
            })}

            {mode === 'one' && questions.length > 1 && (
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <button onClick={() => goTo(active - 1)} disabled={active === 0} className="orbit-btn">← Previous</button>
                        <span className="orbit-label">Question {active + 1} of {questions.length}</span>
                        <button onClick={() => goTo(active + 1)} disabled={active === questions.length - 1} className="orbit-btn orbit-btn--primary">Next →</button>
                    </div>
                    <div aria-label="Jump to question" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                        {questions.map((q, i) => {
                            const answered = (userSelections[q.id] || []).length > 0;
                            const sel = userSelections[q.id] || [];
                            const right = hasSubmitted && sel.length === q.correct_answers.length && sel.every(v => q.correct_answers.includes(v));
                            const tone = hasSubmitted ? (right ? 'var(--orbit-good)' : 'var(--orbit-bad)') : answered ? 'var(--orbit-ink)' : null;
                            return (
                                <button key={q.id} onClick={() => goTo(i)} aria-current={i === active ? 'step' : undefined}
                                    aria-label={`Question ${i + 1}${answered ? ', answered' : ''}`} className="orbit-glass"
                                    style={{
                                        width: 32, height: 32, borderRadius: 'var(--orbit-radius)', fontSize: '0.75rem', cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
                                        borderColor: i === active ? 'var(--orbit-accent)' : tone ?? undefined,
                                        boxShadow: i === active ? '0 0 12px color-mix(in srgb, var(--orbit-accent) 40%, transparent)' : tone ? `inset 0 -2px 0 ${tone}` : undefined,
                                    }}>
                                    {i + 1}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <button onClick={hasSubmitted ? () => window.location.reload() : handleAllSubmit} disabled={isSubmitting}
                className="orbit-btn orbit-btn--primary" style={{ width: '100%', padding: 15 }}>
                {isSubmitting ? "Submitting..." : hasSubmitted ? "Take Another Quiz" : "Submit All Answers"}
            </button>
        </div>
    );
}
