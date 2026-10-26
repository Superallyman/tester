"use client"

// Exams one person set and others take exactly as set (same questions, order and time). Each person's first
// result is ranked: most correct first, then fastest. Only scores are shared, never anyone's answers.

import React, { useState } from 'react';
import { formatClock } from './examUtils';
import { glassCard } from '@/utils/orbitStyles';

export interface ChallengeEntry {
    name: string;
    me: boolean;
    correct: number;
    total: number;
    elapsed_sec: number;
    finished_at: string;
}

export interface Challenge {
    id: string;
    title: string;
    created_at: string;
    time_limit_sec: number | null;
    total: number;
    creator: string;
    mine: boolean;
    entries: ChallengeEntry[];
}

// Orbit glass surface
const card: React.CSSProperties = { ...glassCard, padding: '1rem 1.25rem' };

const pct = (e: ChallengeEntry) => (e.total ? (e.correct / e.total) * 100 : 0);

export default function Challenges({ challenges, busy, onTake, onDelete }: {
    challenges: Challenge[];
    busy: boolean;
    onTake: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const [showAll, setShowAll] = useState(false);
    if (!challenges.length) return null;
    const shown = showAll ? challenges : challenges.slice(0, 3);

    return (
        <section style={{ marginTop: '1.75rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 className="orbit-h2">Challenges</h2>
            {shown.map(c => {
                const mine = c.entries.find(e => e.me);
                return (
                    <article key={c.id} style={card} aria-label={`Challenge ${c.title}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 0 }}>
                                <strong>{c.title}</strong>
                                <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: 2 }}>
                                    {c.total} items · {c.time_limit_sec ? formatClock(c.time_limit_sec) : 'untimed'} · set by {c.mine ? 'you' : c.creator} on {new Date(c.created_at).toLocaleDateString()}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                {mine ? (
                                    <span style={{ fontSize: '0.85rem' }}>You: <strong>{pct(mine).toFixed(0)}%</strong></span>
                                ) : (
                                    <button onClick={() => onTake(c.id)} disabled={busy}
                                        className="orbit-btn orbit-btn--accent">
                                        {busy ? 'Opening…' : 'Take challenge'}
                                    </button>
                                )}
                                {c.mine && (
                                    <button onClick={() => { if (confirm(`Remove "${c.title}" and everyone's scores on it?`)) onDelete(c.id); }}
                                        aria-label="Remove challenge" style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4, color: 'inherit' }}>✕</button>
                                )}
                            </div>
                        </div>
                        {c.entries.length > 0 ? (
                            <ol style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.88rem' }}>
                                {c.entries.map((e, i) => (
                                    <li key={`${e.name}-${i}`} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto auto', gap: 10, alignItems: 'center', fontWeight: e.me ? 700 : 400 }}>
                                        <span aria-label={`Rank ${i + 1}`} style={{ fontVariantNumeric: 'tabular-nums', opacity: i === 0 ? 1 : 0.7, color: i === 0 ? 'var(--orbit-warn)' : undefined, fontWeight: 700 }}>{i + 1}.</span>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}{e.me ? ' (you)' : ''}</span>
                                        <span>{e.correct}/{e.total} ({pct(e).toFixed(0)}%)</span>
                                        <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{formatClock(e.elapsed_sec)}</span>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <p style={{ margin: '8px 0 0', fontSize: '0.85rem', opacity: 0.6 }}>Nobody has finished it yet.</p>
                        )}
                    </article>
                );
            })}
            {challenges.length > 3 && (
                <button onClick={() => setShowAll(s => !s)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--orbit-accent)', cursor: 'pointer', padding: 0 }}>
                    {showAll ? 'Show fewer' : `Show all ${challenges.length}`}
                </button>
            )}
        </section>
    );
}
