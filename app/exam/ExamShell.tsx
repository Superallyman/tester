"use client"

// ExamShell.tsx — full-screen simulation of the Pearson VUE driver used for NBEO Part I ABS

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft, ArrowRight, Calculator as CalcIcon, Clock, Flag, Highlighter, ListOrdered,
    LogIn, MessageSquareText, NotebookPen, Pause, Pill, Strikethrough, Compass, FileText,
} from 'lucide-react';

import styles from './exam.module.css';
import {
    COLOR_SCHEMES, ExamQuestion, ExamState, HIGHLIGHT_COLORS, ItemStatus, LETTERS, ReviewFilter,
    formatClock, itemStatus, requiredCount, saveExamState,
} from './examUtils';
import { evaluate, formatResult } from './calculatorMath';
import { DRUG_LIST } from './drugList';

interface ExamShellProps {
    questions: ExamQuestion[];
    initialState: ExamState;
    candidateName: string;
    onFinish: (state: ExamState) => void;
    onExit: (state: ExamState) => void;
    onAbandon: () => void;
    onSave?: (state: ExamState) => void; // after each local save, e.g. to mirror it to the server
}

type WindowKey = 'navigator' | 'calculator' | 'notes' | 'drugs' | 'critique';
type DialogKey = 'endReview' | 'timeUp' | null;

// ---------------------------------------------------------------------------
// Floating, draggable window (Navigator, Calculator, My Notes, ...)
// ---------------------------------------------------------------------------

function FloatingWindow({ title, subtitle, initial, width, onClose, children, footer }: {
    title: React.ReactNode;
    subtitle?: string;
    initial: { x: number; y: number };
    width: number;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
}) {
    const [pos, setPos] = useState(() => {
        if (typeof window === 'undefined') return initial;
        const w = Math.min(width, window.innerWidth - 16);
        return { x: Math.max(8, Math.min(initial.x, window.innerWidth - w - 8)), y: Math.max(8, initial.y) };
    });
    const drag = useRef<{ dx: number; dy: number } | null>(null);

    const onPointerDown = (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('button')) return;
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!drag.current) return;
        setPos({
            x: Math.max(0, Math.min(e.clientX - drag.current.dx, window.innerWidth - 80)),
            y: Math.max(0, Math.min(e.clientY - drag.current.dy, window.innerHeight - 40)),
        });
    };

    return (
        <div className={styles.window} style={{ left: pos.x, top: pos.y, width }} role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
            <div className={styles.windowTitle} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => (drag.current = null)}>
                <span>{title}{subtitle && <small> - {subtitle}</small>}</span>
                <button className={styles.windowClose} onClick={onClose} aria-label="Close">✕</button>
            </div>
            <div className={styles.windowBody}>{children}</div>
            {footer && <div className={styles.windowFooter}>{footer}</div>}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Scientific calculator
// ---------------------------------------------------------------------------

function CalculatorPanel() {
    const [expr, setExpr] = useState('');
    const [result, setResult] = useState('');
    const [unit, setUnit] = useState<'deg' | 'rad'>('deg');
    const inputRef = useRef<HTMLInputElement>(null);

    const run = () => {
        if (!expr.trim()) return;
        try {
            const value = formatResult(evaluate(expr, unit));
            setResult(`${expr} =`);
            setExpr(value === 'Error' ? '' : value);
            if (value === 'Error') setResult('Error');
        } catch {
            setResult('Error');
        }
    };

    const press = (token: string) => {
        if (token === 'C') { setExpr(''); setResult(''); }
        else if (token === '⌫') setExpr(e => e.slice(0, -1));
        else if (token === '=') run();
        else if (token === '±') setExpr(e => (e.startsWith('-(') && e.endsWith(')') ? e.slice(2, -1) : e ? `-(${e})` : '-'));
        else if (token === 'x²') setExpr(e => `(${e})^2`);
        else if (token === '1/x') setExpr(e => `1/(${e})`);
        else if (['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', '√'].includes(token)) setExpr(e => `${e}${token}(`);
        else setExpr(e => e + token);
        inputRef.current?.focus();
    };

    const keys = [
        'sin', 'cos', 'tan', '(', ')',
        'asin', 'acos', 'atan', '^', 'x²',
        'log', 'ln', '√', '1/x', 'π',
        '7', '8', '9', '÷', 'C',
        '4', '5', '6', '×', '⌫',
        '1', '2', '3', '−', '±',
        '0', '.', 'e', '+', '=',
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginBottom: 4 }}>
                <span>{unit === 'deg' ? 'Degrees' : 'Radians'}</span>
                <button className={`${styles.plainButton} ${styles.secondary}`} style={{ padding: '2px 8px' }} onClick={() => setUnit(u => (u === 'deg' ? 'rad' : 'deg'))}>
                    {unit === 'deg' ? 'DEG → RAD' : 'RAD → DEG'}
                </button>
            </div>
            <div className={styles.calcResult}>{result}</div>
            <input
                ref={inputRef}
                autoFocus
                className={styles.calcDisplay}
                value={expr}
                onChange={e => setExpr(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); run(); } if (!e.altKey) e.stopPropagation(); }}
                aria-label="Calculator input"
            />
            <div className={styles.calcGrid}>
                {keys.map(k => (
                    <button key={k} onClick={() => press(k === '−' ? '-' : k)} className={k === '=' ? styles.calcEq : undefined}>{k}</button>
                ))}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Text with word-level highlight / strikethrough marks
// ---------------------------------------------------------------------------

function MarkedText({ text, prefix, hl, st }: { text: string; prefix: string; hl: Record<string, string>; st: Set<string> }) {
    const parts = text.split(/(\s+)/).filter(Boolean);
    // Assign word keys first so whitespace can look at both neighbours
    let w = 0;
    const keys = parts.map(part => (/^\s+$/.test(part) ? null : `${prefix}:${w++}`));
    const neighbour = (i: number, dir: 1 | -1) => {
        for (let j = i + dir; j >= 0 && j < keys.length; j += dir) if (keys[j]) return keys[j];
        return null;
    };

    return (
        <>
            {parts.map((part, i) => {
                const key = keys[i];
                if (!key) {
                    // Fill the gap between two marked words so a highlighted phrase reads as one block
                    const before = neighbour(i, -1);
                    const after = neighbour(i, 1);
                    const color = before && after && hl[before] && hl[before] === hl[after] ? hl[before] : undefined;
                    const struckGap = !!(before && after && st.has(before) && st.has(after));
                    if (!color && !struckGap) return <React.Fragment key={i}>{part}</React.Fragment>;
                    return <span key={i} className={struckGap ? styles.struck : undefined} style={color ? { background: color } : undefined}>{part}</span>;
                }
                const color = hl[key];
                return (
                    <span
                        key={i}
                        data-mk={key}
                        className={`${styles.word} ${st.has(key) ? styles.struck : ''}`}
                        style={color ? { background: color, color: '#000' } : undefined}
                    >
                        {part}
                    </span>
                );
            })}
        </>
    );
}

// ---------------------------------------------------------------------------
// Main shell
// ---------------------------------------------------------------------------

export default function ExamShell({ questions, initialState, candidateName, onFinish, onExit, onAbandon, onSave }: ExamShellProps) {
    const [state, setState] = useState<ExamState>(initialState);
    const [windows, setWindows] = useState<Partial<Record<WindowKey, boolean>>>({});
    const [dialog, setDialog] = useState<DialogKey>(null);
    const [paused, setPaused] = useState(false);
    const [showClock, setShowClock] = useState(true);
    const [showProgress, setShowProgress] = useState(true);
    const [hlColor, setHlColor] = useState(HIGHLIGHT_COLORS[0]);
    const [hlMenu, setHlMenu] = useState(false);
    const [reviewTab, setReviewTab] = useState<ReviewFilter>('all');
    const [drugQuery, setDrugQuery] = useState('');
    const [critiqueDraft, setCritiqueDraft] = useState('');
    const contentRef = useRef<HTMLDivElement>(null);
    const lastSelection = useRef<string[]>([]);

    const q = questions[state.current];
    const total = questions.length;
    const scheme = COLOR_SCHEMES[state.colorScheme] || COLOR_SCHEMES.default;
    const isTimed = state.remainingSec !== null;
    const modalOpen = dialog !== null || paused;

    // Persist every change so a refresh or accidental close never loses the exam
    useEffect(() => {
        const stamped = { ...state, savedAt: new Date().toISOString() };
        saveExamState(stamped);
        onSave?.(stamped);
    }, [state, onSave]);

    // Clock: counts down for timed exams, always tracks elapsed time
    useEffect(() => {
        if (paused || dialog === 'timeUp') return;
        const t = setInterval(() => {
            setState(s => {
                const onItem = s.phase === 'exam' ? s.questionIds[s.current] : null;
                const timeSpent = onItem ? { ...s.timeSpent, [onItem]: (s.timeSpent?.[onItem] || 0) + 1 } : s.timeSpent;
                return {
                    ...s,
                    elapsedSec: s.elapsedSec + 1,
                    remainingSec: s.remainingSec === null ? null : Math.max(0, s.remainingSec - 1),
                    timeSpent,
                };
            });
        }, 1000);
        return () => clearInterval(t);
    }, [paused, dialog]);

    useEffect(() => {
        if (state.remainingSec === null) return;
        if (state.remainingSec <= 0 && dialog !== 'timeUp') setDialog('timeUp');
    }, [state.remainingSec, dialog]);

    // ---------- navigation ----------

    const goTo = useCallback((index: number, queue: string[] | null = null) => {
        setState(s => {
            const target = questions[index];
            return {
                ...s,
                phase: 'exam',
                current: index,
                reviewQueue: queue,
                seen: s.seen.includes(target.id) ? s.seen : [...s.seen, target.id],
            };
        });
        contentRef.current?.scrollTo(0, 0);
    }, [questions]);

    const openReview = useCallback(() => setState(s => ({ ...s, phase: 'review', reviewQueue: null })), []);

    const { phase, reviewQueue, current: currentIndex } = state;

    const next = useCallback(() => {
        if (phase !== 'exam') return;
        if (reviewQueue) {
            const pos = reviewQueue.indexOf(q.id);
            const nextId = reviewQueue[pos + 1];
            if (nextId) goTo(questions.findIndex(x => x.id === nextId), reviewQueue);
            else openReview();
            return;
        }
        if (currentIndex < total - 1) goTo(currentIndex + 1);
        else openReview();
    }, [phase, reviewQueue, currentIndex, q, questions, total, goTo, openReview]);

    const prev = useCallback(() => {
        if (phase !== 'exam') return;
        if (reviewQueue) {
            const pos = reviewQueue.indexOf(q.id);
            if (pos > 0) goTo(questions.findIndex(x => x.id === reviewQueue[pos - 1]), reviewQueue);
            return;
        }
        if (currentIndex > 0) goTo(currentIndex - 1);
    }, [phase, reviewQueue, currentIndex, q, questions, goTo]);

    // ---------- answering ----------

    const toggleOption = useCallback((opt: string) => {
        setState(s => {
            const current = s.answers[q.id] || [];
            const multi = requiredCount(q) > 1;
            let nextSel: string[];
            if (current.includes(opt)) nextSel = current.filter(o => o !== opt);
            else nextSel = multi ? [...current, opt] : [opt];
            return { ...s, answers: { ...s.answers, [q.id]: nextSel } };
        });
    }, [q]);

    const toggleFlag = useCallback(() => {
        setState(s => ({ ...s, flags: s.flags.includes(q.id) ? s.flags.filter(f => f !== q.id) : [...s.flags, q.id] }));
    }, [q]);

    // ---------- highlight / strikethrough ----------

    const captureSelection = useCallback(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !contentRef.current) return;
        const range = sel.getRangeAt(0);
        const keys: string[] = [];
        contentRef.current.querySelectorAll<HTMLElement>('[data-mk]').forEach(el => {
            if (range.intersectsNode(el)) keys.push(el.dataset.mk!);
        });
        if (keys.length) lastSelection.current = keys;
    }, []);

    useEffect(() => {
        document.addEventListener('selectionchange', captureSelection);
        return () => document.removeEventListener('selectionchange', captureSelection);
    }, [captureSelection]);

    // Selection is only meaningful for the item it was made on
    useEffect(() => { lastSelection.current = []; }, [currentIndex, phase]);

    const consumeSelection = () => {
        const keys = lastSelection.current;
        lastSelection.current = [];
        window.getSelection()?.removeAllRanges();
        return keys;
    };

    const applyHighlight = useCallback((color: string | null) => {
        const keys = consumeSelection();
        setHlMenu(false);
        if (!keys.length) return;
        setState(s => {
            const marks = s.marks[q.id] || { hl: {}, st: [] };
            const hl = { ...marks.hl };
            keys.forEach(k => { if (color) hl[k] = color; else delete hl[k]; });
            return { ...s, marks: { ...s.marks, [q.id]: { ...marks, hl } } };
        });
    }, [q]);

    const applyStrike = useCallback(() => {
        const keys = consumeSelection();
        if (!keys.length) return;
        setState(s => {
            const marks = s.marks[q.id] || { hl: {}, st: [] };
            const allStruck = keys.every(k => marks.st.includes(k));
            const st = allStruck ? marks.st.filter(k => !keys.includes(k)) : Array.from(new Set([...marks.st, ...keys]));
            return { ...s, marks: { ...s.marks, [q.id]: { ...marks, st } } };
        });
    }, [q]);

    // ---------- windows ----------

    const toggleWindow = useCallback((key: WindowKey) => {
        if (key === 'critique') setCritiqueDraft(state.critiques[q.id] || '');
        setWindows(w => ({ ...w, [key]: !w[key] }));
    }, [state.critiques, q]);

    const closeWindow = (key: WindowKey) => setWindows(w => ({ ...w, [key]: false }));

    // ---------- keyboard ----------

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const typing = target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text') || target.tagName === 'SELECT';

            if (e.key === 'Escape') {
                if (hlMenu) setHlMenu(false);
                return;
            }
            if (modalOpen) return;

            if (e.altKey && !e.ctrlKey && !e.metaKey) {
                const k = e.key.toLowerCase();
                const inExam = state.phase === 'exam';
                const actions: Record<string, () => void> = inExam ? {
                    n: next, p: prev, v: () => toggleWindow('navigator'), f: toggleFlag,
                    j: () => applyHighlight(hlColor), w: applyStrike, l: () => toggleWindow('calculator'),
                    y: () => toggleWindow('notes'), q: () => toggleWindow('critique'), d: () => toggleWindow('drugs'),
                } : {
                    e: () => setDialog('endReview'), a: () => startReview(reviewTab),
                };
                // e.code keeps Alt shortcuts working on macOS, where Option changes e.key
                const code = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : k;
                const action = actions[code];
                if (action) { e.preventDefault(); action(); }
                return;
            }

            if (typing || e.ctrlKey || e.metaKey || state.phase !== 'exam') return;

            const idx = LETTERS.indexOf(e.key.toUpperCase());
            if (e.key.length === 1 && idx >= 0 && idx < q.options.length) {
                e.preventDefault();
                toggleOption(q.options[idx]);
            } else if (e.key === 'ArrowRight') {
                next();
            } else if (e.key === 'ArrowLeft') {
                prev();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    // ---------- review screen ----------

    const statuses = useMemo(() => {
        const map: Record<string, ItemStatus> = {};
        questions.forEach(item => { map[item.id] = itemStatus(item, state); });
        return map;
    }, [questions, state]);

    const filtered = useCallback((f: ReviewFilter) => questions.filter(item => {
        if (f === 'all') return true;
        if (f === 'flagged') return state.flags.includes(item.id);
        if (f === 'incomplete') return statuses[item.id] === 'Incomplete';
        return statuses[item.id] === 'Unseen';
    }), [questions, state.flags, statuses]);

    const counts = {
        all: total,
        incomplete: filtered('incomplete').length,
        unseen: filtered('unseen').length,
        flagged: filtered('flagged').length,
    };

    function startReview(f: ReviewFilter, startId?: string) {
        const list = filtered(f).map(item => item.id);
        if (!list.length) return;
        const first = startId || list[0];
        goTo(questions.findIndex(item => item.id === first), list);
    }

    // ---------- rendering helpers ----------

    const header = (
        <div className={styles.titleBar}>
            <div className={styles.title}>NBEO Part I ABS<span className={styles.titleExtra}> Practice Exam - {candidateName}</span></div>
            <div className={styles.meta}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <button className={styles.metaButton} onClick={() => setPaused(true)} title="Pause exam">
                        <Pause size={14} /> <span className={styles.toolLabel}>Pause</span>
                    </button>
                    <button
                        className={`${styles.metaButton} ${isTimed && state.remainingSec! <= 300 ? styles.timeWarning : ''}`}
                        onClick={() => setShowClock(v => !v)}
                        title="Show/hide time"
                    >
                        <Clock size={14} />
                        {showClock && (isTimed ? `Time Remaining ${formatClock(state.remainingSec!)}` : `Time Elapsed ${formatClock(state.elapsedSec)}`)}
                    </button>
                </div>
                {state.phase === 'exam' && (
                    <button className={styles.metaButton} onClick={() => setShowProgress(v => !v)} title="Show/hide progress">
                        <ListOrdered size={14} />
                        {showProgress && (state.reviewQueue
                            ? `${state.reviewQueue.indexOf(q.id) + 1} of ${state.reviewQueue.length} (Item ${state.current + 1})`
                            : `${state.current + 1} of ${total}`)}
                    </button>
                )}
            </div>
        </div>
    );

    const multi = q && requiredCount(q) > 1;
    const marks = (q && state.marks[q.id]) || { hl: {}, st: [] };
    const struck = new Set(marks.st);
    const selected = (q && state.answers[q.id]) || [];
    const isFlagged = q && state.flags.includes(q.id);

    return (
        <div className={styles.shell} style={{ '--content-bg': scheme.bg, '--content-fg': scheme.fg } as React.CSSProperties}>
            {header}

            {state.phase === 'exam' ? (
                <>
                    <div className={styles.toolBar}>
                        <div className={styles.tools}>
                            <button className={styles.tool} onMouseDown={e => e.preventDefault()} onClick={() => toggleWindow('critique')} title="Critiques (Alt+Q)">
                                <MessageSquareText size={16} /> <span className={styles.toolLabel}>Critiques (<span className={styles.u}>Q</span>)</span>
                            </button>
                            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <button
                                    className={styles.swatch}
                                    style={{ background: hlColor }}
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => setHlMenu(m => !m)}
                                    aria-label="Choose highlight color"
                                />
                                <button className={styles.tool} onMouseDown={e => e.preventDefault()} onClick={() => setHlMenu(m => !m)} aria-label="Highlight options">▾</button>
                                <button className={styles.tool} onMouseDown={e => e.preventDefault()} onClick={() => applyHighlight(hlColor)} title="Highlight (Alt+J)">
                                    <Highlighter size={16} /> <span className={styles.toolLabel}>Highlight (<span className={styles.u}>J</span>)</span>
                                </button>
                                {hlMenu && (
                                    <div className={styles.hlMenu} onMouseDown={e => e.preventDefault()}>
                                        {HIGHLIGHT_COLORS.map(c => (
                                            <button key={c} onClick={() => { setHlColor(c); applyHighlight(c); }}>
                                                <span style={{ width: 22, height: 14, background: c, border: '1px solid #555' }} /> Highlight
                                            </button>
                                        ))}
                                        <button onClick={() => applyHighlight(null)}>✕ Remove Highlight</button>
                                    </div>
                                )}
                            </span>
                            <button className={styles.tool} onMouseDown={e => e.preventDefault()} onClick={applyStrike} title="Strikethrough (Alt+W)">
                                <Strikethrough size={16} /> <span className={styles.toolLabel}>Strikethrough (<span className={styles.u}>W</span>)</span>
                            </button>
                            <button className={`${styles.tool} ${windows.calculator ? styles.toolActive : ''}`} onClick={() => toggleWindow('calculator')} title="Calculator (Alt+L)">
                                <CalcIcon size={16} /> <span className={styles.toolLabel}>Calculator (<span className={styles.u}>L</span>)</span>
                            </button>
                            <button className={`${styles.tool} ${windows.notes ? styles.toolActive : ''}`} onClick={() => toggleWindow('notes')} title="My Notes (Alt+Y)">
                                <NotebookPen size={16} /> <span className={styles.toolLabel}>My Notes (<span className={styles.u}>Y</span>)</span>
                            </button>
                        </div>
                        <button className={`${styles.flagButton} ${isFlagged ? styles.flagged : ''}`} onClick={toggleFlag} aria-pressed={isFlagged} title="Flag for Review (Alt+F)">
                            <Flag size={16} fill={isFlagged ? '#ffff00' : 'none'} /> <span className={styles.toolLabel}><span className={styles.u}>F</span>lag for Review</span>
                        </button>
                        <select
                            className={styles.schemeSelect}
                            value={state.colorScheme}
                            onChange={e => setState(s => ({ ...s, colorScheme: e.target.value }))}
                            aria-label="Color Scheme"
                        >
                            {Object.entries(COLOR_SCHEMES).map(([key, cs]) => (
                                <option key={key} value={key}>{key === 'default' ? 'Color Scheme' : cs.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.content} ref={contentRef}>
                        <p className={styles.stem}>
                            <MarkedText text={q.question_text} prefix="s" hl={marks.hl} st={struck} />
                            {multi && <> <span className={styles.selectN}>(SELECT {requiredCount(q)})</span></>}
                        </p>
                        <ul className={styles.options} role={multi ? 'group' : 'radiogroup'}>
                            {q.options.map((opt, i) => {
                                const checked = selected.includes(opt);
                                return (
                                    <li
                                        key={i}
                                        className={styles.option}
                                        onClick={e => {
                                            if ((e.target as HTMLElement).tagName === 'INPUT') return;
                                            if (window.getSelection()?.toString()) return; // user is selecting text to mark
                                            toggleOption(opt);
                                        }}
                                    >
                                        <input
                                            type={multi ? 'checkbox' : 'radio'}
                                            name={`q-${q.id}`}
                                            checked={checked}
                                            onChange={() => toggleOption(opt)}
                                            onClick={e => { if (!multi && checked) { e.preventDefault(); toggleOption(opt); } }}
                                            aria-label={`Option ${LETTERS[i]}`}
                                        />
                                        <span>{LETTERS[i]}.</span>
                                        <span className={styles.optionText}>
                                            <MarkedText text={opt} prefix={`o${i}`} hl={marks.hl} st={struck} />
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    <div className={styles.utilityBar}>
                        <button className={styles.drugButton} onClick={() => toggleWindow('drugs')}>
                            <Pill size={16} /> <span><span className={styles.u}>D</span>rug List</span>
                        </button>
                    </div>

                    <div className={`${styles.navBar} ${state.reviewQueue ? styles.spread : ''}`}>
                        {state.reviewQueue && (
                            <button className={`${styles.navButton} ${styles.leftEdge}`} onClick={openReview}>
                                <FileText size={16} /> Review Screen
                            </button>
                        )}
                        <div style={{ display: 'flex' }}>
                            <button className={styles.navButton} onClick={prev} disabled={state.reviewQueue ? state.reviewQueue.indexOf(q.id) <= 0 : state.current === 0}>
                                <ArrowLeft size={18} /> <span><span className={styles.u}>P</span>revious</span>
                            </button>
                            <button className={styles.navButton} onClick={() => toggleWindow('navigator')}>
                                <Compass size={18} /> <span>Na<span className={styles.u}>v</span>igator</span>
                            </button>
                            <button className={`${styles.navButton} ${styles.navNext}`} onClick={next}>
                                <span><span className={styles.u}>N</span>ext</span> <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div className={styles.toolBar}>
                        <div className={styles.tools}>
                            <span className={styles.tool} style={{ cursor: 'default' }}><FileText size={16} /> Review Screen</span>
                        </div>
                    </div>
                    <div className={styles.reviewScreen}>
                        <div className={styles.reviewHeader}>
                            <h1>Review</h1>
                            <button className={styles.reviewAction} onClick={() => startReview(reviewTab)} disabled={counts[reviewTab] === 0}>
                                {reviewTab === 'all' ? <>Review <span className={styles.u}>A</span>ll</> : `Review ${reviewTab[0].toUpperCase()}${reviewTab.slice(1)}`}
                            </button>
                        </div>
                        <div className={styles.tabs} role="tablist">
                            {(['all', 'incomplete', 'unseen', 'flagged'] as ReviewFilter[])
                                .filter(t => t === 'all' || counts[t] > 0)
                                .map(t => (
                                    <button
                                        key={t}
                                        role="tab"
                                        aria-selected={reviewTab === t}
                                        className={`${styles.tab} ${reviewTab === t ? styles.tabActive : ''}`}
                                        onClick={() => setReviewTab(t)}
                                    >
                                        {t[0].toUpperCase() + t.slice(1)} ({counts[t]})
                                    </button>
                                ))}
                        </div>
                        <table className={styles.reviewTable}>
                            <thead>
                                <tr><th>QUESTION</th><th>TITLE</th><th>STATUS</th><th>FLAGGED</th><th /></tr>
                            </thead>
                            <tbody>
                                {filtered(reviewTab).map(item => {
                                    const st = statuses[item.id];
                                    const pill = st === 'Complete' ? styles.pillComplete : st === 'Unseen' ? styles.pillUnseen : styles.pillIncomplete;
                                    return (
                                        <tr key={item.id}>
                                            <td>{questions.indexOf(item) + 1}</td>
                                            <td>Question</td>
                                            <td><span className={`${styles.pill} ${pill}`}>{st}</span></td>
                                            <td>{state.flags.includes(item.id) ? <Flag size={16} fill="#f5c400" color="#8a6d00" aria-label="Yes" /> : 'No'}</td>
                                            <td><button className={styles.reviewLink} onClick={() => startReview(reviewTab, item.id)}>Review</button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className={`${styles.navBar} ${styles.spread}`}>
                        <button className={`${styles.navButton} ${styles.leftEdge}`} onClick={() => setDialog('endReview')}>
                            <LogIn size={18} /> <span><span className={styles.u}>E</span>nd Review</span>
                        </button>
                    </div>
                </>
            )}

            {/* ---------- floating windows ---------- */}

            {windows.navigator && state.phase === 'exam' && (
                <FloatingWindow title="Navigator" subtitle="select a question to go to it" initial={{ x: 9999, y: 90 }} width={620} onClose={() => closeWindow('navigator')}>
                    <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
                        <table className={styles.navTable}>
                            <thead><tr><th>Question #</th><th>Status</th><th>Flagged for Review</th><th>Critiques</th></tr></thead>
                            <tbody>
                                {questions.map((item, i) => {
                                    const st = statuses[item.id];
                                    return (
                                        <tr key={item.id} className={i === state.current ? styles.navCurrent : undefined} onClick={() => { goTo(i); closeWindow('navigator'); }}>
                                            <td>Question {i + 1}</td>
                                            <td className={st === 'Complete' ? undefined : styles.statusBad}>{st}</td>
                                            <td style={{ textAlign: 'center' }}>{state.flags.includes(item.id) && <Flag size={15} fill="#4a90c2" color="#2b5d82" aria-label="Flagged" />}</td>
                                            <td style={{ textAlign: 'center' }}>{state.critiques[item.id] && <MessageSquareText size={15} color="#2b7bb9" aria-label="Has critique" />}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </FloatingWindow>
            )}

            {windows.calculator && (
                <FloatingWindow title="Calculator" initial={{ x: 9999, y: 120 }} width={330} onClose={() => closeWindow('calculator')}>
                    <CalculatorPanel />
                </FloatingWindow>
            )}

            {windows.notes && (
                <FloatingWindow title="My Notes" subtitle="cleared when the exam ends" initial={{ x: 40, y: 110 }} width={440} onClose={() => closeWindow('notes')}>
                    <textarea
                        autoFocus
                        className={styles.textArea}
                        value={state.notes}
                        onChange={e => setState(s => ({ ...s, notes: e.target.value }))}
                        placeholder="Notes are cumulative, not item-specific — include the item number if it matters."
                    />
                </FloatingWindow>
            )}

            {windows.critique && state.phase === 'exam' && (
                <FloatingWindow
                    title={`Critique - Question ${state.current + 1}`}
                    initial={{ x: 60, y: 110 }}
                    width={460}
                    onClose={() => closeWindow('critique')}
                    footer={<>
                        <button className={`${styles.plainButton} ${styles.secondary}`} onClick={() => closeWindow('critique')}>Cancel</button>
                        <button className={styles.plainButton} onClick={() => {
                            setState(s => {
                                const critiques = { ...s.critiques };
                                if (critiqueDraft.trim()) critiques[q.id] = critiqueDraft.trim(); else delete critiques[q.id];
                                return { ...s, critiques };
                            });
                            closeWindow('critique');
                        }}>Save</button>
                    </>}
                >
                    <p style={{ margin: '0 0 6px', fontSize: '0.85rem' }}>Note a problem with this item (wrong key, typo, ambiguous wording). Critiques appear on your results page so you can fix the question bank later.</p>
                    <textarea autoFocus className={styles.textArea} style={{ minHeight: 140 }} value={critiqueDraft} onChange={e => setCritiqueDraft(e.target.value)} />
                </FloatingWindow>
            )}

            {windows.drugs && (
                <FloatingWindow title="Drug List" subtitle="brand → generic" initial={{ x: 9999, y: 100 }} width={420} onClose={() => closeWindow('drugs')}>
                    <input autoFocus className={styles.drugSearch} placeholder="Search brand or generic name" value={drugQuery} onChange={e => setDrugQuery(e.target.value)} />
                    <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
                        <table className={styles.navTable}>
                            <thead><tr><th>Brand</th><th>Generic</th></tr></thead>
                            <tbody>
                                {DRUG_LIST.filter(([b, g]) => `${b} ${g}`.toLowerCase().includes(drugQuery.toLowerCase())).map(([b, g]) => (
                                    <tr key={b}><td style={{ cursor: 'default' }}>{b}</td><td style={{ cursor: 'default' }}>{g}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </FloatingWindow>
            )}

            {/* ---------- modal dialogs ---------- */}

            {paused && (
                <div className={styles.backdrop}>
                    <div className={styles.dialog} role="alertdialog">
                        <div className={styles.dialogTitle}>Exam Paused</div>
                        <div className={styles.dialogBody}>
                            <p style={{ marginTop: 0 }}>The clock is stopped. Your answers, flags and notes are saved on this device — you can leave and resume this exam later from the Practice Exam page.</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                                <button className={`${styles.plainButton} ${styles.secondary}`} onClick={() => { if (confirm('Discard this exam? Your answers will not be scored or saved.')) onAbandon(); }}>Discard Exam</button>
                                <button className={`${styles.plainButton} ${styles.secondary}`} onClick={() => onExit(state)}>Save &amp; Exit</button>
                                <button className={styles.plainButton} autoFocus onClick={() => setPaused(false)}>Resume</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {dialog === 'timeUp' && (
                <div className={styles.backdrop}>
                    <div className={styles.dialog} role="alertdialog">
                        <div className={styles.dialogTitle}>Time Expired</div>
                        <div className={styles.dialogBody}>
                            <p style={{ marginTop: 0 }}>The time allotted for this session has expired. Click OK to end the session and see your score.</p>
                            <div style={{ textAlign: 'right' }}><button className={styles.plainButton} autoFocus onClick={() => onFinish(state)}>OK</button></div>
                        </div>
                    </div>
                </div>
            )}

            {dialog === 'endReview' && (
                <div className={styles.backdrop}>
                    <div className={styles.dialog} role="alertdialog">
                        <div className={styles.dialogTitle}>End Review</div>
                        <div className={styles.dialogBody}>
                            <p style={{ marginTop: 0 }}>You have chosen to end the current review. If you click Yes, you will NOT be able to return to this section.</p>
                            {(counts.incomplete > 0 || counts.unseen > 0) && (
                                <p style={{ color: '#c5221f', fontWeight: 'bold' }}>
                                    You have {counts.incomplete + counts.unseen} incomplete or unseen item{counts.incomplete + counts.unseen === 1 ? '' : 's'}.
                                </p>
                            )}
                            <p>Are you sure you want to end this review?</p>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button className={`${styles.plainButton} ${styles.secondary}`} autoFocus onClick={() => setDialog(null)}>No</button>
                                <button className={styles.plainButton} onClick={() => onFinish(state)}>Yes</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
