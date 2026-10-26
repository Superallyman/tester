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
            const [rows, review, saved] = await Promise.all([
                api<ActivityRow[]>('/api/activity').catch(() => [] as ActivityRow[]),
                api<{ dueIds: string[]; upcoming: { day: string; n: number }[] }>(`/api/review${qs({ tz })}`).catch(() => null),
                api<{ bookmarks: string[] }>('/api/notes').catch(() => ({ bookmarks: [] as string[] })),
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
                { key: 'bookmarked', title: 'Bookmarked', blurb: 'Questions you starred to come back to', ids: saved.bookmarks, color: '#db2777' },
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

    // While loading: the same header and card grid as placeholders, so the customizer below doesn't jump
    if (email && !presets) return <SmartReviewSkeleton />;
    if (!email || !presets || (presets.every(p => p.ids.length === 0) && !weakest)) return null;

    const card = (color: string, disabled: boolean): React.CSSProperties => ({
        height: CARD_HEIGHT, boxSizing: 'border-box', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', gap: 4, overflow: 'hidden',
        boxShadow: disabled ? undefined : `inset 3px 0 0 ${color}, 0 0 14px color-mix(in srgb, ${color} 14%, transparent)`,
        opacity: disabled ? 0.45 : 1, cursor: disabled ? 'default' : 'pointer',
    });

    return (
        <section style={{ marginBottom: '1.5rem' }}>
            <SmartReviewHeader>
                <label className="orbit-row" style={{ gap: 8 }}>
                    <span className="orbit-label">Questions per set</span>
                    <input
                        type="number"
                        min={1}
                        max={MAX_SET_SIZE}
                        value={sizeInput}
                        onChange={e => changeSize(e.target.value)}
                        onBlur={() => changeSize(String(setSize))}
                        className="orbit-input"
                        style={{ width: 72, padding: '5px 8px', fontSize: '0.85rem' }}
                    />
                </label>
            </SmartReviewHeader>
            <div style={GRID}>
                {presets.map(p => (
                    <button
                        key={p.key}
                        disabled={p.ids.length === 0}
                        onClick={() => onQuestionsFound((p.ordered ? p.ids : shuffle(p.ids)).slice(0, setSize))}
                        className="orbit-option"
                        style={card(p.color, p.ids.length === 0)}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                            <span style={TITLE} title={p.title}>{p.title}</span>
                            <span style={{ fontSize: '1.3rem', fontWeight: 300, fontVariantNumeric: 'tabular-nums' }}>{p.ids.length}</span>
                        </div>
                        <div className="orbit-muted" style={BLURB} title={p.blurb}>{p.blurb}</div>
                    </button>
                ))}
                {weakest && (
                    <button onClick={startWeakest} disabled={loadingWeak} className="orbit-option" style={card('#a855f7', false)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                            <span style={TITLE}>{loadingWeak ? 'Loading…' : 'Weakest category'}</span>
                            <span style={{ fontSize: '1.3rem', fontWeight: 300, fontVariantNumeric: 'tabular-nums' }}>{weakest.accuracy.toFixed(0)}%</span>
                        </div>
                        <div className="orbit-muted" style={BLURB} title={weakest.category}>{weakest.category}: questions you haven&apos;t mastered</div>
                    </button>
                )}
            </div>
            <p className="orbit-muted" style={{ marginTop: 8 }}>Each set draws up to {setSize} random questions.</p>
        </section>
    );
}

// Fixed, so the skeleton and the loaded cards are exactly the same size: titles keep to one line, blurbs to two
// In rem so it follows the text size: room for a one-line title and a two-line blurb
const CARD_HEIGHT = '6.5rem';
const Ghost = ({ children }: { children: React.ReactNode }) => <span className="orbit-skeleton orbit-skeleton--ghost">{children}</span>;
const TITLE: React.CSSProperties = { fontSize: '0.92rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 };
const BLURB: React.CSSProperties = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
const GRID: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 };

function SmartReviewHeader({ children }: { children?: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap', minHeight: 34 }}>
            <h2 className="orbit-label" style={{ margin: 0 }}>Quick Smart Review</h2>
            {children}
        </div>
    );
}

// Six cards: due, still wrong, never right, fading, bookmarked, weakest category (the most there can be).
// Same markup as the loaded section with ghosted text, so it is the same size at any font size.
function SmartReviewSkeleton() {
    return (
        <section aria-hidden="true" style={{ marginBottom: '1.5rem' }}>
            <SmartReviewHeader>
                <span className="orbit-row" style={{ gap: 8 }}>
                    <span className="orbit-label"><Ghost>Questions per set</Ghost></span>
                    <span className="orbit-input" style={{ width: 72, padding: '5px 8px', fontSize: '0.85rem', color: 'transparent' }}>20</span>
                </span>
            </SmartReviewHeader>
            <div style={GRID}>
                {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="orbit-option" style={{ height: CARD_HEIGHT, boxSizing: 'border-box', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', gap: 4, overflow: 'hidden', cursor: 'default' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                            <span style={TITLE}><Ghost>Still wrong</Ghost></span>
                            <span style={{ fontSize: '1.3rem', fontWeight: 300 }}><Ghost>00</Ghost></span>
                        </div>
                        <div className="orbit-muted" style={BLURB}><Ghost>Your most recent attempt</Ghost></div>
                    </div>
                ))}
            </div>
            <p className="orbit-muted" style={{ marginTop: 8 }}><Ghost>Each set draws up to 20 random questions.</Ghost></p>
        </section>
    );
}
