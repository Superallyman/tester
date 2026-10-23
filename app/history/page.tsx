"use client"

import React, { useEffect, useState, useCallback } from 'react';
import { api, qs } from '@/utils/api';
import { useSession } from "next-auth/react";

import { smartClean } from '@/utils/formatters';
import { FrostedSelect } from '../components/FrostedSelect';
import ReportQuestion from '../components/ReportQuestion';
import ReviewedOption from '../components/ReviewedOption';
import { Trash2 } from 'lucide-react';

interface HistoryItem {
    id: string;
    question_id: string;
    attempted_at: string;
    updated_at: string;
    is_correct: boolean;
    user_rating: number | null;
    satisfaction_rating: number | null;
    submitted_answer: string[];
    questions: {
        question_text: string;
        options: string[];
        correct_answers: string[];
        explanation: string;
        category: string;
    };
}

const PAGE_SIZE = 100;

// Define the specific types for our filters to avoid 'any'
type StatusFilter = 'all' | 'correct' | 'incorrect';
type SortOrder = 'newest' | 'oldest' | 'confidence' | 'satisfaction';

export default function HistoryPage() {
    const { data: session } = useSession();

    // Data State
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    // Filter States
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [satFilter, setSatFilter] = useState<number | 'all'>('all');
    const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
    const [selectedCats, setSelectedCats] = useState<string[]>([]);

    // UI States
    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [showCatDropdown, setShowCatDropdown] = useState(false);

    // Helper to decode HTML entities and preserve formatting
    const decodeHTML = (html: string) => {
        if (typeof window === 'undefined') return html;
        const txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    };

    // 1. Fetch Categories
    useEffect(() => {
        async function getCategories() {
            const data = await api<{ cat_name: string }[]>('/api/categories').catch(() => null);
            if (data) {
                const uniqueCats = (data as { cat_name: string }[])
                    .map(item => item.cat_name?.trim() || 'General')
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .sort();
                setAvailableCategories(uniqueCats);
            }
        }
        getCategories();
    }, []);

    // 2. Main Fetch Logic
    // 2. Main Fetch Logic
    const fetchHistory = useCallback(async (isNewSearch: boolean) => {
        if (!session?.user?.email) return;
        setLoading(true);

        const start = isNewSearch ? 0 : page * PAGE_SIZE;

        let data: unknown[] | null = null;
        let error: unknown = null;
        try {
            data = await api<unknown[]>(`/api/activity/history${qs({
                status: statusFilter === 'all' ? undefined : statusFilter,
                sat: satFilter === 'all' ? undefined : satFilter,
                category: selectedCats,
                sort: sortOrder,
                offset: start,
                limit: PAGE_SIZE,
            })}`);
        } catch (err) {
            error = err;
        }

        if (error) {
            console.error(error);
        } else if (data) {
            // We cast the data to HistoryItem[] to satisfy TS, then map to clean
            const rawData = data as unknown as HistoryItem[];

            const cleanedItems: HistoryItem[] = rawData.map((item) => ({
                ...item,
                // Clean the answers the user actually submitted
                submitted_answer: (item.submitted_answer || []).map((ans) => smartClean(ans)),
                questions: {
                    ...item.questions,
                    question_text: smartClean(item.questions.question_text),
                    options: (item.questions.options || []).map((opt) => smartClean(opt)),
                    correct_answers: (item.questions.correct_answers || []).map((ans) => smartClean(ans)),
                    explanation: smartClean(item.questions.explanation),
                    category: smartClean(item.questions.category)
                }
            }));

            setHistory(prev => isNewSearch ? cleanedItems : [...prev, ...cleanedItems]);
            setHasMore(cleanedItems.length === PAGE_SIZE);

            if (isNewSearch) setPage(1);
            else setPage(prev => prev + 1);
        }

        setLoading(false);
    }, [session, statusFilter, satFilter, sortOrder, selectedCats, page]);

    // Fixed Warning: Added fetchHistory to dependencies
    useEffect(() => {
        fetchHistory(true);
    }, [fetchHistory]);

    const handleUpdateSatisfaction = async (id: string, score: number) => {
        const currentItem = history.find(i => i.id === id);
        const newScore = currentItem?.satisfaction_rating === score ? null : score;

        setHistory(prev => prev.map(item => item.id === id ? { ...item, satisfaction_rating: newScore } : item));
        await api(`/api/activity/${id}`, { method: 'PATCH', body: { satisfaction_rating: newScore } }).catch(console.error);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this attempt?")) return;
        setHistory(prev => prev.filter(item => item.id !== id));
        await api(`/api/activity/${id}`, { method: 'DELETE' }).catch(console.error);
    };


    return (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem', color: 'inherit' }}>
            <h1 style={{ marginBottom: '1.5rem', fontWeight: 'bold' }}>History & Review</h1>

            {/* Filter Toolbar */}
            <div style={{ background: 'rgba(128,128,128,0.05)', padding: '20px', borderRadius: '12px', marginBottom: '2rem', border: '1px solid rgba(128,128,128,0.2)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>

                <div>
                    <FrostedSelect
                        label="SATISFACTION"
                        value={satFilter}
                        onChange={(val) => setSatFilter(val === 'all' ? 'all' : Number(val))}
                        options={[
                            { label: "All Scores", value: "all" },
                            { label: "1 - Poor", value: 1 },
                            { label: "2 - Fair", value: 2 },
                            { label: "3 - Good", value: 3 },
                            { label: "4 - Excellent", value: 4 }
                        ]}
                    />
                </div>
                <div>
                    <FrostedSelect
                        label="STATUS"
                        value={statusFilter}
                        onChange={(val) => setStatusFilter(val as StatusFilter)}
                        options={[
                            { label: "All Results", value: "all" },
                            { label: "Correct", value: "correct" },
                            { label: "Incorrect", value: "incorrect" }
                        ]}
                    />
                </div>
                <div>
                    <FrostedSelect
                        label="SORT ORDER"
                        value={sortOrder}
                        onChange={(val) => setSortOrder(val as SortOrder)}
                        options={[
                            { label: "Newest", value: "newest" },
                            { label: "Oldest", value: "oldest" },
                            { label: "Confidence", value: "confidence" },
                            { label: "Satisfaction", value: "satisfaction" }
                        ]}
                    />
                </div>

                <div style={{ position: 'relative' }}>
                    <label
                        style={{
                            display: 'block',
                            fontSize: '0.65rem',
                            opacity: 0.6,
                            marginBottom: '5px',
                            fontWeight: 'bold',
                        }}
                    >
                        CATEGORY
                    </label>
                    <button
                        onClick={() => setShowCatDropdown(!showCatDropdown)}
                        style={{
                            width: '100%',
                            padding: '10px',
                            textAlign: 'left',
                            color: 'inherit',
                            background: 'rgba(128,128,128,0.2)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            border: '1px solid rgba(128,128,128,0.2)',
                            borderRadius: '8px',
                        }}
                    >
                        {selectedCats.length === 0 ? 'All Categories' : `${selectedCats.length} selected`}
                    </button>
                    {showCatDropdown && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                marginTop: '6px',
                                zIndex: 1000,
                                padding: '8px',
                                maxHeight: '500px',
                                overflowY: 'auto',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
                                background: 'rgba(128,128,128,0.2)',
                                backdropFilter: 'blur(8px)',
                                WebkitBackdropFilter: 'blur(8px)',
                                border: '1px solid rgba(128,128,128,0.3)',
                                borderRadius: '8px',
                            }}
                        >
                            {availableCategories.map((cat) => (
                                <label
                                    key={cat}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        marginBottom: '5px',
                                        fontSize: '0.875rem', // Slightly increased font size for clarity
                                        cursor: 'pointer',
                                        padding: '8px',
                                        borderRadius: '6px',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedCats.includes(cat)}
                                        onChange={() =>
                                            setSelectedCats((prev) =>
                                                prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                                            )
                                        }
                                        style={{ marginRight: '10px' }}
                                    />
                                    {cat}
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* <div style={{ position: 'relative' }}>
                    <label style={{ display: 'block', fontSize: '0.65rem', opacity: 0.6, marginBottom: '5px', fontWeight: 'bold' }}>CATEGORY</label>
                    <button onClick={() => setShowCatDropdown(!showCatDropdown)} style={{ width: '100%', padding: '10px', background: 'rgba(128,128,128,0.1)', color: 'inherit', border: '1px solid rgba(128,128,128,0.2)', borderRadius: '8px', textAlign: 'left' }}>
                        {selectedCats.length === 0 ? "All Categories" : `${selectedCats.length} selected`}
                    </button>
                    {showCatDropdown && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'rgba(128,128,128,0.2)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: 'inherit', border: '1px solid rgba(128,128,128,0.3)', borderRadius: '8px', zIndex: 10, padding: '10px', maxHeight: '250px', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.4)' }}>
                            {availableCategories.map(cat => (
                                <label key={cat} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={selectedCats.includes(cat)} onChange={() => setSelectedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])} style={{ marginRight: '10px' }} />
                                    {cat}
                                </label>
                            ))}
                        </div>
                    )}
                </div> */}
            </div>

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {history.map((item) => (
                    <div key={item.id} style={{ padding: '1.5rem', background: 'rgba(128,128,128,0.05)', borderRadius: '12px', borderLeft: `6px solid ${item.is_correct ? '#10b981' : '#ef4444'}`, borderTop: '1px solid rgba(128,128,128,0.1)', borderRight: '1px solid rgba(128,128,128,0.1)', borderBottom: '1px solid rgba(128,128,128,0.1)', position: 'relative' }}>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '15px' }}>
                            <div style={{ minWidth: 0 }}>
                                <span style={{ background: 'rgba(128,128,128,0.15)', padding: '3px 10px', borderRadius: '6px', fontSize: '0.7rem', color: '#3b82f6', fontWeight: 'bold' }}>{item.questions.category}</span>
                                <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '8px' }}>
                                    {new Date(item.attempted_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.6rem', opacity: 0.6, marginBottom: '4px', fontWeight: 'bold' }}>CONFIDENCE</label>
                                    <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>{item.user_rating != null ? `${item.user_rating}/4` : '—'}</span>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.6rem', opacity: 0.6, marginBottom: '4px', fontWeight: 'bold' }}>SATISFACTION</label>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        {[1, 2, 3, 4].map(num => (
                                            <button
                                                key={num}
                                                onClick={() => handleUpdateSatisfaction(item.id, num)}
                                                style={{
                                                    width: '24px', height: '24px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                                                    background: item.satisfaction_rating === num ? '#0070f3' : 'rgba(128,128,128,0.2)',
                                                    color: item.satisfaction_rating === num ? 'white' : 'inherit', fontSize: '0.7rem',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {num}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button onClick={() => handleDelete(item.id)} aria-label="Delete this attempt" title="Delete this attempt"
                                    style={{ background: 'none', border: 'none', opacity: 0.45, cursor: 'pointer', color: 'inherit', padding: '4px', display: 'flex' }}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>

                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1.2rem', lineHeight: '1.5', fontWeight: '500' }}>{decodeHTML(item.questions.question_text)}</h3>

                        <div style={{ display: 'grid', gap: '8px', marginBottom: '15px' }}>
                            {item.questions.options.map((opt, idx) => {
                                const decodedOpt = decodeHTML(opt);
                                const wasSelected = item.submitted_answer?.includes(opt);
                                const isCorrect = item.questions.correct_answers.includes(opt);

                                return <ReviewedOption key={idx} letter={String.fromCharCode(65 + idx)} text={decodedOpt} picked={!!wasSelected} correct={isCorrect} />;
                            })}
                        </div>

                        <div style={{
                            fontSize: '0.85rem',
                            opacity: 0.9,
                            background: 'rgba(128,128,128,0.08)',
                            padding: '14px',
                            borderRadius: '8px',
                            border: '1px solid rgba(128,128,128,0.1)',
                            whiteSpace: 'pre-wrap'
                        }}>
                            <strong style={{ color: '#3b82f6', display: 'block', marginBottom: '8px', fontSize: '0.75rem', letterSpacing: '0.05em' }}>EXPLANATION:</strong>
                            {decodeHTML(item.questions.explanation)}
                        </div>
                        <div style={{ marginTop: '10px' }}><ReportQuestion questionId={item.question_id} /></div>
                    </div>
                ))}
            </div>

            {/* Pagination Button */}
            {hasMore && (
                <button
                    onClick={() => fetchHistory(false)}
                    disabled={loading}
                    style={{ width: '100%', marginTop: '2.5rem', padding: '16px', background: 'rgba(128,128,128,0.1)', border: '1px solid rgba(128,128,128,0.2)', borderRadius: '12px', color: '#3b82f6', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    {loading ? "Loading results..." : "Load More Attempts"}
                </button>
            )}

            {!hasMore && history.length > 0 && (
                <div style={{ textAlign: 'center', marginTop: '3rem', opacity: 0.4, fontSize: '0.85rem' }}>
                    End of review history
                </div>
            )}
        </div>
    );
}