"use client"

import React, { useEffect, useState, useMemo } from 'react';
import { api } from '@/utils/api';
import { useSession } from "next-auth/react";
import StudyHeatmap from '../components/StudyHeatmap';
import { useProgress } from '../components/useProgress';
import Insights from './Insights';

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
  lastAttempted: string;
}

interface AnalyticsStats {
  total: number;
  totalCorrect: number;
  overallAccuracy: number;
  streak: number;
  categories: CategoryStat[];
}

interface UserActivityEntry {
  is_correct: boolean;
  user_rating: number | null;
  satisfaction_rating: number | null;
  attempted_at: string;
  question_id: string;
  category: string | null;
  answered: boolean; // false for skips
}

interface CategoryMapEntry {
  total: number;
  correct: number;
  sumRating: number;
  sumSatisfaction: number;
  satCount: number;
  ratingCount: number;
  seenIds: Set<string>;
  masteredIds: Set<string>;
  latestTimestamp: number;
}

export default function AnalyticsPage() {
  const { progress } = useProgress();
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

    let totalCorrect = 0;

    data.forEach(entry => {
      if (entry.is_correct) totalCorrect++;

      const rawCat = entry.category;
      const cat = rawCat?.trim() || 'General';

      const dateObj = new Date(entry.attempted_at);
      const timestamp = dateObj.getTime();
      daysSet.add(dateObj.toDateString());

      if (!categoryMap[cat]) {
        categoryMap[cat] = {
          total: 0, correct: 0, sumRating: 0, sumSatisfaction: 0,
          satCount: 0, ratingCount: 0, seenIds: new Set(), masteredIds: new Set(),
          latestTimestamp: 0
        };
      }

      categoryMap[cat].total++;
      // Practice-exam rows have no confidence rating; only average the rated attempts
      if (entry.user_rating !== null) {
        categoryMap[cat].sumRating += entry.user_rating;
        categoryMap[cat].ratingCount++;
      }

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

    });

    let streak = 0;
    const checkDate = new Date();
    while (daysSet.has(checkDate.toDateString())) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    const categories: CategoryStat[] = Object.entries(categoryMap).map(([name, d]) => {
      const accuracy = (d.correct / d.total) * 100;
      const avgRating = d.ratingCount > 0 ? d.sumRating / d.ratingCount : 0;
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

    const total = data.length;
    const overallAccuracy = total > 0 ? (totalCorrect / total) * 100 : 0;

    setStats({ total, totalCorrect, overallAccuracy, streak, categories });
  };

  useEffect(() => {
    async function fetchEverything() {
      if (status === "loading" || !session?.user?.email) return;

      const countsData = await api<{ cat_name: string, q_count: number }[]>('/api/categories').catch(err => { console.error(err); return null; });

      const totalPerCat: Record<string, number> = {};
      countsData?.forEach((item: { cat_name: string, q_count: number }) => {
        const normalized = item.cat_name?.trim() || 'General';
        totalPerCat[normalized] = Number(item.q_count);
      });

      try {
        // Newest first, as the analytics code expects
        // Skips (no answer picked) aren't attempts
        const activity = (await api<UserActivityEntry[]>('/api/activity')).filter(a => a.answered).reverse();
        processAnalytics(activity, totalPerCat);
      } catch (activityErr) {
        console.error(activityErr);
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
    if (score > 30) return { label: "Highly Delusional", color: "var(--orbit-bad)" };
    if (score > 10) return { label: "Overconfident", color: "var(--orbit-warn)" };
    if (score < -15) return { label: "Imposter Syndrome", color: "var(--orbit-accent)" };
    return { label: "Self-Aware", color: "var(--orbit-good)" };
  };

  if (loading) return <p className="orbit-muted" style={{ padding: '2rem', textAlign: 'center' }}>Crunching numbers…</p>;
  if (!stats || stats.total === 0) return <p className="orbit-body" style={{ padding: '2rem', textAlign: 'center' }}>Go tackle some questions to see your data!</p>;

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1rem 4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: '1.75rem' }}>
        <div>
          <p className="orbit-label">Analytics</p>
          <h1 className="orbit-title" style={{ marginTop: 6 }}>Performance &amp; Insights</h1>
        </div>
        <span className="orbit-badge" style={{ color: 'var(--orbit-warn)', fontSize: '0.66rem', padding: '6px 12px' }}>
          {progress?.streak ?? stats.streak}-day streak
        </span>
      </div>

      {progress && (
        <section className="orbit-card" style={{ marginBottom: '2rem' }}>
          <StudyHeatmap days={progress.days} today={progress.today} />
        </section>
      )}

      <Insights />

      {/* --- Overall Stats Summary Component --- */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 className="orbit-h2" style={{ marginBottom: '1rem' }}>Overall Performance</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div className="orbit-card">
            <span className="orbit-label" style={{ display: 'block' }}>Total Practice Volume</span>
            <div className="orbit-stat" style={{ margin: '10px 0 8px' }}>{stats.total}</div>
            <span className="orbit-muted">
              {stats.categories.reduce((acc, cat) => acc + cat.seenCount, 0)} of {' '}
              {stats.categories.reduce((acc, cat) => acc + cat.totalInDb, 0)} unique questions seen
            </span>
          </div>
          <div className="orbit-card">
            <span className="orbit-label" style={{ display: 'block' }}>Questions Correct</span>
            <div className="orbit-stat" style={{ margin: '10px 0 8px', color: 'var(--orbit-good)' }}>{stats.totalCorrect}</div>
            <span className="orbit-muted">Out of {stats.total} attempts</span>
          </div>
          <div className="orbit-card">
            <span className="orbit-label" style={{ display: 'block' }}>Overall Accuracy</span>
            <div className="orbit-stat" style={{ margin: '10px 0 12px' }}>{stats.overallAccuracy.toFixed(1)}%</div>
            <div className={`orbit-progress ${stats.overallAccuracy >= 70 ? 'orbit-progress--good' : ''}`}>
              <span style={{ width: `${stats.overallAccuracy}%`, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        </div>
      </section>

      <div style={{ marginBottom: '1.5rem' }} className="orbit-stack">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <h2 className="orbit-h2" style={{ margin: 0 }}>Category Breakdown</h2>
          <div style={{ position: 'relative', width: '100%', maxWidth: 300 }}>
            <input
              type="text"
              placeholder="Search categories..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="orbit-input"
              style={{ paddingRight: 34 }}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} aria-label="Clear search"
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'inherit', opacity: 0.5, cursor: 'pointer', fontSize: '1.1rem' }}>
                ×
              </button>
            )}
          </div>
        </div>
        <div className="orbit-segment" role="group" aria-label="Sort categories" style={{ flexWrap: 'wrap', alignSelf: 'flex-start' }}>
          {(['urgency', 'mastery', 'worst', 'best', 'alpha', 'frustration'] as SortType[]).map(type => (
            <button key={type} aria-pressed={sortBy === type} onClick={() => setSortBy(type)}
              onMouseEnter={() => setHoveredSort(type)} onMouseLeave={() => setHoveredSort(null)}>
              {type}
            </button>
          ))}
        </div>
        <p className="orbit-muted" style={{ minHeight: 20, paddingLeft: 10, borderLeft: '1px solid var(--orbit-accent)' }}>
          {hoveredSort ? sortExplanations[hoveredSort] : sortExplanations[sortBy]}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 16 }}>
        {filteredAndSortedCategories.map((cat) => {
          const delusion = getDelusionLabel(cat.delusionScore);
          const accColor = cat.accuracy > 70 ? 'var(--orbit-good)' : cat.accuracy > 40 ? 'var(--orbit-accent)' : 'var(--orbit-bad)';
          return (
            <div key={cat.name} className="orbit-card orbit-stack" style={{ position: 'relative', gap: 10 }}>
              {sortBy === 'urgency' && cat.urgency > 2 && (
                <span className="orbit-badge orbit-badge--bad" style={{ position: 'absolute', top: -9, right: 12 }}>Priority</span>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                <strong style={{ fontSize: '1.02rem', fontWeight: 500 }}>{cat.name}</strong>
                <span style={{ fontSize: '1.5rem', fontWeight: 300, fontVariantNumeric: 'tabular-nums' }}>{cat.accuracy.toFixed(0)}%</span>
              </div>
              <span className="orbit-label">Last attempted {formatTimeAgo(cat.lastAttempted)}</span>

              <div className="orbit-progress"><span style={{ width: `${cat.accuracy}%`, background: accColor, boxShadow: `0 0 10px ${accColor}` }} /></div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: '0.82rem' }}>
                <span>Avg confidence <strong>{cat.avgRating.toFixed(1)}/4</strong></span>
                <span style={{ textAlign: 'right' }}>Seen <strong>{cat.seenCount}/{cat.totalInDb}</strong></span>
                <span>Avg satisfaction <strong style={{ color: cat.avgSatisfaction > 3 ? 'var(--orbit-good)' : 'inherit' }}>{cat.avgSatisfaction.toFixed(1)}/4</strong></span>
                <span style={{ textAlign: 'right', color: cat.masteredCount === cat.totalInDb ? 'var(--orbit-good)' : 'inherit' }}>Mastered <strong>{cat.masteredCount}/{cat.totalInDb}</strong></span>
              </div>

              {/* Seen (faint) and mastered (glowing) share one track */}
              <div className="orbit-progress" style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', width: `${(cat.seenCount / cat.totalInDb) * 100}%`, opacity: 0.3, boxShadow: 'none' }} />
                <span style={{ position: 'absolute', width: `${(cat.masteredCount / cat.totalInDb) * 100}%`, background: 'var(--orbit-good)', boxShadow: '0 0 8px var(--orbit-good)' }} />
              </div>

              <hr className="orbit-divider" style={{ margin: '2px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span className="orbit-muted">{cat.volume} attempts</span>
                <span className="orbit-label" style={{ color: delusion.color, opacity: 1 }}>
                  Index {cat.delusionScore.toFixed(0)} · {delusion.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {filteredAndSortedCategories.length === 0 && (
        <p className="orbit-muted" style={{ textAlign: 'center', padding: '3rem' }}>
          No categories found matching &quot;{searchTerm}&quot;
        </p>
      )}
    </main>
  );
}
