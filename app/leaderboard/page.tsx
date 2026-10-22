"use client"

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/utils/api';
import { BLUEPRINT } from '@/app/exam/blueprint';
import {
    ActivityRow, MIN_ATTEMPTS_PER_CELL, MIN_ATTEMPTS_TO_RANK, ROW_LABELS, UserStats, Window, buildStats, pct,
} from './stats';

type SortKey = 'accuracy' | 'firstTry' | 'attempts' | 'mastered' | 'streak';

const SORTS: { key: SortKey; label: string; value: (u: UserStats) => number; needsSample: boolean }[] = [
    { key: 'accuracy', label: 'Accuracy', value: u => u.accuracy, needsSample: true },
    { key: 'firstTry', label: 'First-try accuracy', value: u => pct(u.firstTry) ?? 0, needsSample: true },
    { key: 'attempts', label: 'Questions answered', value: u => u.attempts, needsSample: false },
    { key: 'mastered', label: 'Mastered', value: u => u.mastered, needsSample: false },
    { key: 'streak', label: 'Streak', value: u => u.streak * 1000 + u.bestStreak, needsSample: false },
];

const WINDOWS: { key: Window; label: string }[] = [
    { key: 'all', label: 'All time' },
    { key: '30', label: '30 days' },
    { key: '7', label: '7 days' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

// Diverging heatmap: blue above the midpoint, red below, neutral at it. Text stays in ink colours.
const MIDPOINT = 65;
const cellBackground = (acc: number) => {
    const strength = Math.min(1, Math.abs(acc - MIDPOINT) / 35) * 0.55;
    return acc >= MIDPOINT ? `rgba(42,120,214,${strength})` : `rgba(227,73,72,${strength})`;
};

const card: React.CSSProperties = {
    padding: '1rem 1.25rem',
    border: '1px solid rgba(128,128,128,0.2)',
    borderRadius: '12px',
    background: 'rgba(128,128,128,0.05)',
};

const sectionTitle: React.CSSProperties = { fontSize: '0.75rem', letterSpacing: '0.06em', opacity: 0.6, margin: '0 0 8px', fontWeight: 600 };

const chip = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    borderRadius: 16,
    border: `1px solid ${active ? '#0070f3' : 'rgba(128,128,128,0.3)'}`,
    background: active ? 'rgba(0,112,243,0.15)' : 'transparent',
    color: 'inherit',
    fontSize: '0.82rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
});

const fmtPct = (n: number | null) => (n === null ? '—' : `${n.toFixed(0)}%`);

const relativeDay = (iso: string | null) => {
    if (!iso) return '—';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    return `${days}d ago`;
};

export default function LeaderboardPage() {
    const [me, setMe] = useState<string | null>(null);

    const [rows, setRows] = useState<ActivityRow[] | null>(null);
    const [bankSize, setBankSize] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [timeWindow, setTimeWindow] = useState<Window>('all');
    const [sort, setSort] = useState<SortKey>('accuracy');

    useEffect(() => {
        let cancelled = false;
        api<{ me: string; bankSize: number; rows: ActivityRow[] }>('/api/leaderboard')
            .then(data => {
                if (cancelled) return;
                setRows(data.rows);
                setBankSize(data.bankSize);
                setMe(data.me);
            })
            .catch(err => {
                console.error(err);
                if (!cancelled) setError('Could not load the leaderboard.');
            });
        return () => { cancelled = true; };
    }, []);

    const users = useMemo(() => (rows ? buildStats(rows, timeWindow, bankSize).filter(u => u.attempts > 0) : []), [rows, timeWindow, bankSize]);
    const sortDef = SORTS.find(s => s.key === sort)!;

    const { ranked, unranked } = useMemo(() => {
        const qualifies = (u: UserStats) => !sortDef.needsSample || u.attempts >= MIN_ATTEMPTS_TO_RANK;
        return {
            ranked: users.filter(qualifies).sort((a, b) => sortDef.value(b) - sortDef.value(a)),
            unranked: users.filter(u => !qualifies(u)).sort((a, b) => b.attempts - a.attempts),
        };
    }, [users, sortDef]);

    const columns = [...ranked, ...unranked];

    const rowKeys = useMemo(() => {
        const present = new Set(users.flatMap(u => Object.keys(u.byRow)));
        return [...BLUEPRINT.map(r => r.key), 'other'].filter(k => present.has(k));
    }, [users]);

    // Biggest skill gaps between people who have both put real work into a category
    const gaps = useMemo(() => rowKeys.flatMap(key => {
        const qualified = users
            .map(u => ({ u, acc: pct(u.byRow[key]), n: u.byRow[key]?.total || 0 }))
            .filter((x): x is { u: UserStats; acc: number; n: number } => x.acc !== null && x.n >= MIN_ATTEMPTS_PER_CELL)
            .sort((a, b) => b.acc - a.acc);
        if (qualified.length < 2) return [];
        const lead = qualified[0];
        const trail = qualified[qualified.length - 1];
        return [{ key, lead, trail, gap: lead.acc - trail.acc }];
    }).filter(g => g.gap >= 10).sort((a, b) => b.gap - a.gap).slice(0, 4), [rowKeys, users]);

    // A star means beating someone, so it needs at least two people with enough attempts
    const leaderOf = (key: string) => {
        const qualified = users
            .filter(u => (u.byRow[key]?.total || 0) >= MIN_ATTEMPTS_PER_CELL)
            .sort((a, b) => (pct(b.byRow[key]) ?? 0) - (pct(a.byRow[key]) ?? 0));
        return qualified.length >= 2 ? qualified[0].key : null;
    };

    const myRank = me ? ranked.findIndex(u => u.key === me) : -1;
    const rival = myRank > 0 ? ranked[myRank - 1] : null;
    const meStats = me ? users.find(u => u.key === me) : undefined;

    const nameCell = (u: UserStats) => (
        <span style={{ fontWeight: u.key === me ? 700 : 500 }}>
            {u.name}{u.key === me && <span style={{ opacity: 0.6, fontWeight: 400 }}> (you)</span>}
        </span>
    );

    const th: React.CSSProperties = { padding: '8px 8px', textAlign: 'left', fontSize: '0.68rem', letterSpacing: '0.05em', opacity: 0.6, fontWeight: 600, whiteSpace: 'nowrap' };
    const td: React.CSSProperties = { padding: '10px 8px', whiteSpace: 'nowrap' };
    const sortedCol = (key: SortKey): React.CSSProperties => (sort === key ? { fontWeight: 700, background: 'rgba(0,112,243,0.08)' } : {});

    return (
        <main style={{ maxWidth: '980px', margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
            <h1 style={{ margin: '0 0 6px', fontSize: '1.7rem', fontWeight: 700 }}>Leaderboard</h1>
            <p style={{ opacity: 0.7, margin: '0 0 1.25rem', fontSize: '0.95rem' }}>
                Everyone&apos;s numbers, side by side. Find who&apos;s strongest where, and pull each other up before boards.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: '1.25rem' }}>
                {WINDOWS.map(w => <button key={w.key} onClick={() => setTimeWindow(w.key)} style={chip(timeWindow === w.key)}>{w.label}</button>)}
                <span style={{ width: 1, height: 22, background: 'rgba(128,128,128,0.3)', margin: '0 6px' }} />
                {SORTS.map(s => <button key={s.key} onClick={() => setSort(s.key)} style={chip(sort === s.key)}>{s.label}</button>)}
            </div>

            {error && <p style={{ color: '#ef4444' }}>{error}</p>}
            {!rows && !error && <p style={{ opacity: 0.6 }}>Loading everyone&apos;s activity…</p>}
            {rows && users.length === 0 && <p style={{ opacity: 0.6 }}>No activity in this time window yet.</p>}

            {users.length > 0 && (
                <>
                    {meStats && (
                        <div style={{ ...card, marginBottom: '1.25rem', borderColor: 'rgba(0,112,243,0.4)', background: 'rgba(0,112,243,0.06)', fontSize: '0.92rem' }}>
                            {myRank === 0 && <>👑 You&apos;re <strong>#1 in {sortDef.label.toLowerCase()}</strong>. Defend the title.</>}
                            {rival && (
                                <>
                                    You&apos;re <strong>#{myRank + 1}</strong> in {sortDef.label.toLowerCase()}.{' '}
                                    <strong>{rival.name}</strong> is next up at{' '}
                                    <strong>{sort === 'accuracy' || sort === 'firstTry' ? fmtPct(sortDef.value(rival)) : sort === 'streak' ? `${rival.streak} days` : sortDef.value(rival)}</strong>.
                                    {sort === 'attempts' && <> That&apos;s {rival.attempts - meStats.attempts} questions away.</>}
                                    {sort === 'mastered' && <> That&apos;s {rival.mastered - meStats.mastered} more questions to master.</>}
                                </>
                            )}
                            {myRank === -1 && sortDef.needsSample && (
                                <>Answer {MIN_ATTEMPTS_TO_RANK - meStats.attempts} more questions in this window to be ranked on {sortDef.label.toLowerCase()}.</>
                            )}
                        </div>
                    )}

                    <section style={{ marginBottom: '1.75rem' }}>
                        <h2 style={sectionTitle}>STANDINGS · {sortDef.label.toUpperCase()}</h2>
                        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr>
                                        <th style={th}>#</th>
                                        <th style={th}>NAME</th>
                                        <th style={{ ...th, ...sortedCol('accuracy') }}>ACCURACY</th>
                                        <th style={{ ...th, ...sortedCol('firstTry') }} title="Accuracy on the first time each question was seen">FIRST TRY</th>
                                        <th style={{ ...th, ...sortedCol('attempts') }}>ANSWERED</th>
                                        <th style={{ ...th, ...sortedCol('mastered') }} title="Unique questions answered correctly">MASTERED</th>
                                        <th style={th} title="Share of the question bank seen">BANK SEEN</th>
                                        <th style={{ ...th, ...sortedCol('streak') }}>STREAK</th>
                                        <th style={th}>LAST ACTIVE</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {columns.map((u, i) => {
                                        const isRanked = i < ranked.length;
                                        return (
                                            <tr key={u.key} style={{ borderTop: '1px solid rgba(128,128,128,0.15)', background: u.key === me ? 'rgba(0,112,243,0.06)' : undefined, opacity: isRanked ? 1 : 0.55 }}>
                                                <td style={{ ...td, fontSize: '1.05rem' }}>{isRanked ? (MEDALS[i] || i + 1) : '–'}</td>
                                                <td style={td}>
                                                    {nameCell(u)}
                                                    {!isRanked && <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>needs {MIN_ATTEMPTS_TO_RANK - u.attempts} more to rank</div>}
                                                </td>
                                                <td style={{ ...td, ...sortedCol('accuracy') }}>{fmtPct(u.accuracy)}</td>
                                                <td style={{ ...td, ...sortedCol('firstTry') }}>{fmtPct(pct(u.firstTry))} <span style={{ opacity: 0.5, fontSize: '0.75rem' }}>({u.firstTry.total})</span></td>
                                                <td style={{ ...td, ...sortedCol('attempts') }}>{u.attempts.toLocaleString()}</td>
                                                <td style={{ ...td, ...sortedCol('mastered') }}>{u.mastered.toLocaleString()}</td>
                                                <td style={td}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <div style={{ width: 48, height: 6, borderRadius: 3, background: 'rgba(128,128,128,0.2)', overflow: 'hidden' }}>
                                                            <div style={{ width: `${Math.min(100, u.coverage)}%`, height: '100%', background: '#2a78d6', borderRadius: 3 }} />
                                                        </div>
                                                        <span style={{ fontSize: '0.8rem' }}>{u.coverage.toFixed(0)}%</span>
                                                    </div>
                                                </td>
                                                <td style={{ ...td, ...sortedCol('streak') }} title={`Best: ${u.bestStreak} days`}>
                                                    {u.streak > 0 ? `🔥 ${u.streak}d` : '—'} <span style={{ opacity: 0.5, fontSize: '0.75rem' }}>best {u.bestStreak}</span>
                                                </td>
                                                <td style={{ ...td, opacity: 0.75 }}>{relativeDay(u.lastActive)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p style={{ fontSize: '0.72rem', opacity: 0.55, margin: '6px 0 0' }}>
                            Accuracy rankings need {MIN_ATTEMPTS_TO_RANK}+ answers in the window. First try counts only the first time each question was seen, so re-drilling can&apos;t pad it. Streak and last active are all-time. Blank submissions (skips) don&apos;t count anywhere.
                        </p>
                    </section>

                    {gaps.length > 0 && (
                        <section style={{ marginBottom: '1.75rem' }}>
                            <h2 style={sectionTitle}>PULL EACH OTHER UP</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
                                {gaps.map(g => (
                                    <div key={g.key} style={{ ...card, borderLeft: '4px solid #2a78d6' }}>
                                        <div style={{ fontSize: '0.78rem', opacity: 0.65, marginBottom: 4 }}>{ROW_LABELS[g.key]}</div>
                                        <div style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
                                            <strong>{g.lead.u.name}</strong> leads at <strong>{fmtPct(g.lead.acc)}</strong>;{' '}
                                            <strong>{g.trail.u.name}</strong> is at <strong>{fmtPct(g.trail.acc)}</strong>.
                                        </div>
                                        <div style={{ fontSize: '0.78rem', opacity: 0.7, marginTop: 6 }}>
                                            {g.gap.toFixed(0)}-point gap. {g.trail.u.key === me ? `Ask ${g.lead.u.name} how they study this.` : g.lead.u.key === me ? `Share your notes with ${g.trail.u.name}.` : 'Time to swap notes.'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <section>
                        <h2 style={sectionTitle}>ACCURACY BY NBEO CONTENT AREA</h2>
                        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 2, fontSize: '0.85rem' }}>
                                <thead>
                                    <tr>
                                        <th style={th}>CONTENT AREA</th>
                                        {columns.map(u => <th key={u.key} style={{ ...th, textAlign: 'center' }}>{nameCell(u)}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rowKeys.map(key => {
                                        const leader = leaderOf(key);
                                        return (
                                            <tr key={key}>
                                                <td style={{ padding: '6px 8px', fontSize: '0.8rem', minWidth: 150, maxWidth: 240, whiteSpace: 'normal' }}>{ROW_LABELS[key]}</td>
                                                {columns.map(u => {
                                                    const t = u.byRow[key];
                                                    const acc = pct(t);
                                                    const thin = !t || t.total < MIN_ATTEMPTS_PER_CELL;
                                                    return (
                                                        <td
                                                            key={u.key}
                                                            title={t ? `${u.name} · ${ROW_LABELS[key]}: ${t.correct}/${t.total} correct${thin ? ' (small sample)' : ''}` : `${u.name} hasn't tried ${ROW_LABELS[key]} yet`}
                                                            style={{
                                                                textAlign: 'center',
                                                                padding: '6px 4px',
                                                                minWidth: 70,
                                                                borderRadius: 4,
                                                                background: acc !== null && !thin ? cellBackground(acc) : 'transparent',
                                                                border: thin ? '1px dashed rgba(128,128,128,0.35)' : '1px solid transparent',
                                                                opacity: thin ? 0.55 : 1,
                                                            }}
                                                        >
                                                            {acc === null ? '—' : (
                                                                <>
                                                                    <strong>{leader === u.key && '★ '}{fmtPct(acc)}</strong>
                                                                    <div style={{ fontSize: '0.68rem', opacity: 0.65 }}>{t.total}</div>
                                                                </>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', fontSize: '0.72rem', opacity: 0.7, marginTop: 8 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                ≤30%
                                <span style={{ width: 120, height: 8, borderRadius: 4, background: `linear-gradient(to right, ${cellBackground(30)}, ${cellBackground(MIDPOINT)}, ${cellBackground(100)})` }} />
                                100%
                            </span>
                            <span>Centered on {MIDPOINT}%</span>
                            <span>★ category leader (2+ people qualified)</span>
                            <span>Small number = attempts</span>
                            <span>Dashed = fewer than {MIN_ATTEMPTS_PER_CELL} attempts</span>
                        </div>
                    </section>
                </>
            )}
        </main>
    );
}
