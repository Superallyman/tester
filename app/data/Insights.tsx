"use client"

// Exam-weighted readiness, accuracy per NBEO content area, and the 26-week trend (/api/analytics).
// One series colour (blue 450 light / 400 dark, both validated); the 70% target is a dashed reference line, not a colour.

import React, { useEffect, useMemo, useState } from 'react';
import { api, qs } from '@/utils/api';
import { glassCard } from '@/utils/orbitStyles';

interface Area {
    key: string; label: string; weight: number; answered: number; correct: number;
    recentAnswered: number; recentCorrect: number; seen: number; mastered: number; bank: number;
}
interface Week { week: string; answered: number; correct: number }
interface Analytics {
    weeks: Week[];
    areas: Area[];
    readiness: { pct: number | null; coveredWeight: number; scoredItems: number; minPerArea: number; recentDays: number };
}

const TARGET = 70;
// Orbit glass surface
const card: React.CSSProperties = { ...glassCard, marginBottom: '2rem' };
const muted: React.CSSProperties = { fontSize: '0.8rem', color: 'var(--orbit-ink-soft)' };
const pct = (c: number, n: number) => (n ? (c / n) * 100 : null);

export default function Insights() {
    const [data, setData] = useState<Analytics | null>(null);
    useEffect(() => {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        api<Analytics>(`/api/analytics${qs({ tz })}`).then(setData).catch(console.error);
    }, []);
    if (!data) return null;
    return (
        <>
            <Readiness data={data} />
            <AreaBars areas={data.areas} min={data.readiness.minPerArea} />
            <WeeklyTrend weeks={data.weeks} />
        </>
    );
}

function Readiness({ data }: { data: Analytics }) {
    const { pct: score, coveredWeight, scoredItems, minPerArea, recentDays } = data.readiness;
    const covered = Math.round((coveredWeight / scoredItems) * 100);
    const missing = data.areas.filter(a => a.weight > 0 && Math.max(a.answered, a.recentAnswered) < minPerArea)
        .sort((a, b) => b.weight - a.weight);
    return (
        <section style={card} aria-labelledby="readiness-title">
            <h3 id="readiness-title" className="orbit-h2" style={{ margin: '0 0 0.75rem' }}>Exam readiness</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem 2rem', alignItems: 'center' }}>
                <div>
                    <div className="orbit-stat" style={{ fontSize: '3rem' }}>{score === null ? '—' : `${score.toFixed(0)}%`}</div>
                    <div style={muted}>{score === null ? 'Not enough answers yet' : score >= TARGET ? `At or above the ${TARGET}% practice target` : `Practice target: ${TARGET}%`}</div>
                </div>
                <p style={{ ...muted, flex: '1 1 280px', margin: 0, lineHeight: 1.5 }}>
                    Your accuracy in each NBEO Part I content area, weighted by how many of the exam&apos;s {scoredItems} scored items
                    that area gets. Uses the last {recentDays} days where an area has {minPerArea}+ recent answers.
                    {' '}<strong>Based on {covered}% of the exam</strong>{covered < 100 ? `: areas need ${minPerArea} answers to count.` : '.'}
                    {' '}A practice gauge, not a predicted board score.
                </p>
            </div>
            {missing.length > 0 && (
                <p style={{ ...muted, margin: '0.75rem 0 0' }}>
                    Not counted yet: {missing.slice(0, 6).map(a => `${a.label} (${Math.round((a.weight / scoredItems) * 100)}% of exam)`).join(', ')}
                    {missing.length > 6 ? `, and ${missing.length - 6} more` : ''}.
                </p>
            )}
        </section>
    );
}

function AreaBars({ areas, min }: { areas: Area[]; min: number }) {
    const rows = [...areas].sort((a, b) => b.weight - a.weight || b.answered - a.answered);
    const total = rows.reduce((s, a) => s + a.weight, 0) || 1;
    return (
        <section style={card} aria-labelledby="areas-title">
            <h3 id="areas-title" className="orbit-h2" style={{ margin: '0 0 0.25rem' }}>Accuracy by NBEO content area</h3>
            <p style={{ ...muted, margin: '0 0 1rem' }}>Largest share of the exam first. The dashed line is the {TARGET}% target; paler bars have fewer than {min} answers.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rows.map(a => {
                    const acc = pct(a.correct, a.answered);
                    const thin = a.answered < min;
                    return (
                        // Label beside the bar when there's room, above it on a phone
                        <div key={a.key} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '4px 14px', alignItems: 'center' }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.label}>{a.label}</div>
                                <div style={{ fontSize: '0.72rem', opacity: 0.6 }}>
                                    {a.weight ? `${Math.round((a.weight / total) * 100)}% of exam · ` : 'not on the blueprint · '}
                                    seen {a.seen} of {a.bank} in the bank
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <svg viewBox="0 0 100 10" preserveAspectRatio="none" style={{ flex: 1, height: 10 }} role="img"
                                    aria-label={acc === null ? `${a.label}: no answers yet` : `${a.label}: ${acc.toFixed(0)}% of ${a.answered} answers`}>
                                    <rect x="0" y="0" width="100" height="10" rx="2" className="fill-black/[0.07] dark:fill-white/[0.08]" />
                                    {acc !== null && <rect x="0" y="0" width={Math.max(1.5, acc)} height="10" rx="2"
                                        className="fill-[#2a78d6] dark:fill-[#3987e5]" opacity={thin ? 0.4 : 1} />}
                                    <line x1={TARGET} x2={TARGET} y1="-1" y2="11" stroke="currentColor" strokeOpacity={0.55} strokeWidth="0.6" strokeDasharray="1.5 1" vectorEffect="non-scaling-stroke" />
                                </svg>
                                <span style={{ width: 92, textAlign: 'right', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
                                    {acc === null ? <span style={{ opacity: 0.5 }}>no answers</span> : <><strong>{acc.toFixed(0)}%</strong> <span style={{ opacity: 0.6 }}>of {a.answered}</span></>}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

const addDays = (key: string, n: number) => {
    const d = new Date(`${key}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const fmtWeek = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

function WeeklyTrend({ weeks }: { weeks: Week[] }) {
    const [focus, setFocus] = useState<number | null>(null);
    // All 26 weeks, oldest first, including empty ones, ending with this week
    const series = useMemo(() => {
        const byWeek = new Map(weeks.map(w => [w.week, w]));
        const now = new Date();
        const monday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)));
        const last = monday.toISOString().slice(0, 10);
        return Array.from({ length: 26 }, (_, i) => addDays(last, (i - 25) * 7)).map(k => byWeek.get(k) ?? { week: k, answered: 0, correct: 0 });
    }, [weeks]);
    if (!weeks.length) return null;

    const W = 600, H = 150, L = 34, R = 8, T = 10, B = 18, VH = 54;
    const x = (i: number) => L + (i / (series.length - 1)) * (W - L - R);
    const y = (p: number) => T + (1 - p / 100) * (H - T - B);
    const maxN = Math.max(...series.map(s => s.answered), 1);
    const points = series.map((s, i) => ({ i, s, p: pct(s.correct, s.answered) }));
    // Break the line across empty weeks instead of drawing through them
    const segments: string[] = [];
    let cur: string[] = [];
    points.forEach(({ i, p }) => {
        if (p === null) { if (cur.length) segments.push(cur.join(' ')); cur = []; return; }
        cur.push(`${x(i)},${y(p)}`);
    });
    if (cur.length) segments.push(cur.join(' '));
    const f = focus === null ? null : points[focus];
    const hit = (W - L - R) / (series.length - 1);

    const overlay = (height: number) => series.map((s, i) => (
        <rect key={s.week} x={x(i) - hit / 2} y={0} width={hit} height={height} fill="transparent"
            onMouseEnter={() => setFocus(i)} onMouseLeave={() => setFocus(c => (c === i ? null : c))} onClick={() => setFocus(i)} />
    ));

    return (
        <section style={card} aria-labelledby="trend-title">
            <h3 id="trend-title" className="orbit-h2" style={{ margin: '0 0 0.25rem' }}>Weekly accuracy</h3>
            <p style={{ ...muted, margin: '0 0 0.75rem' }}>Last 26 weeks. Hover or tap a week for its numbers.</p>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img"
                aria-label={`Weekly accuracy over 26 weeks; latest week with answers: ${(() => { const l = [...points].reverse().find(p => p.p !== null); return l ? `${l.p!.toFixed(0)}% of ${l.s.answered}` : 'none'; })()}`}>
                {[0, 50, 70, 100].map(g => (
                    <g key={g}>
                        <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={g === TARGET ? 0.5 : 0.1} strokeDasharray={g === TARGET ? '4 4' : undefined} />
                        <text x={L - 6} y={y(g) + 3} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.6}>{g}%</text>
                    </g>
                ))}
                {[0, 8, 17, 25].map(i => <text key={i} x={x(i)} y={H - 4} textAnchor={i === 0 ? 'start' : i === 25 ? 'end' : 'middle'} fontSize="10" fill="currentColor" opacity={0.6}>{fmtWeek(series[i].week)}</text>)}
                {f && <line x1={x(f.i)} x2={x(f.i)} y1={T} y2={H - B} stroke="currentColor" strokeOpacity={0.35} />}
                {segments.map((pts, k) => <polyline key={k} points={pts} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-[#2a78d6] dark:stroke-[#3987e5]" />)}
                {points.filter(p => p.p !== null).map(({ i, p }) => (
                    <circle key={i} cx={x(i)} cy={y(p!)} r={focus === i ? 5 : 3.5} strokeWidth={2}
                        className="fill-[#2a78d6] stroke-[#fcfcfb] dark:fill-[#3987e5] dark:stroke-[#1a1a19]" />
                ))}
                {overlay(H)}
            </svg>
            <svg viewBox={`0 0 ${W} ${VH}`} style={{ width: '100%', height: 'auto', display: 'block', marginTop: 4 }} role="img" aria-label="Answers per week">
                <text x={L - 6} y={12} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.6}>{maxN}</text>
                <text x={L - 6} y={VH - 2} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.6}>0</text>
                {series.map((s, i) => {
                    const h = (s.answered / maxN) * (VH - 6);
                    // Clamped so the first bar doesn't sit on the axis labels
                    const left = Math.max(L + 1, x(i) - hit * 0.35), right = Math.min(W - R, x(i) + hit * 0.35);
                    return <rect key={s.week} x={left} y={VH - h} width={right - left} height={h} rx={2}
                        className="fill-[#2a78d6] dark:fill-[#3987e5]" opacity={focus === i ? 1 : 0.55} />;
                })}
                {overlay(VH)}
            </svg>
            <div aria-live="polite" style={{ ...muted, marginTop: 6, minHeight: '1.2em' }}>
                {f ? `Week of ${fmtWeek(f.s.week)}: ${f.s.answered ? `${f.p!.toFixed(0)}% right of ${f.s.answered} answers` : 'no practice'}` : 'Bars: answers per week'}
            </div>
        </section>
    );
}
