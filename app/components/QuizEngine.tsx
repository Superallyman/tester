"use client"

import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/utils/supabase';
import { useSession } from "next-auth/react";
import { decode } from 'html-entities';

// 1. Define a strict interface for the Question object
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

export default function QuizEngine({ questionIds }: QuizEngineProps) {
    const { data: session } = useSession();
    // 2. Replace any[] with Question[]
    const [questions, setQuestions] = useState<Question[]>([]);
    const [userSelections, setUserSelections] = useState<Record<string, string[]>>({});
    const [ratings, setRatings] = useState<Record<string, number>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);

    const [seconds, setSeconds] = useState(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const formatTime = (totalSeconds: number) => {
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const calculateScore = () => {
        let correctCount = 0;
        questions.forEach(q => {
            const selected = userSelections[q.id] || [];
            const isCorrect =
                selected.length === q.correct_answers.length &&
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

            const { data } = await supabase
                .from('questions')
                .select(`*`)
                .in('id', questionIds);

            if (data) {
                const sortedData = questionIds
                    .map(id => data.find(q => q.id === id))
                    .filter((q): q is Question => !!q);

                const decodedData = sortedData.map(q => ({
                    ...q,
                    question_text: decode(q.question_text),
                    options: q.options.map((opt: string) => decode(opt)),
                    explanation: decode(q.explanation)
                }));
                setQuestions(decodedData);

                if (timerRef.current) clearInterval(timerRef.current);
                timerRef.current = setInterval(() => {
                    setSeconds(prev => prev + 1);
                }, 1000);
            }
        }
        fetchQuestions();

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [questionIds]);

    const toggleOption = (qId: string, option: string) => {
        if (hasSubmitted) return;
        setUserSelections(prev => {
            const current = prev[qId] || [];
            const next = current.includes(option)
                ? current.filter(i => i !== option)
                : [...current, option];
            return { ...prev, [qId]: next };
        });
    };

    const handleAllSubmit = async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsSubmitting(true);

        const activities = questions.map(q => {
            const selected = userSelections[q.id] || [];
            const isCorrect =
                selected.length === q.correct_answers.length &&
                selected.every(val => q.correct_answers.includes(val));

            return {
                question_id: q.id,
                is_correct: isCorrect,
                user_rating: ratings[q.id] || 5,
                user_email: session?.user?.email || "anonymous",
            };
        });

        const { error } = await supabase.from('user_activity').insert(activities);
        if (!error) setHasSubmitted(true);
        setIsSubmitting(false);
    };

    // 3. Explicitly type the helper function
    const getOptionStyle = (q: Question, opt: string): React.CSSProperties => {
        const selected = userSelections[q.id] || [];
        const isSelected = selected.includes(opt);
        const isCorrect = q.correct_answers.includes(opt);

        if (!hasSubmitted) {
            return {
                backgroundColor: isSelected ? 'rgba(128, 128, 128, 0.5)' : 'transparent',
                color: 'inherit',
                border: '1px solid #ccc'
            };
        }

        if (isSelected && isCorrect) return { backgroundColor: '#c6f6d5', color: '#22543d', border: '2px solid green' };
        if (isSelected && !isCorrect) return { backgroundColor: '#fed7d7', color: '#822727', border: '2px solid red' };
        if (!isSelected && isCorrect) return { backgroundColor: '#bee3f8', color: '#2a4365', border: '2px solid blue' };

        return { backgroundColor: 'transparent', color: '#a0aec0', border: '1px solid #444', opacity: 0.6 };
    };

    if (questions.length === 0) return <p>Loading questions...</p>;

    return (
        <div>
            <div style={{ textAlign: 'right', marginBottom: '1rem', fontSize: '1.2rem', fontWeight: 'bold' }}>
                ⏱️ {formatTime(seconds)}
            </div>

            {hasSubmitted && (
                <div style={{ padding: '1.5rem', borderRadius: '12px', border: '2px solid #0070f3', marginBottom: '2rem', textAlign: 'center' }}>
                    <h2 style={{ margin: 0 }}>Quiz Complete!</h2>
                    <p style={{ fontSize: '1.2rem', margin: '10px 0' }}>
                        You scored <strong>{score}</strong> out of <strong>{questions.length}</strong> ({percentage.toFixed(1)}%) in {formatTime(seconds)}.
                    </p>
                    <div style={{ background: '#e2e8f0', height: '12px', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ background: '#0070f3', height: '100%', width: `${percentage}%`, transition: 'width 1s ease-in-out' }} />
                    </div>
                </div>
            )}

            {questions.map((q, idx) => (
                <div key={q.id} style={{ marginBottom: '3rem', padding: '1.5rem', border: '1px solid #eee', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>{idx + 1}. {q.question_text}</h3>
                        {hasSubmitted && (
                            <span style={{ 
                                fontWeight: 'bold', 
                                color: (userSelections[q.id]?.every(v => q.correct_answers.includes(v)) && userSelections[q.id]?.length === q.correct_answers.length) ? 'green' : 'red' 
                            }}>
                                {(userSelections[q.id]?.every(v => q.correct_answers.includes(v)) && userSelections[q.id]?.length === q.correct_answers.length) ? 'CORRECT' : 'INCORRECT'}
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {q.options.map((opt: string, optIdx: number) => (
                            <button
                                key={`${q.id}-opt-${optIdx}`}
                                onClick={() => toggleOption(q.id, opt)}
                                disabled={hasSubmitted}
                                style={{
                                    padding: '12px', textAlign: 'left', borderRadius: '6px',
                                    cursor: hasSubmitted ? 'default' : 'pointer',
                                    ...getOptionStyle(q, opt)
                                }}
                            >
                                {opt}
                            </button>
                        ))}
                    </div>

                    {hasSubmitted && (
                        <div style={{ marginTop: '15px', padding: '15px', borderRadius: '6px', fontSize: '0.9rem', borderLeft: '4px solid #0070f3' }}>
                            <h3>Category: {q.category}</h3>
                            <strong>Why?</strong> {q.explanation}
                        </div>
                    )}

                    {!hasSubmitted && (
                        <div style={{ marginTop: '15px', position: 'relative' }}>
                            <div style={{ position: 'relative', width: '100%' }}>
                                <input
                                    type="range"
                                    min="1"
                                    max="10"
                                    value={ratings[q.id] || 5}
                                    onChange={(e) =>
                                        setRatings({ ...ratings, [q.id]: parseInt(e.target.value) })
                                    }
                                    style={{ width: '100%' }}
                                />
                                <label style={{ fontSize: '0.6rem', display: 'block' }}>
                                    Rate your confidence level (1=easy to 10=hard af):
                                </label>

                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '-25px',
                                        left: `calc(${((ratings[q.id] || 5) - 1) * 10}% - 10px)`,
                                        background: '#000',
                                        color: '#fff',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem'
                                    }}
                                >
                                    {ratings[q.id] || 5}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ))}

            {!hasSubmitted ? (
                <button
                    onClick={handleAllSubmit}
                    disabled={isSubmitting}
                    style={{ width: '100%', padding: '15px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    {isSubmitting ? "Submitting..." : "Submit All Answers"}
                </button>
            ) : (
                <button
                    onClick={() => window.location.reload()}
                    style={{ width: '100%', padding: '15px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                >
                    Take Another Quiz
                </button>
            )}
        </div>
    );
}