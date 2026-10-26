"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { api, qs } from '@/utils/api';
import { MIN_PEOPLE } from '@/utils/difficulty';

interface QuestionSelectorProps {
    onQuestionsFound: (ids: string[]) => void;
}

interface SearchChip {
    phrase: string;
    ids: string[];
}

const SATISFACTION_LEVELS = [1, 2, 3, 4];

// Fixed the "any" error by defining the expected RPC return shape
interface SearchResult {
    id: string;
}

export default function QuestionSelector({ onQuestionsFound }: QuestionSelectorProps) {
    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [showCategories, setShowCategories] = useState(false);
    const [showPhrases, setShowPhrases] = useState(false);
    const [includedCats, setIncludedCats] = useState<string[]>([]);
    const [excludedCats, setExcludedCats] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchedPhrases, setSearchedPhrases] = useState<SearchChip[]>([]);
    const [searchMode, setSearchMode] = useState<'AND' | 'OR'>('OR');
    const [searchingPhrase, setSearchingPhrase] = useState(false);
    const [limit, setLimit] = useState(1); //can we save the limit in local storage so it persists across sessions?
    const [unseenOnly, setUnseenOnly] = useState(false);
    const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
    const [difficulty, setDifficulty] = useState<'' | 'easy' | 'medium' | 'hard'>('');
    const [loading, setLoading] = useState(false);
    const [satisfactionLevels, setSatisfactionLevels] = useState<number[]>([]);
    const [notMasteredOnly, setNotMasteredOnly] = useState(false);
    const [noResults, setNoResults] = useState(false);

    const hasCategoryFilters = includedCats.length > 0 || excludedCats.length > 0;
    const hasPhraseFilters = searchedPhrases.length > 0;

    const currentPoolIds = useMemo(() => {
        if (searchedPhrases.length === 0) return [];
        if (searchMode === 'OR') {
            return Array.from(new Set(searchedPhrases.flatMap(p => p.ids)));
        } else {
            return searchedPhrases.reduce((acc, curr, idx) => {
                if (idx === 0) return curr.ids;
                return acc.filter(id => curr.ids.includes(id));
            }, [] as string[]);
        }
    }, [searchedPhrases, searchMode]);

    // 1. Read from localStorage once component mounts on the client
    useEffect(() => {
        const savedLimit = localStorage.getItem('question_selector_limit');
        if (savedLimit !== null) {
            const parsed = parseInt(savedLimit, 10);
            if (!isNaN(parsed) && parsed > 0) {
                setLimit(parsed);
            }
        }
    }, []);

    // 2. Handler to update state and localStorage simultaneously
    const handleLimitChange = (val: number) => {
        const newLimit = Math.max(1, val);
        setLimit(newLimit);
        localStorage.setItem('question_selector_limit', newLimit.toString());
    };

    useEffect(() => {
        async function getCategories() {
            const countsData = await api<{ cat_name: string }[]>('/api/categories').catch(() => null);
            if (!countsData) return;
            const uniqueCats = (countsData as { cat_name: string }[])
                .map(item => item.cat_name?.trim().replace(/\s+/g, ' ') || 'General')
                .filter((v, i, a) => a.indexOf(v) === i)
                .sort();
            setAvailableCategories(uniqueCats);
        }
        getCategories();
    }, []);

    const handleCategoryClick = (cat: string) => {
        if (hasPhraseFilters) return;
        if (!includedCats.includes(cat) && !excludedCats.includes(cat)) {
            setIncludedCats([...includedCats, cat]);
        } else if (includedCats.includes(cat)) {
            setIncludedCats(includedCats.filter(c => c !== cat));
            setExcludedCats([...excludedCats, cat]);
        } else {
            setExcludedCats(excludedCats.filter(c => c !== cat));
        }
    };

    const handleAddPhrase = async () => {
        if (!searchTerm.trim() || hasCategoryFilters) return;
        setSearchingPhrase(true);

        const phrasesToAdd = searchTerm.split(',').map(p => p.trim()).filter(p => p.length > 0);
        const newChips: SearchChip[] = [...searchedPhrases];

        try {
            for (const phrase of phrasesToAdd) {
                if (newChips.find(c => c.phrase.toLowerCase() === phrase.toLowerCase())) continue;

                const data = await api<SearchResult[]>(`/api/questions${qs({ search: phrase })}`);

                // Explicitly typing the map function to satisfy TypeScript
                const foundIds = (data as SearchResult[])?.map((q) => q.id) || [];
                newChips.push({ phrase, ids: foundIds });
            }
            setSearchedPhrases(newChips);
            setSearchTerm('');
        } catch (err) {
            console.error("Search Error:", err);
        } finally {
            setSearchingPhrase(false);
        }
    };

    const findQuestions = async () => {
        setLoading(true);
        setNoResults(false);

        try {
            if (hasPhraseFilters && currentPoolIds.length === 0) {
                setNoResults(true);
                return;
            }
            // The server filters against your history and draws at random; phrase searches replace the category filter
            const ids = await api<string[]>('/api/questions/pick', {
                body: {
                    limit,
                    ids: hasPhraseFilters ? currentPoolIds : undefined,
                    include: hasPhraseFilters ? [] : includedCats,
                    exclude: hasPhraseFilters ? [] : excludedCats,
                    unseenOnly,
                    excludeMastered: notMasteredOnly,
                    bookmarkedOnly,
                    difficulty: difficulty || undefined,
                    satisfaction: satisfactionLevels,
                },
            });
            if (ids.length > 0) onQuestionsFound(ids);
            else setNoResults(true);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const disclosure = (open: boolean, label: string, onClick: () => void) => (
        <button onClick={onClick} aria-expanded={open} className="orbit-option" style={{ justifyContent: 'space-between' }}>
            <span>{label}</span><span aria-hidden="true" style={{ opacity: 0.6, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
        </button>
    );

    return (
        <div className="orbit-card orbit-stack" style={{ padding: '1.25rem', gap: 14 }}>

            {hasCategoryFilters && (
                <div className="orbit-row" style={{ gap: 6 }}>
                    {includedCats.map(c => <span key={c} className="orbit-badge orbit-badge--good">+ {c}</span>)}
                    {excludedCats.map(c => <span key={c} className="orbit-badge orbit-badge--bad" style={{ textDecoration: 'line-through' }}>{c}</span>)}
                </div>
            )}

            <div style={{ opacity: hasPhraseFilters ? 0.4 : 1, pointerEvents: hasPhraseFilters ? 'none' : 'auto', transition: 'opacity 0.3s' }}>
                {disclosure(showCategories, hasPhraseFilters ? 'Categories (disabled while searching phrases)' : 'Filter by Category', () => setShowCategories(!showCategories))}
                {showCategories && (
                    <div className="orbit-row" style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto', gap: 6, padding: 2 }}>
                        {availableCategories.map(cat => {
                            const isInc = includedCats.includes(cat);
                            const isExc = excludedCats.includes(cat);
                            return (
                                <button key={cat} onClick={() => handleCategoryClick(cat)} aria-pressed={isInc}
                                    className={`orbit-chip ${isExc ? 'is-excluded' : ''}`}
                                    style={isExc ? { borderColor: 'var(--orbit-bad)', opacity: 0.8 } : undefined}>
                                    {isInc ? '✓ ' : isExc ? '✕ ' : ''}{cat}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div style={{ opacity: hasCategoryFilters ? 0.4 : 1, pointerEvents: hasCategoryFilters ? 'none' : 'auto', transition: 'opacity 0.3s' }}>
                {disclosure(showPhrases, hasCategoryFilters ? 'Search Phrases (disabled while filtering categories)' : 'Search Phrases', () => setShowPhrases(!showPhrases))}
                {showPhrases && (
                    <div className="orbit-stack" style={{ marginTop: 8, gap: 10 }}>
                        <div className="orbit-row" style={{ flexWrap: 'nowrap' }}>
                            <input type="text" placeholder="Side effects, Emergency..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddPhrase()}
                                className="orbit-input" />
                            <button onClick={handleAddPhrase} disabled={searchingPhrase || !searchTerm} className="orbit-btn orbit-btn--primary">Add</button>
                        </div>
                        <div className="orbit-segment" role="group" aria-label="Match">
                            <button aria-pressed={searchMode === 'AND'} onClick={() => setSearchMode('AND')}>Match all</button>
                            <button aria-pressed={searchMode === 'OR'} onClick={() => setSearchMode('OR')}>Match any</button>
                        </div>
                        <div className="orbit-row" style={{ gap: 6 }}>
                            {searchedPhrases.map(p => (
                                <span key={p.phrase} className="orbit-chip" style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.78rem', gap: 6, cursor: 'default' }}>
                                    &quot;{p.phrase}&quot; <span style={{ opacity: 0.55 }}>({p.ids.length})</span>
                                    <button onClick={() => setSearchedPhrases(searchedPhrases.filter(x => x.phrase !== p.phrase))} aria-label={`Remove ${p.phrase}`}
                                        style={{ background: 'none', border: 'none', color: 'var(--orbit-bad)', cursor: 'pointer', padding: 0, fontSize: '1rem', lineHeight: 1 }}>×</button>
                                </span>
                            ))}
                            {hasPhraseFilters && <span className="orbit-label" style={{ marginLeft: 'auto' }}>{searchMode === 'AND' ? 'All' : 'Any'} · {currentPoolIds.length} questions</span>}
                        </div>
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 2fr', gap: 16, alignItems: 'end' }}>
                <label className="orbit-field">
                    <span className="orbit-label">Question limit</span>
                    <input type="number" min={1} value={limit} onChange={(e) => handleLimitChange(parseInt(e.target.value) || 1)} className="orbit-input" />
                </label>
                <div className="orbit-row" style={{ gap: '10px 18px', paddingBottom: 8 }}>
                    <label className="orbit-row orbit-body" style={{ gap: 6, opacity: unseenOnly ? 1 : 0.75 }}>
                        <input type="checkbox" id="unseen" checked={unseenOnly} disabled={notMasteredOnly || satisfactionLevels.length > 0} onChange={(e) => setUnseenOnly(e.target.checked)} />
                        Unseen Only
                    </label>
                    <label className="orbit-row orbit-body" style={{ gap: 6, opacity: bookmarkedOnly ? 1 : 0.75 }}>
                        <input type="checkbox" id="bookmarked" checked={bookmarkedOnly} onChange={(e) => setBookmarkedOnly(e.target.checked)} />
                        Bookmarked Only
                    </label>
                </div>
            </div>
            <label className="orbit-field">
                <span className="orbit-label">Difficulty</span>
                <select value={difficulty} onChange={e => setDifficulty(e.target.value as typeof difficulty)} aria-label="Difficulty" className="orbit-input"
                    title={`From everyone's first tries; a question is rated once ${MIN_PEOPLE} people have answered it`}>
                    <option value="">Any difficulty</option>
                    <option value="easy">Easy (70%+ right)</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard (under 40% right)</option>
                </select>
            </label>

            <div className="orbit-stack" style={{ gap: 10, opacity: unseenOnly ? 0.5 : 1, pointerEvents: unseenOnly ? 'none' : 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="orbit-label">Satisfaction · {satisfactionLevels.length ? [...satisfactionLevels].sort().join(', ') : 'Any'}</span>
                    <label className="orbit-row orbit-body" style={{ gap: 6 }}>
                        <input type="checkbox" checked={notMasteredOnly} onChange={(e) => { setNotMasteredOnly(e.target.checked); if (e.target.checked) setUnseenOnly(false); }} />
                        Exclude Mastered
                    </label>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {SATISFACTION_LEVELS.map(level => {
                        const on = satisfactionLevels.includes(level);
                        return (
                            <button
                                key={level}
                                aria-pressed={on}
                                onClick={() => {
                                    setSatisfactionLevels(prev => on ? prev.filter(l => l !== level) : [...prev, level]);
                                    setUnseenOnly(false);
                                }}
                                className="orbit-option"
                                style={{ flex: 1, justifyContent: 'center', fontWeight: 600, padding: '9px 0' }}
                            >
                                {level}
                            </button>
                        );
                    })}
                </div>
                <p className="orbit-muted">Uses your latest satisfaction rating for each question. Select none to ignore ratings.</p>
            </div>

            {noResults && <div role="alert" className="orbit-alert orbit-alert--bad">No questions found for these filters.</div>}

            <button onClick={findQuestions} disabled={loading} className="orbit-btn orbit-btn--primary" style={{ width: '100%', padding: '15px' }}>
                {loading ? 'Crunching...' : 'Generate Quiz'}
            </button>
        </div>
    );
}