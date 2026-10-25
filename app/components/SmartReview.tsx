"use client"

// SmartReview.tsx — one-click study sets built from the user's own history

import React, { useEffect, useState } from 'react';
import { useSession } from "next-auth/react";
import { api, qs } from '@/utils/api';

interface SmartReviewProps {
    onQuestionsFound: (ids: string[]) => void;
}

interface ActivityRow {
    question_id: string;
    is_correct: boolean;
    attempted_at: string;
    category: string | null;
}

interface Preset {
    key: string;
    title: string;
    blurb: string;
    ids: string[];
    color: string;
    ordered?: boolean; // keep the server's order (most overdue first) instead of shuffling
}

const DEFAULT_SET_SIZE = 20;
const MAX_SET_SIZE = 500;
const SIZE_KEY = 'smartReviewSize';
const FADE_DAYS = 14;

const shuffle = <T,>(arr: T[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

const categoryOf = (row: ActivityRow) => row.category?.trim().replace(/\s+/g, ' ') || 'General';

export default function SmartReview({ onQuestionsFound }: SmartReviewProps) {
    const { data: session } = useSession();
    const email = session?.user?.email;
    const [presets, setPresets] = useState<Preset[] | null>(null);
    const [weakest, setWeakest] = useState<{ category: string; accuracy: number; attempts: number } | null>(null);
    const [loadingWeak, setLoadingWeak] = useState(false);
    const [sizeInput, setSizeInput] = useState(String(DEFAULT_SET_SIZE));
    const setSize = Math.min(MAX_SET_SIZE, Math.max(1, parseInt(sizeInput, 10) || DEFAULT_SET_SIZE));

    useEffect(() => {
        try {
            const saved = localStorage.getItem(SIZE_KEY);
            if (saved) setSizeInput(saved);
        } catch { /* storage blocked: keep the default */ }
    }, []);

    const changeSize = (value: string) => {
        setSizeInput(value);
        try { localStorage.setItem(SIZE_KEY, value); } catch { /* ignore */ }
    };

    useEffect(() => {
        if (!email) return;
        let cancelled = false;

        (async () => {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const [rows, review] = await Promise.all([
                api<ActivityRow[]>('/api/activity').catch(() => [] as ActivityRow[]),
                api<{ dueIds: string[]; upcoming: { day: string; n: number }[] }>(`/api/review${qs({ tz })}`).catch(() => null),
            ]);
            if (cancelled) return;
            if (rows.length === 0) { setPresets([]); return; }

            // Rows are oldest-first, so the last write per question wins
            const latest = new Map<string, ActivityRow>();
            const everCorrect = new Set<string>();
            const perCat: Record<string, { correct: number; total: number }> = {};
            rows.forEach(r => {
                latest.set(r.question_id, r);
                if (r.is_correct) everCorrect.add(r.question_id);
                const c = (perCat[categoryOf(r)] ||= { correct: 0, total: 0 });
                c.total++;
                if (r.is_correct) c.correct++;
            });

            const now = Date.now();
            const stillWrong: string[] = [];
            const fading: string[] = [];
            const neverRight: string[] = [];
            latest.forEach((r, id) => {
                if (!r.is_correct) stillWrong.push(id);
                else if (now - new Date(r.attempted_at).getTime() > FADE_DAYS * 86400000) fading.push(id);
                if (!everCorrect.has(id)) neverRight.push(id);
            });

            const weak = Object.entries(perCat)
                .filter(([, c]) => c.total >= 8)
                .map(([category, c]) => ({ category, accuracy: (c.correct / c.total) * 100, attempts: c.total }))
                .sort((a, b) => a.accuracy - b.accuracy)[0] || null;

            if (cancelled) return;
            setWeakest(weak);
            const soon = review?.upcoming.reduce((sum, d) => sum + d.n, 0) ?? 0;
            setPresets([
                {
                    key: 'due', title: 'Due for review', ids: review?.dueIds ?? [], color: '#10b981', ordered: true,
                    blurb: review?.dueIds.length ? 'Spaced repetition: scheduled for today, most overdue first'
                        : soon ? `All caught up · ${soon} due in the next 7 days` : 'All caught up',
                },
                { key: 'wrong', title: 'Still wrong', blurb: 'Your most recent attempt was incorrect', ids: stillWrong, color: '#ef4444' },
                { key: 'never', title: 'Never gotten right', blurb: 'Seen, but not answered correctly yet', ids: neverRight, color: '#f59e0b' },
                { key: 'fading', title: 'Fading', blurb: `Correct last time, but over ${FADE_DAYS} days ago`, ids: fading, color: '#3b82f6' },
            ]);
        })();

        return () => { cancelled = true; };
    }, [email]);

    const startWeakest = async () => {
        if (!weakest || !email) return;
        setLoadingWeak(true);
        try {
            const [questions, activity] = await Promise.all([
                api<{ id: string; category: string }[]>('/api/questions'),
                api<{ question_id: string; is_correct: boolean }[]>('/api/activity'),
            ]);
            const mastered = new Set(activity.filter(a => a.is_correct).map(a => a.question_id));
            const pool = questions
                .filter(q => (q.category?.trim().replace(/\s+/g, ' ') || 'General') === weakest.category && !mastered.has(q.id))
                .map(q => q.id);
            if (pool.length) onQuestionsFound(shuffle(pool).slice(0, setSize));
        } finally {
            setLoadingWeak(false);
        }
    };

    if (!email || !presets || (presets.every(p => p.ids.length === 0) && !weakest)) return null;

    const cardStyle = (color: string, disabled: boolean): React.CSSProperties => ({
        textAlign: 'left',
        padding: '12px 14px',
        borderRadius: '10px',
        border: '1px solid rgba(128,128,128,0.2)',
        borderLeft: `4px solid ${color}`,
        background: 'rgba(128,128,128,0.05)',
        color: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
    });

    return (
        <section style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '0.75rem', letterSpacing: '0.06em', opacity: 0.6, margin: 0, fontWeight: 600 }}>QUICK SMART REVIEW</h2>
                <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ opacity: 0.7 }}>Questions per set</span>
                    <input
                        type="number"
                        min={1}
                        max={MAX_SET_SIZE}
                        value={sizeInput}
                        onChange={e => changeSize(e.target.value)}
                        onBlur={() => changeSize(String(setSize))}
                        style={{ width: 64, padding: '4px 6px', borderRadius: 6, border: '1px solid rgba(128,128,128,0.4)', background: 'transparent', color: 'inherit', fontSize: '0.8rem' }}
                    />
                </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
                {presets.map(p => (
                    <button
                        key={p.key}
                        disabled={p.ids.length === 0}
                        onClick={() => onQuestionsFound((p.ordered ? p.ids : shuffle(p.ids)).slice(0, setSize))}
                        style={cardStyle(p.color, p.ids.length === 0)}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                            <strong style={{ fontSize: '0.95rem' }}>{p.title}</strong>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: p.color }}>{p.ids.length}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: 4 }}>{p.blurb}</div>
                    </button>
                ))}
                {weakest && (
                    <button onClick={startWeakest} disabled={loadingWeak} style={cardStyle('#a855f7', false)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                            <strong style={{ fontSize: '0.95rem' }}>{loadingWeak ? 'Loading…' : 'Weakest category'}</strong>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a855f7' }}>{weakest.accuracy.toFixed(0)}%</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: 4 }}>{weakest.category}: questions you haven&apos;t mastered</div>
                    </button>
                )}
            </div>
            <p style={{ fontSize: '0.7rem', opacity: 0.5, margin: '6px 0 0' }}>Each set draws up to {setSize} random questions.</p>
        </section>
    );
}
