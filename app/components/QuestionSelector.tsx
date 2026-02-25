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
        const userEmail = session?.user?.email || "anonymous";

        try {
            let query = supabase.from('questions').select('id');

            // Logic Fix: Implicit Inclusion
            if (includedCats.length > 0) {
                query = query.in('category', includedCats);
            } else if (excludedCats.length > 0) {
                const remainingCats = availableCategories.filter(cat => !excludedCats.includes(cat));
                query = query.in('category', remainingCats);
            }

            if (searchTerm) {
                query = query.or(`question_text.ilike.%${searchTerm}%,explanation.ilike.%${searchTerm}%`);
            }

            if (unseenOnly) {
                const { data: seenData } = await supabase
                    .from('user_activity')
                    .select('question_id')
                    .eq('user_email', userEmail);
                if (seenData && seenData.length > 0) {
                    query = query.not('id', 'in', `(${seenData.map(i => i.question_id).join(',')})`);
                }
            }

            const { data, error } = await query;
            if (error) throw error;

            if (data) {
                const shuffled = [...data].sort(() => 0.5 - Math.random());
                onQuestionsFound(shuffled.slice(0, limit).map(q => q.id));
            }
        } catch (err) {
            console.error(err);
            alert("No questions found matching these criteria.");
        } finally {
            setLoading(false);
        }
    };

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
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input type="checkbox" id="unseen" checked={unseenOnly} onChange={(e) => setUnseenOnly(e.target.checked)} />
                    <label htmlFor="unseen" style={{ marginLeft: '10px' }}>Unseen Only</label>
                </div>
            </div>

            <input type="text" placeholder="Search phrase..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid #666', color: 'inherit', borderRadius: '8px', marginBottom: '20px' }} />

            <button onClick={findQuestions} disabled={loading} style={{ width: '100%', padding: '15px', background: '#0070f3', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                {loading ? 'Searching...' : 'Generate Quiz'}
            </button>
        </div>
    );
}