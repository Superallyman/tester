"use client"

// The signed-in user's finished practice exams, from the server: score trend, weakest areas across exams, and a list
// where each exam can be reopened in full or removed.

import React, { useMemo, useState } from 'react';
import { formatClock } from './examUtils';
import { FinishedExam } from './examSync';

const card: React.CSSProperties = {
    padding: '1.25rem',
    border: '1px solid rgba(128,128,128,0.2)',
    borderRadius: '12px',
    background: 'rgba(128,128,128,0.05)',
};

const scoreColor = (pct: number) => (pct >= 70 ? '#10b981' : pct >= 55 ? '#f59e0b' : '#ef4444');
const pctOf = (e: FinishedExam) => (e.total ? (e.correct / e.total) * 100 : 0);

// Score per exam, oldest to newest. The axis fits the scores (in 10% steps) so progress isn't flattened.
function Trend({ exams }: { exams: FinishedExam[] }) {
    const W = 600, H = 150, LEFT = 40, RIGHT = 12, TOP = 12, BOTTOM = 12;
    const pcts = exams.map(pctOf);
    const lo = Math.max(0, Math.floor((Math.min(...pcts) - 5) / 10) * 10);
    const hi = Math.min(100, Math.ceil((Math.max(...pcts) + 5) / 10) * 10);
    const y = (pct: number) => TOP + (1 - (pct - lo) / (hi - lo)) * (H - TOP - BOTTOM);
    const x = (i: number) => LEFT + (exams.length === 1 ? (W - LEFT - RIGHT) / 2 : (i / (exams.length - 1)) * (W - LEFT - RIGHT));
    const grid = Array.from({ length: (hi - lo) / 10 + 1 }, (_, i) => lo + i * 10);
    return (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Score per exam over time, from ${pcts[0].toFixed(0)}% to ${pcts[pcts.length - 1].toFixed(0)}%`}
            style={{ width: '100%', height: 'auto', display: 'block' }}>
            {grid.map(g => (
                <g key={g}>
                    <line x1={LEFT} x2={W - RIGHT} y1={y(g)} y2={y(g)} stroke="currentColor"
                        strokeOpacity={g === 70 ? 0.45 : 0.12} strokeDasharray={g === 70 ? '4 4' : undefined} />
                    <text x={LEFT - 6} y={y(g) + 3} textAnchor="end" fontSize="10" fill="currentColor" opacity={g === 70 ? 0.8 : 0.5}>{g}%</text>
                </g>
            ))}
            <polyline points={exams.map((e, i) => `${x(i)},${y(pctOf(e))}`).join(' ')} fill="none" stroke="#3b82f6" strokeWidth={2} />
            {exams.map((e, i) => (
                <circle key={e.id} cx={x(i)} cy={y(pctOf(e))} r={4} fill={scoreColor(pctOf(e))}>
                    <title>{`${new Date(e.finished_at).toLocaleDateString()} · ${e.label} · ${pctOf(e).toFixed(0)}%`}</title>
                </circle>
            ))}
        </svg>
    );
}

export default function PastExams({ history, onReview, onDelete }: {
    history: FinishedExam[] | null;
    onReview: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const [opening, setOpening] = useState<string | null>(null);

    const stats = useMemo(() => {
        if (!history?.length) return null;
        const scored = history.filter(e => e.total > 0);
        const avg = scored.reduce((sum, e) => sum + pctOf(e), 0) / Math.max(1, scored.length);
        const best = Math.max(...scored.map(pctOf));
        // Accuracy per area, pooled across every exam that recorded a breakdown
        const areas: Record<string, { correct: number; total: number }> = {};
        history.forEach(e => Object.entries(e.by_category || {}).forEach(([name, r]) => {
            const a = (areas[name] ||= { correct: 0, total: 0 });
            a.correct += r.correct;
            a.total += r.total;
        }));
        const weakest = Object.entries(areas)
            .filter(([, a]) => a.total >= 5)
            .map(([name, a]) => ({ name, pct: (a.correct / a.total) * 100, total: a.total }))
            .sort((a, b) => a.pct - b.pct)
            .slice(0, 5);
        return { avg, best, weakest };
    }, [history]);

    if (history === null) return <p style={{ marginTop: '1.75rem', opacity: 0.6 }}>Loading your past exams…</p>;
    if (!history.length) return null;

    const chronological = [...history].reverse();

    return (
        <section style={{ marginTop: '1.75rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Your past exams</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                {[
                    ['EXAMS', String(history.length)],
                    ['AVERAGE', `${stats!.avg.toFixed(0)}%`],
                    ['BEST', `${stats!.best.toFixed(0)}%`],
                    ['LATEST', `${pctOf(history[0]).toFixed(0)}%`],
                ].map(([k, v]) => (
                    <div key={k} style={{ ...card, padding: '0.8rem 1rem' }}>
                        <div style={{ fontSize: '0.65rem', opacity: 0.6, letterSpacing: '0.05em' }}>{k}</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{v}</div>
                    </div>
                ))}
            </div>

            {history.length > 1 && <div style={card}><Trend exams={chronological} /></div>}

            {stats!.weakest.length > 0 && (
                <div style={card}>
                    <div style={{ fontSize: '0.65rem', opacity: 0.6, letterSpacing: '0.05em', marginBottom: 8 }}>WEAKEST AREAS ACROSS YOUR EXAMS</div>
                    {stats!.weakest.map(w => (
                        <div key={w.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem', marginBottom: 6 }}>
                            <span style={{ flex: '0 0 45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={w.name}>{w.name}</span>
                            <span style={{ flex: 1, height: 8, background: 'rgba(128,128,128,0.2)', borderRadius: 4, overflow: 'hidden' }}>
                                <span style={{ display: 'block', height: '100%', width: `${w.pct}%`, background: scoreColor(w.pct) }} />
                            </span>
                            <span style={{ width: 70, textAlign: 'right', opacity: 0.8 }}>{w.pct.toFixed(0)}% <span style={{ opacity: 0.6 }}>/{w.total}</span></span>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', opacity: 0.6, fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                            <th style={{ padding: 6 }}>DATE</th><th style={{ padding: 6 }}>SESSION</th><th style={{ padding: 6 }}>SCORE</th>
                            <th style={{ padding: 6 }}>TIME</th><th style={{ padding: 6 }} />
                        </tr>
                    </thead>
                    <tbody>
                        {history.map(h => {
                            const pct = pctOf(h);
                            return (
                                <tr key={h.id} style={{ borderTop: '1px solid rgba(128,128,128,0.2)' }}>
                                    <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{new Date(h.finished_at).toLocaleDateString()}</td>
                                    <td style={{ padding: 6 }}>{h.label}</td>
                                    <td style={{ padding: 6, fontWeight: 600, color: scoreColor(pct), whiteSpace: 'nowrap' }}>
                                        {h.correct}/{h.total} ({pct.toFixed(0)}%)
                                    </td>
                                    <td style={{ padding: 6 }}>{formatClock(h.elapsed_sec)}</td>
                                    <td style={{ padding: 6, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {h.has_detail ? (
                                            <button
                                                onClick={async () => { setOpening(h.id); await onReview(h.id); setOpening(null); }}
                                                style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.85rem' }}
                                            >
                                                {opening === h.id ? 'Opening…' : 'Review'}
                                            </button>
                                        ) : (
                                            <span style={{ opacity: 0.5, fontSize: '0.75rem' }} title="Saved before exams were kept on the server, so only the score was kept">score only</span>
                                        )}
                                        <button
                                            onClick={() => { if (confirm(`Remove the ${h.label} exam from ${new Date(h.finished_at).toLocaleDateString()} from your exam history? Answers saved to your History stay.`)) onDelete(h.id); }}
                                            aria-label="Remove from exam history"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4, marginLeft: 8 }}
                                        >
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
