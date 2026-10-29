"use client"

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api, qs } from '@/utils/api';
import { useSession } from "next-auth/react";

import { smartClean } from '@/utils/formatters';
import { FrostedSelect } from '../components/FrostedSelect';
import ReportQuestion from '../components/ReportQuestion';
import ReviewedOption from '../components/ReviewedOption';
import QuestionNotes from '../components/QuestionNotes';
import { useNotes } from '../components/useNotes';
import DifficultyLine from '../components/DifficultyLine';
import { useDifficulty } from '../components/useDifficulty';
import { useSimpleReveal } from '../components/useSimpleReveal';
import SimpleRevealSwitch from '../components/SimpleRevealSwitch';
import { Trash2 } from 'lucide-react';
import { edge } from '@/utils/orbitStyles';

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
type StatusFilter = 'all' | 'correct' | 'incorrect' | 'skipped';
type SortOrder = 'newest' | 'oldest' | 'confidence' | 'satisfaction';

export default function HistoryPage() {
    const { data: session } = useSession();

    // Data State
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const historyQuestionIds = useMemo(() => [...new Set(history.map(h => h.question_id))], [history]);
    const { notes, save: saveNote } = useNotes(historyQuestionIds);
    const difficulty = useDifficulty(historyQuestionIds);
    // The same account setting Quick Test's results use
    const [simpleReveal, setSimpleReveal] = useSimpleReveal();
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);

    // Filter States
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [satFilter, setSatFilter] = useState<number | 'all'>('all');
    const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
    const [selectedCats, setSelectedCats] = useState<string[]>([]);
    const [mastery, setMastery] = useState<'all' | 'mastered' | 'unmastered'>('all');
    const [saved, setSaved] = useState<'all' | 'bookmarked' | 'notes'>('all');
    const [difficultyFilter, setDifficultyFilter] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');
    const [confidence, setConfidence] = useState<number | 'all'>('all');
    const [days, setDays] = useState<'all' | '7' | '30' | '90'>('all');
    const [latestOnly, setLatestOnly] = useState(false);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [total, setTotal] = useState<number | null>(null);

    // Search as you type, once typing pauses
    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput.trim()), 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    const filters = useMemo(() => ({
        status: statusFilter === 'all' ? undefined : statusFilter,
        sat: satFilter === 'all' ? undefined : satFilter,
        confidence: confidence === 'all' ? undefined : confidence,
        category: selectedCats,
        mastery: mastery === 'all' ? undefined : mastery,
        saved: saved === 'all' ? undefined : saved,
        difficulty: difficultyFilter === 'all' ? undefined : difficultyFilter,
        days: days === 'all' ? undefined : days,
        q: search || undefined,
        latest: latestOnly ? '1' : undefined,
    }), [statusFilter, satFilter, confidence, selectedCats, mastery, saved, difficultyFilter, days, search, latestOnly]);
    const activeFilters = Object.values(filters).filter(v => Array.isArray(v) ? v.length : v !== undefined).length;
    const clearFilters = () => {
        setStatusFilter('all'); setSatFilter('all'); setConfidence('all'); setSelectedCats([]); setMastery('all');
        setSaved('all'); setDifficultyFilter('all'); setDays('all'); setLatestOnly(false); setSearchInput(''); setSearch('');
    };

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

    // 2. Main Fetch Logic. The page lives in a ref so loading more doesn't re-run the fresh-search effect, and
    // only the latest request may write, so a slow response can't overwrite newer filters
    const email = session?.user?.email;
    const pageRef = useRef(0);
    const requestId = useRef(0);
    const fetchHistory = useCallback(async (isNewSearch: boolean) => {
        if (!email) return;
        const id = ++requestId.current;
        setLoading(true);

        const start = isNewSearch ? 0 : pageRef.current * PAGE_SIZE;

        let data: unknown[] | null = null;
        let error: unknown = null;
        try {
            const [rows, count] = await Promise.all([
                api<unknown[]>(`/api/activity/history${qs({ ...filters, sort: sortOrder, offset: start, limit: PAGE_SIZE })}`),
                isNewSearch ? api<{ total: number }>(`/api/activity/history${qs({ ...filters, count: '1' })}`) : Promise.resolve(null),
            ]);
            data = rows;
            if (count) setTotal(count.total);
        } catch (err) {
            error = err;
        }
        if (id !== requestId.current) return;

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

            pageRef.current = isNewSearch ? 1 : pageRef.current + 1;
        }

        setLoading(false);
    }, [email, filters, sortOrder]);

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
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1rem 4rem' }}>
            <p className="orbit-label">History</p>
            <h1 className="orbit-title" style={{ margin: '6px 0 1.5rem' }}>History &amp; Review</h1>

            {/* Filter Toolbar */}
            <div className="orbit-card orbit-stack" style={{ marginBottom: '1.25rem', gap: 14, position: 'relative', zIndex: 5 }}>
                <input className="orbit-input" type="search" value={searchInput} onChange={e => setSearchInput(e.target.value)}
                    placeholder="Search your history: question, options or explanation" aria-label="Search history" />
                <div className="grid grid-cols-2 md:grid-cols-3" style={{ gap: 12 }}>
                    <FrostedSelect label="Result" value={statusFilter} onChange={val => setStatusFilter(val as StatusFilter)}
                        options={[{ label: 'All results', value: 'all' }, { label: 'Correct', value: 'correct' }, { label: 'Incorrect', value: 'incorrect' }, { label: 'Skipped', value: 'skipped' }]} />
                    <FrostedSelect label="Mastery" value={mastery} onChange={val => setMastery(val as typeof mastery)}
                        options={[{ label: 'Any', value: 'all' }, { label: 'Mastered', value: 'mastered' }, { label: 'Not mastered', value: 'unmastered' }]} />
                    <FrostedSelect label="Saved" value={saved} onChange={val => setSaved(val as typeof saved)}
                        options={[{ label: 'Everything', value: 'all' }, { label: 'Bookmarked', value: 'bookmarked' }, { label: 'With a note', value: 'notes' }]} />
                    <FrostedSelect label="Difficulty" value={difficultyFilter} onChange={val => setDifficultyFilter(val as typeof difficultyFilter)}
                        options={[{ label: 'Any difficulty', value: 'all' }, { label: 'Easy', value: 'easy' }, { label: 'Medium', value: 'medium' }, { label: 'Hard', value: 'hard' }]} />
                    <FrostedSelect label="Confidence" value={confidence} onChange={val => setConfidence(val === 'all' ? 'all' : Number(val))}
                        options={[{ label: 'Any', value: 'all' }, { label: '1 - Guess', value: 1 }, { label: '2 - Unsure', value: 2 }, { label: '3 - Fairly sure', value: 3 }, { label: '4 - Certain', value: 4 }]} />
                    <FrostedSelect label="Satisfaction" value={satFilter} onChange={(val) => setSatFilter(val === 'all' ? 'all' : Number(val))}
                        options={[{ label: 'Any', value: 'all' }, { label: '1 - Poor', value: 1 }, { label: '2 - Fair', value: 2 }, { label: '3 - Good', value: 3 }, { label: '4 - Excellent', value: 4 }]} />
                    <FrostedSelect label="Period" value={days} onChange={val => setDays(val as typeof days)}
                        options={[{ label: 'All time', value: 'all' }, { label: 'Last 7 days', value: '7' }, { label: 'Last 30 days', value: '30' }, { label: 'Last 90 days', value: '90' }]} />
                    <FrostedSelect label="Sort" value={sortOrder} onChange={(val) => setSortOrder(val as SortOrder)}
                        options={[{ label: 'Newest', value: 'newest' }, { label: 'Oldest', value: 'oldest' }, { label: 'Confidence', value: 'confidence' }, { label: 'Satisfaction', value: 'satisfaction' }]} />

                    <div style={{ position: 'relative' }}>
                        <span className="orbit-label" style={{ display: 'block', marginBottom: 6 }}>Category</span>
                        <button onClick={() => setShowCatDropdown(!showCatDropdown)} aria-expanded={showCatDropdown} className="orbit-input"
                            style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{selectedCats.length === 0 ? 'All categories' : `${selectedCats.length} selected`}</span><span aria-hidden="true" style={{ opacity: 0.5 }}>▾</span>
                        </button>
                        {showCatDropdown && (
                            <div className="orbit-glass" style={{ position: 'absolute', top: '100%', left: 0, right: 0, minWidth: 260, marginTop: 6, zIndex: 1000, padding: 6, maxHeight: 360, overflowY: 'auto', borderRadius: 'var(--orbit-radius)' }}>
                                {availableCategories.map((cat) => (
                                    <label key={cat} className="hover:bg-black/5 dark:hover:bg-white/10"
                                        style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem', cursor: 'pointer', padding: '8px 10px', borderRadius: 'calc(var(--orbit-radius) - 2px)' }}>
                                        <input type="checkbox" checked={selectedCats.includes(cat)}
                                            onChange={() => setSelectedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])} />
                                        {cat}
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <label className="orbit-row orbit-body" style={{ gap: 10 }}>
                        <button type="button" role="switch" aria-checked={latestOnly} onClick={() => setLatestOnly(v => !v)} className="orbit-switch" aria-label="Latest attempt per question only" />
                        Latest attempt per question only
                    </label>
                    <SimpleRevealSwitch on={simpleReveal} onChange={setSimpleReveal} />
                    <span className="orbit-row" style={{ gap: 14 }}>
                        <span className="orbit-label" aria-live="polite">{total === null ? '' : `${total} attempt${total === 1 ? '' : 's'}${activeFilters ? ' match' : ''}`}</span>
                        {activeFilters > 0 && <button type="button" onClick={clearFilters} className="orbit-btn orbit-btn--ghost">Clear filters</button>}
                    </span>
                </div>
            </div>

            {!loading && history.length === 0 && (
                <p className="orbit-muted" style={{ textAlign: 'center', padding: '2.5rem 0' }}>
                    {activeFilters ? 'No attempts match these filters.' : 'No attempts yet. Answer some questions in Quick Test and they show up here.'}
                </p>
            )}

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {history.map((item) => (
                    <div key={item.id} className="orbit-card" style={{ padding: '1.4rem', position: 'relative', ...edge(item.is_correct ? 'var(--orbit-good)' : 'var(--orbit-bad)') }}>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '15px' }}>
                            <div style={{ minWidth: 0 }}>
                                <span className="orbit-badge">{item.questions.category}</span>
                                <div className="orbit-muted" style={{ marginTop: 8 }}>
                                    {new Date(item.attempted_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.6rem', opacity: 0.6, marginBottom: '4px', fontWeight: 'bold' }}>CONFIDENCE</label>
                                    {item.user_rating != null
                                        ? <span style={{ fontWeight: 'bold', color: 'var(--orbit-accent)' }}>{item.user_rating}/4</span>
                                        : <span className="orbit-muted" title="Not rated">—</span>}
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
                                                    background: item.satisfaction_rating === num ? 'var(--orbit-accent)' : 'rgba(128,128,128,0.2)',
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

                        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', lineHeight: '1.5', fontWeight: '500' }}>{decodeHTML(item.questions.question_text)}</h3>
                        <div style={{ marginBottom: '1rem' }}><DifficultyLine stat={difficulty[item.question_id]} /></div>

                        <div style={{ display: 'grid', gap: '8px', marginBottom: '15px' }}>
                            {item.questions.options.map((opt, idx) => {
                                const decodedOpt = decodeHTML(opt);
                                const wasSelected = item.submitted_answer?.includes(opt);
                                const isCorrect = item.questions.correct_answers.includes(opt);

                                return <ReviewedOption key={idx} letter={String.fromCharCode(65 + idx)} text={decodedOpt} picked={!!wasSelected} correct={isCorrect} simple={simpleReveal} />;
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
                            <strong style={{ color: 'var(--orbit-accent)', display: 'block', marginBottom: '8px', fontSize: '0.75rem', letterSpacing: '0.05em' }}>EXPLANATION:</strong>
                            {decodeHTML(item.questions.explanation)}
                        </div>
                        <div style={{ marginTop: '12px' }}><QuestionNotes value={notes[item.question_id]} onSave={patch => saveNote(item.question_id, patch)} /></div>
                        <div style={{ marginTop: '10px' }}><ReportQuestion questionId={item.question_id} /></div>
                    </div>
                ))}
            </div>

            {/* Pagination Button */}
            {hasMore && (
                <button
                    onClick={() => fetchHistory(false)}
                    disabled={loading}
                    className="orbit-btn" style={{ width: '100%', marginTop: '2rem', padding: 15 }}
                >
                    {loading ? "Loading results..." : "Load More Attempts"}
                </button>
            )}

            {!hasMore && history.length > 0 && (
                <div className="orbit-label" style={{ textAlign: 'center', marginTop: '3rem' }}>
                    End of review history
                </div>
            )}
        </div>
    );
}