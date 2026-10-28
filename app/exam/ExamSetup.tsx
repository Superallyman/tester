"use client"

import React, { useEffect, useState } from 'react';
import { api } from '@/utils/api';

import { EXAM_PRESETS, ExamConfig, ExamState, SECONDS_PER_ITEM, formatClock } from './examUtils';
import { FinishedExam } from './examSync';
import PastExams from './PastExams';
import Challenges, { Challenge } from './Challenges';
import { BLUEPRINT, BLUEPRINT_SOURCE, SCORED_ITEMS, blueprintKey, blueprintQuotas } from './blueprint';
import { edge, glass, glassCard } from '@/utils/orbitStyles';

export type PoolFilter = 'all' | 'unseen' | 'notMastered' | 'missed';

interface ExamSetupProps {
    signedIn: boolean;
    resumable: { state: ExamState; total: number } | null;
    history: FinishedExam[] | null; // null while loading
    challenges: Challenge[] | null;  // null when challenges are off for this account (or still loading)
    onTakeChallenge: (id: string) => void;
    onDeleteChallenge: (id: string) => void;
    busy: boolean;
    error: string | null;
    onStart: (config: ExamConfig, filter: PoolFilter, categories: string[], challengeTitle?: string) => void;
    onResume: () => void;
    onDiscardResume: () => void;
    onReview: (id: string) => void;
    onDelete: (id: string) => void;
}

// Orbit glass surface
const card: React.CSSProperties = glassCard;

const label: React.CSSProperties = { fontSize: '0.65rem', opacity: 0.6, letterSpacing: '0.05em', display: 'block', marginBottom: 6 };

export default function ExamSetup({
    signedIn, resumable, history, challenges, busy, error, onStart, onResume, onDiscardResume, onReview, onDelete, onTakeChallenge, onDeleteChallenge,
}: ExamSetupProps) {
    const [preset, setPreset] = useState<string>('block');
    const [customCount, setCustomCount] = useState(25);
    // What's typed, so the box can be emptied while typing a new number; the count only changes to a valid one
    const [customInput, setCustomInput] = useState('25');
    const [timed, setTimed] = useState(true);
    const [filter, setFilter] = useState<PoolFilter>('all');
    const [saveToHistory, setSaveToHistory] = useState(true);
    const [asChallenge, setAsChallenge] = useState(false);
    const [challengeTitle, setChallengeTitle] = useState('');
    const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
    const [selectedCats, setSelectedCats] = useState<string[]>([]);
    const [showCats, setShowCats] = useState(false);
    const [showBlueprint, setShowBlueprint] = useState(false);

    useEffect(() => {
        api<{ cat_name: string; q_count: number }[]>('/api/categories').then(data => {
            const merged: Record<string, number> = {};
            data.forEach(c => {
                const name = c.cat_name?.trim().replace(/\s+/g, ' ') || 'General';
                merged[name] = (merged[name] || 0) + c.q_count;
            });
            setCategories(Object.entries(merged).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)));
        }).catch(console.error);
    }, []);

    const chosen = EXAM_PRESETS.find(p => p.key === preset);
    const count = chosen ? chosen.count : Math.max(1, Math.min(370, customCount));
    const timeLimitSec = !timed ? null : chosen ? chosen.timeLimitSec : Math.round((count * SECONDS_PER_ITEM) / 60) * 60;
    const label_ = chosen ? chosen.label : `Custom ${count}`;

    // Preview of the exam's composition: supply comes from the bank (before the pool filter is applied)
    const supply: Record<string, number> = {};
    const bankByRow: Record<string, string[]> = {};
    categories
        .filter(c => !selectedCats.length || selectedCats.includes(c.name))
        .forEach(c => {
            const key = blueprintKey(c.name) ?? `other:${c.name}`;
            supply[key] = (supply[key] || 0) + c.count;
            (bankByRow[key] ||= []).push(c.name);
        });
    const quotas = categories.length ? blueprintQuotas(supply, count) : {};
    const unmapped = Object.keys(supply).filter(k => k.startsWith('other:'));
    const shortRows = BLUEPRINT.filter(r => supply[r.key] !== undefined && supply[r.key] < Math.round((r.weight / SCORED_ITEMS) * count));

    const toggleCat = (name: string) =>
        setSelectedCats(prev => (prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]));

    const start = () => onStart(
        { label: label_, count, timeLimitSec, saveToHistory: signedIn && saveToHistory }, filter, selectedCats,
        challenges && asChallenge ? (challengeTitle.trim() || `${label_} challenge`) : undefined,
    );

    // A choice tile in Orbit's selectable-row style; the chosen one glows in the accent
    const optionButton = (active: boolean): React.CSSProperties => ({
        ...glass, padding: 12, textAlign: 'left', color: 'inherit', cursor: 'pointer', display: 'block', width: '100%',
        ...(active ? { borderColor: 'color-mix(in srgb, var(--orbit-accent) 80%, transparent)', boxShadow: 'inset 3px 0 0 var(--orbit-accent), 0 0 18px color-mix(in srgb, var(--orbit-accent) 28%, transparent)' } : {}),
    });

    return (
        <main style={{ maxWidth: '860px', margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
            <p className="orbit-label">Practice exam</p>
            <h1 className="orbit-title" style={{ margin: '6px 0 8px' }}>NBEO Part I ABS Practice Exam</h1>
            <p style={{ opacity: 0.7, margin: '0 0 1.25rem', fontSize: '0.95rem' }}>
                Simulates the Pearson VUE testing interface used on exam day: timed session, Flag for Review, Navigator,
                Highlight / Strikethrough, scientific calculator, My Notes, Drug List and the end-of-session Review screen.
            </p>

            {resumable && (
                <div style={{ ...card, marginBottom: '1.25rem', ...edge('var(--orbit-warn)') }}>
                    <strong>Exam in progress</strong>
                    <p style={{ margin: '6px 0 12px', fontSize: '0.9rem', opacity: 0.85 }}>
                        {resumable.state.config.label} · {Object.values(resumable.state.answers).filter(a => a.length).length}/{resumable.total} answered ·{' '}
                        {resumable.state.remainingSec !== null ? `${formatClock(resumable.state.remainingSec)} remaining` : `${formatClock(resumable.state.elapsedSec)} elapsed`}
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={onResume} className="orbit-btn orbit-btn--primary">Resume Exam</button>
                        <button onClick={() => { if (confirm('Discard the exam in progress?')) onDiscardResume(); }} style={{ padding: '10px 18px', background: 'transparent', color: 'inherit', border: '1px solid rgba(128,128,128,0.4)', borderRadius: 8, cursor: 'pointer' }}>Discard</button>
                    </div>
                </div>
            )}

            <section style={{ ...card, marginBottom: '1.25rem' }}>
                <span style={label}>SESSION LENGTH</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    {EXAM_PRESETS.map(p => (
                        <button key={p.key} onClick={() => setPreset(p.key)} style={optionButton(preset === p.key)}>
                            <strong>{p.label}</strong>
                            <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: 4 }}>{p.blurb}</div>
                        </button>
                    ))}
                    <button onClick={() => setPreset('custom')} style={optionButton(preset === 'custom')}>
                        <strong>Custom</strong>
                        <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: 4 }}>
                            <input
                                type="number"
                                min={1}
                                max={370}
                                value={customInput}
                                onClick={e => { e.stopPropagation(); setPreset('custom'); }}
                                onChange={e => { setCustomInput(e.target.value); const n = parseInt(e.target.value, 10); if (n >= 1) setCustomCount(n); }}
                                onBlur={() => setCustomInput(String(customCount))}
                                className="orbit-input" style={{ width: 70, padding: '4px 8px' }}
                            /> items · ~{Math.round((Math.max(1, customCount) * SECONDS_PER_ITEM) / 60)} min
                        </div>
                    </button>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: '0.9rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={timed} onChange={e => setTimed(e.target.checked)} />
                    Timed (exam pace ≈ 78 seconds per item){!timed && <span style={{ opacity: 0.6 }}> — clock will count up instead</span>}
                </label>
            </section>

            <section style={{ ...card, marginBottom: '1.25rem' }}>
                <span style={label}>QUESTION POOL</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    {([
                        ['all', 'All questions', 'Every question in the bank'],
                        ['unseen', 'Unseen only', 'Questions you have never answered'],
                        ['notMastered', 'Not yet mastered', 'Never answered correctly (includes unseen)'],
                        ['missed', 'Previously missed', 'Answered before, never correctly'],
                    ] as [PoolFilter, string, string][]).map(([key, title, blurb]) => (
                        <button key={key} onClick={() => setFilter(key)} disabled={!signedIn && key !== 'all'} style={{ ...optionButton(filter === key), opacity: !signedIn && key !== 'all' ? 0.4 : 1 }}>
                            <strong>{title}</strong>
                            <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: 4 }}>{blurb}</div>
                        </button>
                    ))}
                </div>

                <button
                    onClick={() => setShowCats(v => !v)}
                    aria-expanded={showCats} className="orbit-option" style={{ marginTop: 12, justifyContent: 'space-between' }}
                >
                    <span>Limit to categories</span>
                    <span className="orbit-muted">{selectedCats.length ? `${selectedCats.length} selected` : 'All categories'}</span>
                </button>
                {showCats && (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 220, overflowY: 'auto', padding: 4 }}>
                        {categories.map(c => {
                            const on = selectedCats.includes(c.name);
                            return (
                                <button key={c.name} onClick={() => toggleCat(c.name)} style={{ padding: '4px 10px', borderRadius: 12, border: 'none', fontSize: '0.75rem', cursor: 'pointer', background: on ? 'var(--orbit-good)' : 'rgba(128,128,128,0.2)', color: on ? 'white' : 'inherit' }}>
                                    {on ? '✓ ' : ''}{c.name} <span style={{ opacity: 0.6 }}>({c.count})</span>
                                </button>
                            );
                        })}
                        {selectedCats.length > 0 && (
                            <button onClick={() => setSelectedCats([])} style={{ padding: '4px 10px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.5)', fontSize: '0.75rem', cursor: 'pointer', background: 'transparent', color: 'var(--orbit-bad)' }}>Clear</button>
                        )}
                    </div>
                )}
            </section>

            <section style={{ ...card, marginBottom: '1.25rem', ...edge('var(--orbit-good)') }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '1.2rem', lineHeight: 1, color: 'var(--orbit-good)' }}>✓</span>
                    <div style={{ flex: 1 }}>
                        <strong>Weighted to the official NBEO blueprint, not the question bank</strong>
                        <p style={{ margin: '6px 0 0', fontSize: '0.88rem', opacity: 0.85, lineHeight: 1.5 }}>
                            Each content area gets the share of items NBEO publishes for the real Part I ABS (the midpoint of its official range),
                            so heavily stocked bank categories don&apos;t crowd out the rest. Source:{' '}
                            <a href={BLUEPRINT_SOURCE.url} target="_blank" rel="noreferrer" style={{ color: 'var(--orbit-accent)' }}>{BLUEPRINT_SOURCE.label}</a>.
                            {selectedCats.length > 0 && ' With categories limited, the selected areas keep their relative NBEO weights.'}
                        </p>
                        <button
                            onClick={() => setShowBlueprint(v => !v)}
                            style={{ marginTop: 10, padding: 0, background: 'none', border: 'none', color: 'var(--orbit-accent)', cursor: 'pointer', fontSize: '0.88rem' }}
                        >
                            {showBlueprint ? '▼ Hide' : '▶ Show'} how {count} items are split
                        </button>
                    </div>
                </div>

                {showBlueprint && (
                    <div style={{ overflowX: 'auto', marginTop: 10 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', opacity: 0.6, fontSize: '0.68rem', letterSpacing: '0.04em' }}>
                                    <th style={{ padding: '6px 4px' }}>NBEO CONTENT AREA</th>
                                    <th style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>OFFICIAL / {SCORED_ITEMS}</th>
                                    <th style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>THIS EXAM</th>
                                </tr>
                            </thead>
                            <tbody>
                                {BLUEPRINT.map((r, i) => {
                                    const groupStart = i === 0 || BLUEPRINT[i - 1].group !== r.group;
                                    const n = quotas[r.key] || 0;
                                    return (
                                        <React.Fragment key={r.key}>
                                            {groupStart && (
                                                <tr><td colSpan={3} style={{ padding: '10px 4px 4px', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.04em', opacity: 0.7 }}>{r.group.toUpperCase()}</td></tr>
                                            )}
                                            <tr style={{ borderTop: '1px solid rgba(128,128,128,0.15)', opacity: supply[r.key] ? 1 : 0.4 }}>
                                                <td style={{ padding: '5px 4px' }}>
                                                    {r.label}
                                                    <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>Bank: {(bankByRow[r.key] || []).join(', ') || 'none'}</div>
                                                </td>
                                                <td style={{ padding: '5px 4px', whiteSpace: 'nowrap' }}>{r.min}–{r.max}</td>
                                                <td style={{ padding: '5px 4px', fontWeight: 700 }}>{n}</td>
                                            </tr>
                                        </React.Fragment>
                                    );
                                })}
                                {unmapped.map(k => (
                                    <tr key={k} style={{ borderTop: '1px solid rgba(128,128,128,0.15)' }}>
                                        <td style={{ padding: '5px 4px' }}>
                                            Not in the NBEO matrix
                                            <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>Bank: {k.slice(6)}</div>
                                        </td>
                                        <td style={{ padding: '5px 4px' }}>—</td>
                                        <td style={{ padding: '5px 4px', fontWeight: 700 }}>{quotas[k] || 0}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <ul style={{ fontSize: '0.75rem', opacity: 0.7, margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
                            <li>NBEO tests pharmacology inside each condition; the bank files it separately, so &quot;Pharmacology&quot; gets the official Pharmacology column (11–17%, ~49 of 350) and the health rows shrink proportionally.</li>
                            <li>Biochem and Microbiology questions are basic science on systemic conditions, so they share the Systemic Health slot.</li>
                            {shortRows.length > 0 && <li>The bank is short on {shortRows.map(r => r.label).join(', ')}; the missing items are redistributed by NBEO weight.</li>}
                            {filter !== 'all' && <li>Your pool filter is applied when the exam is built, so final counts can shift where few questions remain.</li>}
                        </ul>
                    </div>
                )}
            </section>

            <section style={{ ...card, marginBottom: '1.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: signedIn ? 'pointer' : 'default', opacity: signedIn ? 1 : 0.6 }}>
                    <input type="checkbox" checked={signedIn && saveToHistory} disabled={!signedIn} onChange={e => setSaveToHistory(e.target.checked)} />
                    Save answered items to my History &amp; Performance Analytics
                </label>
                {!signedIn && <p style={{ fontSize: '0.8rem', margin: '6px 0 0', opacity: 0.7 }}>Sign in to save results and use the pool filters.</p>}
                {challenges && (
                    <div style={{ marginTop: 10 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={asChallenge} onChange={e => setAsChallenge(e.target.checked)} />
                            Also make it a challenge: others take exactly these questions and you compare scores
                        </label>
                        {asChallenge && (
                            <input value={challengeTitle} onChange={e => setChallengeTitle(e.target.value)} maxLength={120} aria-label="Challenge name"
                                placeholder={`${label_} challenge`}
                                style={{ marginTop: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(128,128,128,0.35)', background: 'transparent', color: 'inherit' }} />
                        )}
                    </div>
                )}
            </section>

            {error && <p style={{ color: 'var(--orbit-bad)', textAlign: 'center', fontWeight: 500 }}>{error}</p>}

            <button
                onClick={start}
                disabled={busy}
                className="orbit-btn orbit-btn--primary" style={{ width: '100%', padding: 16, cursor: busy ? 'wait' : 'pointer' }}
            >
                {busy ? 'Building exam…' : `Begin ${label_} — ${count} items${timeLimitSec ? ` · ${formatClock(timeLimitSec)}` : ' · untimed'}`}
            </button>

            <details style={{ ...card, marginTop: '1.25rem', fontSize: '0.88rem' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Exam-day format &amp; keyboard shortcuts</summary>
                <ul style={{ lineHeight: 1.7, paddingLeft: 18 }}>
                    <li>Real Part I ABS: 370 items (350 scored + 20 unscored pretest) in two 185-item sessions of 4 hours each, with an optional 45-minute break.</li>
                    <li>About 10–15% are multiple-response items: the stem says (SELECT 2/3/4), answers use squares instead of circles, and there is no partial credit.</li>
                    <li>Navigation: <kbd>Alt+N</kbd> Next · <kbd>Alt+P</kbd> Previous · <kbd>Alt+V</kbd> Navigator · <kbd>Alt+F</kbd> Flag for Review</li>
                    <li>Tools: <kbd>Alt+J</kbd> Highlight · <kbd>Alt+W</kbd> Strikethrough · <kbd>Alt+L</kbd> Calculator · <kbd>Alt+Y</kbd> My Notes · <kbd>Alt+Q</kbd> Critique · <kbd>Alt+D</kbd> Drug List</li>
                    <li>Answer with the letter keys <kbd>A</kbd>–<kbd>G</kbd>; pressing a selected letter again clears it. Arrow keys also move between items.</li>
                    <li>Select text with the mouse first, then press Highlight or Strikethrough to mark it.</li>
                    <li>After the last item you land on the Review screen (All / Incomplete / Unseen / Flagged). <strong>End Review</strong> submits the session.</li>
                </ul>
            </details>

            {challenges && <Challenges challenges={challenges} busy={busy} onTake={onTakeChallenge} onDelete={onDeleteChallenge} />}
            <PastExams history={history} onReview={onReview} onDelete={onDelete} />
        </main>
    );
}
