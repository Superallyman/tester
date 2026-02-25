"use client"

import React, { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import { useSession } from "next-auth/react";

interface QuestionSelectorProps {
    onQuestionsFound: (ids: string[]) => void;
}

export default function QuestionSelector({ onQuestionsFound }: QuestionSelectorProps) {
    const { data: session } = useSession();
    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [showCategories, setShowCategories] = useState(false);

    const [includedCats, setIncludedCats] = useState<string[]>([]);
    const [excludedCats, setExcludedCats] = useState<string[]>([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [limit, setLimit] = useState(5);
    const [unseenOnly, setUnseenOnly] = useState(false);
    const [loading, setLoading] = useState(false);


    const [minRating, setMinRating] = useState(1);
    const [maxRating, setMaxRating] = useState(10);
    const [notMasteredOnly, setNotMasteredOnly] = useState(false); // New: Never got correct


    const [noResults, setNoResults] = useState(false);

    useEffect(() => {
        async function getCategories() {
            const { data: countsData, error: countError } = await supabase
                .rpc('get_category_counts');

            if (countError) {
                console.error('Error fetching categories:', countError);
                return;
            }

            if (!countsData) return;

            const totalPerCat: Record<string, number> = {};

            countsData.forEach((item: { cat_name: string; q_count: number }) => {
                const normalized =
                    item.cat_name?.trim().replace(/\s+/g, ' ') || 'General';

                totalPerCat[normalized] = item.q_count;
            });

            const uniqueCats = Object.keys(totalPerCat).sort();

            setAvailableCategories(uniqueCats);

            // Optional: if you want the counts stored too
            // setCategoryCounts(totalPerCat);
        }

        getCategories();
    }, []);

    const handleCategoryClick = (cat: string) => {
        if (!includedCats.includes(cat) && !excludedCats.includes(cat)) {
            setIncludedCats([...includedCats, cat]);
        } else if (includedCats.includes(cat)) {
            setIncludedCats(includedCats.filter(c => c !== cat));
            setExcludedCats([...excludedCats, cat]);
        } else {
            setExcludedCats(excludedCats.filter(c => c !== cat));
        }
    };

    const clearFilters = () => {
        setIncludedCats([]);
        setExcludedCats([]);
    };

    const findQuestions = async () => {
        setLoading(true);
        setNoResults(false); // Reset on every new search
        const userEmail = session?.user?.email || "anonymous";

        try {
            // 1. Get ALL activity data for the user
            const { data: activityData } = await supabase
                .from('user_activity')
                .select('question_id, is_correct, user_rating')
                .eq('user_email', userEmail);

            // 2. AGGREGATE DATA BY QUESTION
            // We need a map where the key is question_id and the value is its aggregate stats
            const statsByQuestion: Record<string, { totalRating: number, count: number, mastered: boolean }> = {};

            activityData?.forEach(a => {
                if (!statsByQuestion[a.question_id]) {
                    statsByQuestion[a.question_id] = { totalRating: 0, count: 0, mastered: false };
                }
                statsByQuestion[a.question_id].totalRating += (a.user_rating || 5);
                statsByQuestion[a.question_id].count += 1;
                if (a.is_correct) statsByQuestion[a.question_id].mastered = true;
            });

            const seenIds = Object.keys(statsByQuestion);
            let targetIds: string[] | null = null;

            if (!unseenOnly) {
                // Filter the AGGREGATED stats based on the UI sliders
                targetIds = seenIds.filter(id => {
                    const stats = statsByQuestion[id];
                    const avgRating = stats.totalRating / stats.count;

                    // Condition A: Matches the Average Rating Range
                    const matchesRating = avgRating >= minRating && avgRating <= maxRating;

                    // Condition B: Matches Mastery Filter (if checked, only return if never got correct)
                    const matchesMastery = notMasteredOnly ? !stats.mastered : true;

                    return matchesRating && matchesMastery;
                });

                // GENTLE CHECK: Instead of throwing an error, we set a state and exit
                if (targetIds.length === 0) {
                    setNoResults(true);
                    setLoading(false);
                    return;
                }
            }

            // 3. Build the Main Question Query
            let query = supabase.from('questions').select('id');

            // Apply Category Filters
            if (includedCats.length > 0) {
                query = query.in('category', includedCats);
            } else if (excludedCats.length > 0) {
                const remainingCats = availableCategories.filter(cat => !excludedCats.includes(cat));
                query = query.in('category', remainingCats);
            }

            // Apply Search
            if (searchTerm) {
                query = query.or(`question_text.ilike.%${searchTerm}%,explanation.ilike.%${searchTerm}%`);
            }

            // Apply Activity Logic
            if (unseenOnly) {
                if (seenIds.length > 0) {
                    query = query.not('id', 'in', `(${seenIds.join(',')})`);
                }
            } else {
                // If we are looking for specific ratings/mastery, we MUST be within targetIds
                if (!targetIds || targetIds.length === 0) {
                    throw new Error("No questions match your current average rating or mastery criteria.");
                }
                // Supabase .in() has a limit for long arrays, but for a few hundred IDs it works fine
                query = query.in('id', targetIds);
            }

            const { data, error } = await query;
            if (error) throw error;

            if (data && data.length > 0) {
                const shuffled = [...data].sort(() => 0.5 - Math.random());
                onQuestionsFound(shuffled.slice(0, limit).map(q => q.id));
            } else {
                setNoResults(true); // If category filters + rating filters together = 0
            }
        } catch (err: any) {
            console.error(err);
            alert(err.message || "An error occurred.");
        } finally {
            setLoading(false);
        }
    };

    const masteryFiltersActive = notMasteredOnly || minRating !== 1 || maxRating !== 10;

    return (
        <div style={{ padding: '1.5rem', border: '1px solid #444', borderRadius: '12px', marginBottom: '2rem' }}>

            {/* Summary Bar */}
            {(includedCats.length > 0 || excludedCats.length > 0) && (
                <div style={{ fontSize: '0.75rem', marginBottom: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {includedCats.map(c => <span key={c} style={{ color: '#34d399', background: 'rgba(52, 211, 153, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>+{c}</span>)}
                    {excludedCats.map(c => <span key={c} style={{ color: '#f87171', background: 'rgba(248, 113, 113, 0.1)', padding: '2px 6px', borderRadius: '4px', textDecoration: 'line-through' }}>-{c}</span>)}
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                <button
                    onClick={() => setShowCategories(!showCategories)}
                    style={{ background: 'transparent', border: '1px solid #666', color: 'inherit', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer' }}
                >
                    {showCategories ? '▼ Hide Categories' : '▶ Configure Categories'}
                </button>
                {showCategories && (
                    <button onClick={clearFilters} style={{ background: 'transparent', border: '1px solid #f87171', color: '#f87171', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                        Clear All
                    </button>
                )}
            </div>

            {showCategories && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '15px', border: '1px solid #333', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', marginBottom: '20px' }}>
                    {availableCategories.map(cat => {
                        const isIncluded = includedCats.includes(cat);
                        const isExcluded = excludedCats.includes(cat);
                        let bgColor = '#333';
                        if (isIncluded) bgColor = '#065f46';
                        if (isExcluded) bgColor = '#7f1d1d';

                        return (
                            <button key={cat} onClick={() => handleCategoryClick(cat)} style={{ padding: '6px 12px', borderRadius: '20px', border: 'none', background: bgColor, color: 'white', cursor: 'pointer', fontSize: '0.8rem' }}>
                                {isIncluded ? '✅ ' : isExcluded ? '❌ ' : ''}{cat}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Other filters (Limit, Unseen, Search) remain here... */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <input type="number" value={limit} onChange={(e) => setLimit(parseInt(e.target.value))} placeholder="Limit" style={{ padding: '10px', background: 'transparent', border: '1px solid #666', color: 'inherit', borderRadius: '8px' }} />
                <div style={{ display: 'flex', alignItems: 'center', opacity: masteryFiltersActive ? 0.5 : 1 }}>
                    <input
                        type="checkbox"
                        id="unseen"
                        checked={unseenOnly}
                        disabled={masteryFiltersActive}
                        onChange={(e) => {
                            const checked = e.target.checked;
                            setUnseenOnly(checked);

                            if (checked) {
                                // Reset mastery filters when unseen is selected
                                setNotMasteredOnly(false);
                                setMinRating(1);
                                setMaxRating(10);
                            }
                        }}
                    />
                    <label htmlFor="unseen" style={{ marginLeft: '10px' }}>
                        Unseen Only
                    </label>
                </div>
            </div>

            {/* Rating & Mastery Row */}
            <div
                style={{
                    padding: '15px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '8px',
                    marginBottom: '15px',
                    border: '1px solid #333',
                    opacity: unseenOnly ? 0.5 : 1,
                    pointerEvents: unseenOnly ? 'none' : 'auto'
                }}
            >                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.9rem' }}>
                    <span>Confidence Range: <strong>{minRating} - {maxRating}</strong></span>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: notMasteredOnly ? '#f87171' : 'inherit' }}>
                        <input
                            type="checkbox"
                            checked={notMasteredOnly}
                            onChange={(e) => {
                                setNotMasteredOnly(e.target.checked);
                                if (e.target.checked) setUnseenOnly(false); // Auto-conflict resolution
                            }}
                            style={{ marginRight: '8px' }}
                        />
                        Un-mastered Only
                    </label>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input
                        type="range" min="1" max="10" value={minRating}
                        onChange={(e) => {
                            setMinRating(Number(e.target.value));
                            setUnseenOnly(false);
                        }}
                        style={{ flex: 1 }}
                    />
                    <span>to</span>
                    <input
                        type="range" min="1" max="10" value={maxRating}
                        onChange={(e) => {
                            setMaxRating(Number(e.target.value));
                            setUnseenOnly(false);
                        }}
                        style={{ flex: 1 }}
                    />
                </div>
                <p style={{ fontSize: '0.7rem', color: '#888', marginTop: '8px', marginBottom: 0 }}>
                    * Adjusting rating or mastery will automatically turn off "Unseen Only".
                </p>
            </div>



            <input type="text" placeholder="Search phrase..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid #666', color: 'inherit', borderRadius: '8px', marginBottom: '20px' }} />
            {noResults && (
                <div style={{
                    padding: '10px',
                    marginBottom: '15px',
                    background: 'rgba(248, 113, 113, 0.1)',
                    color: '#f87171',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    textAlign: 'center',
                    border: '1px solid #7f1d1d'
                }}>
                    No questions found matching these specific filters. Try broadening your rating range or categories.
                </div>
            )}
            
            <button onClick={findQuestions} disabled={loading} style={{ width: '100%', padding: '15px', background: '#0070f3', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                {loading ? 'Searching...' : 'Generate Quiz'}
            </button>
        </div>
    );
}