"use client"

import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/utils/supabase';
import { useSession } from "next-auth/react";

import { smartClean } from '@/utils/formatters';

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

// Fixed Error: Specified the type for RatingPicker props
interface RatingPickerProps {
    current: number | undefined;
    onSelect: (val: number | undefined) => void;
    label: string;
}

export default function QuizEngine({ questionIds }: QuizEngineProps) {
    const { data: session } = useSession();
    const [questions, setQuestions] = useState<Question[]>([]);
    const [userSelections, setUserSelections] = useState<Record<string, string[]>>({});
    const [ratings, setRatings] = useState<Record<string, number | undefined>>({});
    const [satisfaction, setSatisfaction] = useState<Record<string, number | undefined>>({});
    const [activityIds, setActivityIds] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Helper to decode HTML entities safely
    // const decodeHTML = (html: string) => {
    //     if (typeof window === 'undefined') return html;
    //     const txt = document.createElement("textarea");
    //     txt.innerHTML = html;
    //     return txt.value;
    // };

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
            const { data } = await supabase.from('questions').select(`*`).in('id', questionIds);
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

    const toggleOption = (qId: string, option: string) => {
        if (hasSubmitted) return;
        setUserSelections(prev => {
            const current = prev[qId] || [];
            const next = current.includes(option) ? current.filter(i => i !== option) : [...current, option];
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
                    user_email: session?.user?.email || "anonymous",
                    submitted_answer: selected,
                };
            });

        if (activitiesToInsert.length > 0) {
            const { data, error } = await supabase.from('user_activity').insert(activitiesToInsert).select('id, question_id');
            if (!error && data) {
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
            const { error } = await supabase.from('user_activity').delete().eq('id', dbId);
            if (!error) {
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

            const { data, error } = await supabase.from('user_activity').insert({
                question_id: qId,
                is_correct: isCorrect,
                user_rating: scoreVal,
                satisfaction_rating: scoreVal,
                user_email: session?.user?.email || "anonymous",
                submitted_answer: selected,
            }).select('id').single();

            if (!error && data) {
                setActivityIds(prev => ({ ...prev, [qId]: data.id }));
            }
            return;
        }

        if (dbId && scoreVal !== undefined) {
            await supabase.from('user_activity').update({ satisfaction_rating: scoreVal }).eq('id', dbId);
        }
    };

    const RatingPicker = ({ current, onSelect, label }: RatingPickerProps) => (
        <div style={{ marginTop: '15px' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: '#888', marginBottom: '8px' }}>{label}</label>
            <div style={{ display: 'flex', gap: '8px' }}>
                {[1, 2, 3, 4].map(num => (
                    <button
                        key={num}
                        onClick={() => onSelect(current === num ? undefined : num)}
                        style={{
                            flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #444',
                            cursor: 'pointer',
                            background: current === num ? '#0070f3' : 'transparent',
                            transition: 'all 0.2s', fontSize: '0.8rem', color: 'inherit'
                        }}
                    >
                        {num}
                    </button>
                ))}
            </div>
        </div>
    );

    const getOptionStyle = (q: Question, opt: string): React.CSSProperties => {
        const selected = userSelections[q.id] || [];
        const isSelected = selected.includes(opt);
        if (!hasSubmitted) return { backgroundColor: isSelected ? '#444' : 'transparent', border: '1px solid #444' };
        const isCorrect = q.correct_answers.includes(opt);
        if (isSelected && isCorrect) return { backgroundColor: '#10b98133', border: '1px solid #10b981', color: '#10b981' };
        if (isSelected && !isCorrect) return { backgroundColor: '#ef444433', border: '1px solid #ef4444', color: '#ef4444' };
        if (!isSelected && isCorrect) return { backgroundColor: '#3b82f633', border: '1px solid #3b82f6', color: '#3b82f6' };
        return { opacity: 0.5, border: '1px solid #222' };
    };

    return (
        <div style={{ color: 'inherit' }}>
            <div style={{ textAlign: 'right', marginBottom: '1rem', fontWeight: 'bold', opacity: 0.8 }}>⏱️ {formatTime(seconds)}</div>

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

            {questions.map((q, idx) => {
                const isTracked = hasSubmitted ? !!activityIds[q.id] : ratings[q.id] !== undefined;
                const selected = userSelections[q.id] || [];
                const isCorrect = selected.length === q.correct_answers.length && selected.every(val => q.correct_answers.includes(val));

                return (
                    <div key={q.id} style={{ marginBottom: '2rem', padding: '1.5rem', background: 'rgba(128,128,128,0.05)', borderRadius: '12px', border: '1px solid rgba(128,128,128,0.2)', position: 'relative' }}>
                        <div style={{ marginBottom: '1rem', padding: '0.5rem' }}>
                            {hasSubmitted && (
                                <span style={{ fontSize: '1.0rem', fontWeight: 'bold', color: isCorrect ? '#10b981' : '#ef4444' }}>
                                    {isCorrect ? 'CORRECT' : 'INCORRECT'}
                                </span>
                            )}
                        </div>

                        <h3 style={{ marginTop: 0, lineHeight: 1.4 }}>{idx + 1}. {q.question_text}</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                            {q.options.map((opt, optIdx) => (
                                <button key={optIdx} onClick={() => toggleOption(q.id, opt)} disabled={hasSubmitted}
                                    style={{ padding: '12px', textAlign: 'left', borderRadius: '8px', color: 'inherit', cursor: hasSubmitted ? 'default' : 'pointer', ...getOptionStyle(q, opt) }}>
                                    {opt}
                                </button>
                            ))}
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
                            onSelect={(val: number | undefined) => hasSubmitted ? handleSatisfactionUpdate(q.id, val) : setRatings({ ...ratings, [q.id]: val })}
                        />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
                            {!isTracked ? (
                                <span style={{ fontSize: '0.6rem', opacity: 0.5, border: '1px solid rgba(128,128,128,0.3)', padding: '1px 6px', borderRadius: '3px', letterSpacing: '0.03rem' }}>NOT TRACKED</span>
                            ) : (
                                <span style={{ fontSize: '0.6rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', padding: '1px 6px', borderRadius: '3px' }}>✓ SAVED</span>
                            )}
                        </div>
                    </div>
                );
            })}

            <button onClick={hasSubmitted ? () => window.location.reload() : handleAllSubmit} disabled={isSubmitting}
                style={{ width: '100%', padding: '15px', background: hasSubmitted ? '#10b981' : '#0070f3', color: 'white', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', transition: 'filter 0.2s' }}>
                {isSubmitting ? "Submitting..." : hasSubmitted ? "Take Another Quiz" : "Submit All Answers"}
            </button>
        </div>
    );
}