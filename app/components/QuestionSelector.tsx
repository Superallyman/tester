"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/utils/supabase';
import { useSession } from "next-auth/react";

interface QuestionSelectorProps {
    onQuestionsFound: (ids: string[]) => void;
}

interface SearchChip {
    phrase: string;
    ids: string[];
}

interface QuestionStat {
    totalRating: number;
    count: number;
    mastered: boolean;
}

export default function QuestionSelector({ onQuestionsFound }: QuestionSelectorProps) {
    const { data: session } = useSession();
    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [showCategories, setShowCategories] = useState(false);
    const [showPhrases, setShowPhrases] = useState(false);
    const [includedCats, setIncludedCats] = useState<string[]>([]);
    const [excludedCats, setExcludedCats] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchedPhrases, setSearchedPhrases] = useState<SearchChip[]>([]);
    const [searchMode, setSearchMode] = useState<'AND' | 'OR'>('OR');
    const [searchingPhrase, setSearchingPhrase] = useState(false);
    const [limit, setLimit] = useState(5);
    const [unseenOnly, setUnseenOnly] = useState(false);
    const [loading, setLoading] = useState(false);
    const [minRating, setMinRating] = useState(1);
    const [maxRating, setMaxRating] = useState(10);
    const [notMasteredOnly, setNotMasteredOnly] = useState(false);
    const [noResults, setNoResults] = useState(false);

    const hasCategoryFilters = includedCats.length > 0 || excludedCats.length > 0;
    const hasPhraseFilters = searchedPhrases.length > 0;

    // Logic for calculating the Intersection (AND) or Union (OR)
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

    useEffect(() => {
        async function getCategories() {
            const { data: countsData } = await supabase.rpc('get_category_counts');
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
    
                // Use the RPC call to our custom search function
                const { data, error } = await supabase
                    .rpc('search_questions_by_phrase', { search_term: phrase });
    
                if (error) throw error;
                
                // Map the returned questions to just their IDs
                newChips.push({ phrase, ids: data?.map((q: any) => q.id) || [] });
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
        const userEmail = session?.user?.email || "anonymous";

        try {
            const { data: activityData } = await supabase.from('user_activity')
                .select('question_id, is_correct, user_rating').eq('user_email', userEmail);

            const statsByQuestion: Record<string, QuestionStat> = {};
            activityData?.forEach(a => {
                if (!statsByQuestion[a.question_id]) {
                    statsByQuestion[a.question_id] = { totalRating: 0, count: 0, mastered: false };
                }
                statsByQuestion[a.question_id].totalRating += (a.user_rating || 5);
                statsByQuestion[a.question_id].count += 1;
                if (a.is_correct) statsByQuestion[a.question_id].mastered = true;
            });

            let finalQuery = supabase.from('questions').select('id');

            if (hasPhraseFilters) {
                if (currentPoolIds.length === 0) {
                    setNoResults(true);
                    setLoading(false);
                    return;
                }
                finalQuery = finalQuery.in('id', currentPoolIds);
            } else if (hasCategoryFilters) {
                const targetCats = includedCats.length > 0 ? includedCats : availableCategories.filter(c => !excludedCats.includes(c));
                finalQuery = finalQuery.in('category', targetCats);
            }

            const { data: baseQuestions, error } = await finalQuery;
            if (error) throw error;

            const filtered = (baseQuestions || []).filter(q => {
                const stats = statsByQuestion[q.id];
                if (unseenOnly) return !stats;
                if (notMasteredOnly || minRating !== 1 || maxRating !== 10) {
                    if (!stats) return false;
                    const avg = stats.totalRating / stats.count;
                    return avg >= minRating && avg <= maxRating && (notMasteredOnly ? !stats.mastered : true);
                }
                return true;
            });

            if (filtered.length > 0) {
                onQuestionsFound(filtered.sort(() => 0.5 - Math.random()).slice(0, limit).map(q => q.id));
            } else {
                setNoResults(true);
            }
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    return (
        <div style={{ padding: '1.5rem', border: '1px solid rgba(128,128,128,0.2)', borderRadius: '12px', background: 'rgba(128,128,128,0.05)', color: 'inherit' }}>

            {hasCategoryFilters && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px', fontSize: '0.7rem' }}>
                    {includedCats.map(c => <span key={c} style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '2px 8px', borderRadius: '4px', border: '1px solid #10b98133' }}>+{c}</span>)}
                    {excludedCats.map(c => <span key={c} style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '2px 8px', borderRadius: '4px', textDecoration: 'line-through', border: '1px solid #ef444433' }}>-{c}</span>)}
                </div>
            )}

            {/* Category Filter Section */}
            <div style={{ marginBottom: '8px', opacity: hasPhraseFilters ? 0.4 : 1, pointerEvents: hasPhraseFilters ? 'none' : 'auto', transition: 'opacity 0.3s' }}>
                <button onClick={() => setShowCategories(!showCategories)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(128,128,128,0.1)', border: '1px solid rgba(128,128,128,0.2)', borderRadius: '8px', color: 'inherit', cursor: 'pointer' }}>
                    <span>{showCategories ? '▼' : '▶'} {hasPhraseFilters ? 'Categories (Disabled)' : 'Filter by Category'}</span>
                </button>
                {showCategories && (
                    <div style={{ marginTop: '8px', background: 'rgba(128,128,128,0.05)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.15)', maxHeight: '200px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {availableCategories.map(cat => {
                            const isInc = includedCats.includes(cat);
                            const isExc = excludedCats.includes(cat);
                            return (
                                <button key={cat} onClick={() => handleCategoryClick(cat)}
                                    style={{
                                        padding: '4px 10px', borderRadius: '12px', border: 'none', fontSize: '0.75rem', cursor: 'pointer',
                                        background: isInc ? '#059669' : isExc ? '#dc2626' : 'rgba(128,128,128,0.2)',
                                        color: isInc || isExc ? 'white' : 'inherit'
                                    }}>
                                    {isInc ? '✓ ' : isExc ? '✕ ' : ''}{cat}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Phrase Search Section */}
            <div style={{ marginBottom: '20px', opacity: hasCategoryFilters ? 0.4 : 1, pointerEvents: hasCategoryFilters ? 'none' : 'auto', transition: 'opacity 0.3s' }}>
                <button onClick={() => setShowPhrases(!showPhrases)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(128,128,128,0.1)', border: '1px solid rgba(128,128,128,0.2)', borderRadius: '8px', color: 'inherit', cursor: 'pointer' }}>
                    <span>{showPhrases ? '▼' : '▶'} {hasCategoryFilters ? 'Search Phrases (Disabled)' : 'Search Phrases'}</span>
                </button>
                {showPhrases && (
                    <div style={{ marginTop: '8px', background: 'rgba(128,128,128,0.05)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.15)' }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                            <input type="text" placeholder="Side effects, Emergency..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddPhrase()}
                                style={{ flex: 1, padding: '10px', background: 'rgba(128,128,128,0.1)', border: '1px solid rgba(128,128,128,0.2)', color: 'inherit', borderRadius: '6px' }} />
                            <button onClick={handleAddPhrase} disabled={searchingPhrase || !searchTerm} style={{ padding: '0 15px', borderRadius: '6px', background: '#0070f3', color: 'white', border: 'none', cursor: 'pointer' }}>Add</button>
                        </div>

                        <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                            <button onClick={() => setSearchMode('AND')} style={{ flex: 1, fontSize: '0.7rem', padding: '6px', borderRadius: '4px', border: '1px solid #444', background: searchMode === 'AND' ? '#3b82f6' : 'transparent', color: 'white', cursor: 'pointer', fontWeight: searchMode === 'AND' ? '600' : '400' }}>AND (Match All)</button>
                            <button onClick={() => setSearchMode('OR')} style={{ flex: 1, fontSize: '0.7rem', padding: '6px', borderRadius: '4px', border: '1px solid #444', background: searchMode === 'OR' ? '#3b82f6' : 'transparent', color: 'white', cursor: 'pointer', fontWeight: searchMode === 'OR' ? '600' : '400' }}>OR (Match Any)</button>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                            {searchedPhrases.map(p => (
                                <div key={p.phrase} style={{ background: 'rgba(128,128,128,0.15)', padding: '4px 10px', borderRadius: '16px', fontSize: '0.75rem', border: '1px solid rgba(128,128,128,0.1)', display: 'flex', alignItems: 'center' }}>
                                    <span style={{ color: '#3b82f6' }}>&quot;{p.phrase}&quot;</span>
                                    <span style={{ marginLeft: '4px', opacity: 0.5 }}>({p.ids.length})</span>
                                    <button onClick={() => setSearchedPhrases(searchedPhrases.filter(x => x.phrase !== p.phrase))} style={{ background: 'none', border: 'none', color: '#ef4444', marginLeft: '6px', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
                                </div>
                            ))}
                            {hasPhraseFilters && (
                                <div style={{ marginLeft: 'auto', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                                    {searchMode} TOTAL: <strong>{currentPoolIds.length}</strong>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Standard Quiz Settings */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.65rem', opacity: 0.6, marginLeft: '4px' }}>QUESTION LIMIT</label>
                    <input type="number" value={limit} onChange={(e) => setLimit(parseInt(e.target.value) || 1)} style={{ padding: '10px', background: 'rgba(128,128,128,0.1)', border: '1px solid rgba(128,128,128,0.2)', color: 'inherit', borderRadius: '8px' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginTop: '18px' }}>
                    <input type="checkbox" id="unseen" checked={unseenOnly} disabled={notMasteredOnly || minRating !== 1 || maxRating !== 10} onChange={(e) => setUnseenOnly(e.target.checked)} />
                    <label htmlFor="unseen" style={{ marginLeft: '8px', fontSize: '0.9rem', opacity: (unseenOnly) ? 1 : 0.6 }}>Unseen Only</label>
                </div>
            </div>

            <div style={{ padding: '12px', background: 'rgba(128,128,128,0.03)', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.15)', marginBottom: '20px', opacity: unseenOnly ? 0.5 : 1, pointerEvents: unseenOnly ? 'none' : 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '10px' }}>
                    <span style={{ opacity: 0.8 }}>Confidence Range: {minRating}-{maxRating}</span>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input type="checkbox" checked={notMasteredOnly} onChange={(e) => { setNotMasteredOnly(e.target.checked); if (e.target.checked) setUnseenOnly(false); }} />
                        <span style={{ marginLeft: '6px', fontSize: '0.8rem' }}>Exclude Mastered</span>
                    </label>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input type="range" min="1" max="10" value={minRating} onChange={(e) => { setMinRating(Number(e.target.value)); setUnseenOnly(false); }} style={{ flex: 1, accentColor: '#0070f3' }} />
                    <input type="range" min="1" max="10" value={maxRating} onChange={(e) => { setMaxRating(Number(e.target.value)); setUnseenOnly(false); }} style={{ flex: 1, accentColor: '#0070f3' }} />
                </div>
            </div>

            {noResults && <div style={{ color: '#ef4444', fontSize: '0.8rem', textAlign: 'center', marginBottom: '10px', fontWeight: '500' }}>No questions found for these filters.</div>}

            <button onClick={findQuestions} disabled={loading} style={{ width: '100%', padding: '16px', background: '#0070f3', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'opacity 0.2s' }}>
                {loading ? 'Crunching...' : 'Generate Quiz'}
            </button>
        </div>
    );
}