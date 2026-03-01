"use client"

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/utils/supabase';
import { useSession } from "next-auth/react";

// --- Types & Interfaces ---
type SortType = 'alpha' | 'worst' | 'best' | 'urgency' | 'mastery' | 'frustration';

interface CategoryStat {
  name: string;
  accuracy: number;
  avgRating: number;      
  avgSatisfaction: number;
  volume: number;
  seenCount: number;
  masteredCount: number;
  totalInDb: number;
  delusionScore: number;
  urgency: number;
  lastAttempted: string; // Added field
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
  satisfaction_rating: number | null; 
  attempted_at: string;
  question_id: string;
  questions: { category: string } | { category: string }[] | null;
}

interface CategoryMapEntry {
  total: number;
  correct: number;
  sumRating: number;
  sumSatisfaction: number;
  satCount: number;
  seenIds: Set<string>;
  masteredIds: Set<string>;
  latestTimestamp: number; // Added to track most recent activity
}

export default function AnalyticsPage() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortType>('urgency');
  const [hoveredSort, setHoveredSort] = useState<SortType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const sortExplanations: Record<SortType, string> = {
    urgency: "High confidence but low accuracy. These are your 'Blind Spots'.",
    worst: "Your lowest scoring subjects based on percentage.",
    best: "Your strongest subjects.",
    alpha: "A-Z category list.",
    mastery: "Percent of unique questions gotten correct at least once.",
    frustration: "Lowest satisfaction scores. Subjects that are annoying or confusing."
  };

  // Helper for human-readable dates
  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const past = new Date(dateString);
    const diffInMs = now.getTime() - past.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    return past.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const processAnalytics = (data: UserActivityEntry[], totalPerCat: Record<string, number>) => {
    const categoryMap: Record<string, CategoryMapEntry> = {};
    const daysSet = new Set<string>();
    const trendData: Record<string, { total: number; correct: number; timestamp: number }> = {};

    data.forEach(entry => {
      const rawCat = Array.isArray(entry.questions) ? entry.questions[0]?.category : entry.questions?.category;
      const cat = rawCat?.trim() || 'General';
      
      const dateObj = new Date(entry.attempted_at);
      const timestamp = dateObj.getTime();
      const dateKey = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      daysSet.add(dateObj.toDateString());

      if (!categoryMap[cat]) {
        categoryMap[cat] = { 
          total: 0, correct: 0, sumRating: 0, sumSatisfaction: 0, 
          satCount: 0, seenIds: new Set(), masteredIds: new Set(),
          latestTimestamp: 0
        };
      }

      categoryMap[cat].total++;
      categoryMap[cat].sumRating += (entry.user_rating || 0);
      
      // Track the latest attempt
      if (timestamp > categoryMap[cat].latestTimestamp) {
        categoryMap[cat].latestTimestamp = timestamp;
      }

      if (entry.satisfaction_rating !== null) {
        categoryMap[cat].sumSatisfaction += entry.satisfaction_rating;
        categoryMap[cat].satCount++;
      }
      categoryMap[cat].seenIds.add(entry.question_id);
      if (entry.is_correct) {
        categoryMap[cat].correct++;
        categoryMap[cat].masteredIds.add(entry.question_id);
      }

      if (!trendData[dateKey]) trendData[dateKey] = { total: 0, correct: 0, timestamp };
      trendData[dateKey].total++;
      if (entry.is_correct) trendData[dateKey].correct++;
    });

    let streak = 0;
    const checkDate = new Date();
    while (daysSet.has(checkDate.toDateString())) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    const categories: CategoryStat[] = Object.entries(categoryMap).map(([name, d]) => {
      const accuracy = (d.correct / d.total) * 100;
      const avgRating = d.sumRating / d.total;
      const avgSatisfaction = d.satCount > 0 ? d.sumSatisfaction / d.satCount : 0;
      const seenCount = d.seenIds.size;
      const masteredCount = d.masteredIds.size;
      const totalInDb = totalPerCat[name] || seenCount;
      const delusionScore = (avgRating * 25) - accuracy;

      return {
        name, accuracy, avgRating, avgSatisfaction, volume: d.total,
        seenCount, masteredCount, totalInDb, delusionScore,
        urgency: avgRating - (accuracy / 25),
        lastAttempted: new Date(d.latestTimestamp).toISOString()
      };
    });

    const chartPoints = Object.entries(trendData)
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .slice(0, 7)
      .reverse()
      .map(([date, d]) => ({ date, acc: (d.correct / d.total) * 100 }));

    setStats({ total: data.length, streak, categories, chartPoints });
  };

  useEffect(() => {
    async function fetchEverything() {
      if (status === "loading" || !session?.user?.email) return;

      const { data: countsData, error: countErr } = await supabase.rpc('get_category_counts');
      if (countErr) console.error(countErr);

      const totalPerCat: Record<string, number> = {};
      countsData?.forEach((item: { cat_name: string, q_count: number }) => {
        const normalized = item.cat_name?.trim() || 'General';
        totalPerCat[normalized] = Number(item.q_count);
      });

      const { data: activity, error: activityErr } = await supabase
        .from('user_activity')
        .select(`
          is_correct, user_rating, satisfaction_rating, attempted_at, question_id,
          questions (category)
        `)
        .eq('user_email', session.user.email)
        .order('attempted_at', { ascending: false });

      if (activityErr) console.error(activityErr);

      if (activity) {
        processAnalytics(activity as unknown as UserActivityEntry[], totalPerCat);
      }
      setLoading(false);
    }
    fetchEverything();
  }, [session, status]);

  const filteredAndSortedCategories = useMemo(() => {
    if (!stats) return [];
    
    const result = stats.categories.filter(cat => 
      cat.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    switch (sortBy) {
      case 'alpha': result.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'worst': result.sort((a, b) => a.accuracy - b.accuracy); break;
      case 'best': result.sort((a, b) => b.accuracy - a.accuracy); break;
      case 'urgency': result.sort((a, b) => b.urgency - a.urgency); break;
      case 'frustration': result.sort((a, b) => a.avgSatisfaction - b.avgSatisfaction); break;
      case 'mastery': result.sort((a, b) => (b.masteredCount / b.totalInDb) - (a.masteredCount / a.totalInDb)); break;
    }
    
    return result;
  }, [stats, sortBy, searchTerm]);

  const getDelusionLabel = (score: number) => {
    if (score > 30) return { label: "Highly Delusional", color: "#ef4444" };
    if (score > 10) return { label: "Overconfident", color: "#f59e0b" };
    if (score < -15) return { label: "Imposter Syndrome", color: "#60a5fa" };
    return { label: "Self-Aware", color: "#10b981" };
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
          
          <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
            <input 
              type="text"
              placeholder="Search categories..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 15px',
                paddingRight: '35px',
                borderRadius: '8px',
                border: '1px solid #444',
                background: 'rgba(255,255,255,0.05)',
                color: 'white',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.1rem'
                }}
              >
                ×
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(['urgency', 'mastery', 'worst', 'best', 'alpha', 'frustration'] as SortType[]).map(type => (
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
        {filteredAndSortedCategories.map((cat) => {
          const delusion = getDelusionLabel(cat.delusionScore);
          return (
            <div key={cat.name} style={{ padding: '1.2rem', border: '1px solid #333', borderRadius: '12px', position: 'relative', background: 'rgba(128, 128, 128, 0.08)' }}>
              {sortBy === 'urgency' && cat.urgency > 2 && (
                <span style={{ position: 'absolute', top: '-10px', right: '10px', background: '#ef4444', color: 'white', fontSize: '0.6rem', padding: '2px 8px', borderRadius: '10px' }}>PRIORITY</span>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <strong style={{ fontSize: '1.1rem' }}>{cat.name}</strong>
                <span style={{ fontWeight: 'bold', color: cat.accuracy > 75 ? '#10b981' : 'inherit' }}>{cat.accuracy.toFixed(0)}%</span>
              </div>
              
              {/* Last Attempted Label */}
              <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '10px' }}>
                Last Attempted: {formatTimeAgo(cat.lastAttempted)}
              </div>

              <div style={{ height: '8px', background: '#222', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{ height: '100%', width: `${cat.accuracy}%`, background: cat.accuracy > 70 ? '#10b981' : cat.accuracy > 40 ? '#0070f3' : '#ef4444' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.9, marginBottom: '4px' }}>
                <span>Avg Confidence: <strong>{cat.avgRating.toFixed(1)}/4</strong></span>
                <span>Seen: <strong>{cat.seenCount}/{cat.totalInDb}</strong></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.9, marginBottom: '4px' }}>
                <span>Avg Satisfaction: <strong style={{ color: cat.avgSatisfaction > 3 ? '#10b981' : 'inherit' }}>{cat.avgSatisfaction.toFixed(1)}/4</strong></span>
                <span style={{ color: cat.masteredCount === cat.totalInDb ? '#10b981' : 'inherit' }}>
                  Mastered: <strong>{cat.masteredCount}/{cat.totalInDb}</strong>
                </span>
              </div>

              <div style={{ height: '4px', background: '#222', borderRadius: '2px', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{ position: 'relative', height: '100%', width: '100%', background: '#333' }}>
                  <div style={{
                    position: 'absolute', height: '100%', width: `${(cat.seenCount / cat.totalInDb) * 100}%`,
                    background: '#60a5fa', opacity: 0.3
                  }} />
                  <div style={{
                    position: 'absolute', height: '100%', width: `${(cat.masteredCount / cat.totalInDb) * 100}%`,
                    background: '#10b981', boxShadow: '0 0 5px rgba(16, 185, 129, 0.4)'
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
      
      {filteredAndSortedCategories.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
          No categories found matching &quot;{searchTerm}&quot;
        </div>
      )}
    </main>
  );
}