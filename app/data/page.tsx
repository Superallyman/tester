"use client"

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { useSession } from "next-auth/react";

type SortType = 'alpha' | 'worst' | 'best' | 'urgency' | 'mastery';

// --- Interfaces for Type Safety ---
interface CategoryStat {
  name: string;
  accuracy: number;
  avgRating: number;
  volume: number;
  seenCount: number;
  masteredCount: number;
  totalInDb: number;
  delusionScore: number;
  urgency: number;
}

interface ChartPoint {
  date: string;
  acc: number;
}

interface AnalyticsStats {
  total: number;
  streak: number;
  categories: CategoryStat[];
  chartPoints: ChartPoint[];
}

interface UserActivityEntry {
  is_correct: boolean;
  user_rating: number;
  attempted_at: string;
  question_id: string;
  questions: { category: string } | { category: string }[] | null;
}

export default function AnalyticsPage() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortType>('urgency');
  const [hoveredSort, setHoveredSort] = useState<SortType | null>(null);

  const sortExplanations: Record<SortType, string> = {
    urgency: "Focus here: High confidence but low accuracy. These are your 'Blind Spots'.",
    worst: "Your lowest scoring subjects. Good for heavy-lifting review sessions.",
    best: "Your strongest subjects. Great for a quick confidence boost or maintenance.",
    alpha: "Simple A-Z list to help you find a specific category quickly.",
    mastery: "Sort by 'Cleared' status. High mastery means you've gotten most questions right at least once."
  };

  useEffect(() => {
    async function fetchEverything() {
      if (status === "loading" || !session?.user?.email) return;

      const { data: countsData, error: countError } = await supabase
        .rpc('get_category_counts');

      // Address 'countError' is assigned a value but never used
      if (countError) {
        console.error("Error fetching category counts:", countError);
      }

      const totalPerCat: Record<string, number> = {};
      countsData?.forEach((item: { cat_name: string, q_count: number }) => {
        const normalized = item.cat_name?.trim().replace(/\s+/g, ' ') || 'General';
        totalPerCat[normalized] = Number(item.q_count);
      });

      const { data: activity } = await supabase
        .from('user_activity')
        .select(`
          is_correct, user_rating, attempted_at, question_id,
          questions (category)
        `)
        .eq('user_email', session.user.email)
        .order('attempted_at', { ascending: false });

      if (activity) {
        // Cast the activity to our defined interface
        processAnalytics(activity as unknown as UserActivityEntry[], totalPerCat);
      }
      setLoading(false);
    }
    fetchEverything();
  }, [session, status]);

  const processAnalytics = (data: UserActivityEntry[], totalPerCat: Record<string, number>) => {
    const categoryMap: Record<string, { 
      total: number; 
      correct: number; 
      sumRating: number; 
      seenIds: Set<string>; 
      masteredIds: Set<string>; 
    }> = {};
    
    const daysSet = new Set<string>();
    const trendData: Record<string, { total: number; correct: number }> = {};

    data.forEach(entry => {
      const rawCat = Array.isArray(entry.questions) ? entry.questions[0]?.category : entry.questions?.category;
      const cat = rawCat?.trim().replace(/\s+/g, ' ') || 'General';
      const dateKey = new Date(entry.attempted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      daysSet.add(new Date(entry.attempted_at).toDateString());

      if (!categoryMap[cat]) {
        categoryMap[cat] = { total: 0, correct: 0, sumRating: 0, seenIds: new Set(), masteredIds: new Set() };
      }

      categoryMap[cat].total++;
      categoryMap[cat].sumRating += (entry.user_rating || 5);
      categoryMap[cat].seenIds.add(entry.question_id);

      if (entry.is_correct) {
        categoryMap[cat].correct++;
        categoryMap[cat].masteredIds.add(entry.question_id);
      }

      if (!trendData[dateKey]) trendData[dateKey] = { total: 0, correct: 0 };
      trendData[dateKey].total++;
      if (entry.is_correct) trendData[dateKey].correct++;
    });

    let streak = 0;
    const checkDate = new Date(); // Using const as the variable isn't reassigned, the object is mutated
    while (daysSet.has(checkDate.toDateString())) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    const chartPoints: ChartPoint[] = Object.entries(trendData)
      .map(([date, d]) => ({ date, acc: (d.correct / d.total) * 100 }))
      .slice(0, 7)
      .reverse();

    const categories: CategoryStat[] = Object.entries(categoryMap).map(([name, d]) => {
      const accuracy = (d.correct / d.total) * 100;
      const avgRating = d.sumRating / d.total;
      const seenCount = d.seenIds.size;
      const masteredCount = d.masteredIds.size;
      const totalInDb = totalPerCat[name] || seenCount;
      const delusionScore = (avgRating * 10) - accuracy;

      return {
        name,
        accuracy,
        avgRating,
        volume: d.total,
        seenCount,
        masteredCount,
        totalInDb,
        delusionScore,
        urgency: avgRating - (accuracy / 10)
      };
    });

    setStats({ total: data.length, streak, categories, chartPoints });
  };

  const getDelusionLabel = (score: number) => {
    if (score > 30) return { label: "Highly Delusional", color: "#ef4444" };
    if (score > 10) return { label: "Overconfident", color: "#f59e0b" };
    if (score < -15) return { label: "Imposter Syndrome", color: "#60a5fa" };
    return { label: "Self-Aware", color: "#10b981" };
  };

  const getSortedCategories = (): CategoryStat[] => {
    if (!stats) return [];
    const cats = [...stats.categories];
    switch (sortBy) {
      case 'alpha': return cats.sort((a, b) => a.name.localeCompare(b.name));
      case 'worst': return cats.sort((a, b) => a.accuracy - b.accuracy);
      case 'best': return cats.sort((a, b) => b.accuracy - a.accuracy);
      case 'urgency': return cats.sort((a, b) => b.urgency - a.urgency);
      case 'mastery':
        return cats.sort((a, b) => {
          const masteryA = a.masteredCount / a.totalInDb;
          const masteryB = b.masteredCount / b.totalInDb;
          return masteryB - masteryA;
        });
      default: return cats;
    }
  };

  if (loading) return <p style={{ padding: '2rem' }}>Crunching numbers...</p>;
  if (!stats || stats.total === 0) return <p style={{ padding: '2rem' }}>Go tackle some questions to see your data!</p>;

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Performance & Insights</h1>
        <div style={{ padding: '8px 16px', borderRadius: '20px', border: '2px solid #f59e0b', color: '#f59e0b', fontWeight: 'bold' }}>
          🔥 {stats.streak} Day Streak
        </div>
      </div>

      <section style={{ marginBottom: '3rem' }}>
        <h3 style={{ marginBottom: '1.5rem' }}>7-Day Accuracy Trend</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '15px', height: '180px', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', borderBottom: '2px solid #444' }}>
          {stats.chartPoints.map((p) => (
            <div key={p.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%' }}>
              <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>{p.acc.toFixed(0)}%</span>
              <div style={{ width: '100%', maxWidth: '40px', height: `${Math.max(p.acc, 4)}%`, background: p.acc > 0 ? '#0070f3' : '#444', borderRadius: '6px 6px 0 0', boxShadow: p.acc > 0 ? '0 0 15px rgba(0, 112, 243, 0.3)' : 'none' }} />
              <span style={{ fontSize: '0.7rem', opacity: 0.6, whiteSpace: 'nowrap', marginTop: 'auto' }}>{p.date}</span>
            </div>
          ))}
        </div>
      </section>

      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ margin: 0 }}>Category Breakdown</h2>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(['urgency', 'mastery', 'worst', 'best', 'alpha'] as SortType[]).map(type => (
              <button
                key={type}
                onClick={() => setSortBy(type)}
                onMouseEnter={() => setHoveredSort(type)}
                onMouseLeave={() => setHoveredSort(null)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #444',
                  background: sortBy === type ? '#0070f3' : 'transparent',
                  color: sortBy === type ? 'white' : 'inherit',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  transition: 'all 0.2s ease'
                }}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ minHeight: '20px', fontSize: '0.85rem', color: '#aaa', fontStyle: 'italic', paddingLeft: '5px', borderLeft: '2px solid #0070f3' }}>
          {hoveredSort ? sortExplanations[hoveredSort] : sortExplanations[sortBy]}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
        {getSortedCategories().map((cat) => {
          const delusion = getDelusionLabel(cat.delusionScore);
          return (
            <div key={cat.name} style={{ padding: '1.2rem', border: '1px solid #333', borderRadius: '12px', position: 'relative', background: 'rgba(128, 128, 128, 0.08)' }}>
              {sortBy === 'urgency' && cat.urgency > 2 && (
                <span style={{ position: 'absolute', top: '-10px', right: '10px', background: '#ef4444', color: 'white', fontSize: '0.6rem', padding: '2px 8px', borderRadius: '10px' }}>PRIORITY</span>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <strong style={{ fontSize: '1.1rem' }}>{cat.name}</strong>
                <span style={{ fontWeight: 'bold', color: cat.accuracy > 75 ? '#10b981' : 'inherit' }}>{cat.accuracy.toFixed(0)}%</span>
              </div>

              <div style={{ height: '8px', background: '#222', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{ height: '100%', width: `${cat.accuracy}%`, background: cat.accuracy > 70 ? '#10b981' : cat.accuracy > 40 ? '#0070f3' : '#ef4444' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.9, marginBottom: '4px' }}>
                <span>Avg Confidence: <strong>{cat.avgRating.toFixed(1)}/10</strong></span>
                <span>Seen: <strong>{cat.seenCount}/{cat.totalInDb}</strong></span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.8rem', opacity: 0.9, marginBottom: '8px' }}>
                <span style={{ color: cat.masteredCount === cat.totalInDb ? '#10b981' : 'inherit' }}>
                  Mastered: <strong>{cat.masteredCount}/{cat.totalInDb}</strong>
                </span>
              </div>

              <div style={{ height: '4px', background: '#222', borderRadius: '2px', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{ position: 'relative', height: '100%', width: '100%', background: '#333' }}>
                  <div style={{
                    position: 'absolute',
                    height: '100%',
                    width: `${(cat.seenCount / cat.totalInDb) * 100}%`,
                    background: '#60a5fa',
                    opacity: 0.3
                  }} />
                  <div style={{
                    position: 'absolute',
                    height: '100%',
                    width: `${(cat.masteredCount / cat.totalInDb) * 100}%`,
                    background: '#10b981',
                    boxShadow: '0 0 5px rgba(16, 185, 129, 0.4)'
                  }} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #333' }}>
                <span style={{ color: '#aaa' }}>{cat.volume} Total Attempts</span>
                <span style={{ color: delusion.color, fontWeight: 'bold' }}>
                  Index: {cat.delusionScore.toFixed(0)} ({delusion.label})
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}