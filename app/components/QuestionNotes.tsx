"use client"

// Bookmark toggle and a private note for one question. The note saves itself shortly after you stop typing.

import React, { useEffect, useRef, useState } from 'react';
import { Bookmark, BookmarkCheck, NotebookPen } from 'lucide-react';
import { QuestionNote } from './useNotes';

const SAVE_DELAY_MS = 800;

export default function QuestionNotes({ value, onSave, showNote = true }: {
    value: QuestionNote | undefined;
    onSave: (patch: Partial<QuestionNote>) => Promise<void>;
    showNote?: boolean; // false hides the note (e.g. before a quiz is submitted, so it can't give the answer away)
}) {
    const bookmarked = !!value?.bookmarked;
    const saved = value?.note ?? '';
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(saved);
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pending = useRef<string | null>(null);
    const saveRef = useRef(onSave);
    saveRef.current = onSave;

    // Pick up the note when it arrives from the server, unless the person is mid-edit
    useEffect(() => { if (!open) setDraft(saved); }, [saved, open]);

    // Sends a note that is still waiting for the typing pause, e.g. when the box loses focus or the page goes away
    const flush = () => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        if (pending.current === null) return;
        const text = pending.current;
        pending.current = null;
        saveRef.current({ note: text }).then(() => setStatus('saved'), () => setStatus('error'));
    };
    useEffect(() => {
        window.addEventListener('pagehide', flush);
        return () => { window.removeEventListener('pagehide', flush); flush(); };
    }, []);

    const write = (text: string) => {
        setDraft(text);
        setStatus('saving');
        pending.current = text;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, SAVE_DELAY_MS);
    };

    const link: React.CSSProperties = {
        background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'inherit',
    };

    return (
        // Typing in the note must not trigger the quiz's keyboard shortcuts
        <div onKeyDown={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <button type="button" aria-pressed={bookmarked} onClick={() => onSave({ bookmarked: !bookmarked }).catch(console.error)}
                    style={{ ...link, opacity: bookmarked ? 1 : 0.6, color: bookmarked ? 'var(--orbit-warn)' : 'inherit' }}>
                    {bookmarked ? <BookmarkCheck size={14} aria-hidden="true" /> : <Bookmark size={14} aria-hidden="true" />}
                    {bookmarked ? 'Bookmarked' : 'Bookmark'}
                </button>
                {showNote && (
                    <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} style={{ ...link, opacity: saved || open ? 0.9 : 0.6 }}>
                        <NotebookPen size={14} aria-hidden="true" />
                        {saved ? (open ? 'Hide note' : 'Your note') : open ? 'Hide note' : 'Add a note'}
                    </button>
                )}
            </div>
            {showNote && saved && !open && (
                <button type="button" onClick={() => setOpen(true)}
                    className="orbit-glass"
                    style={{ textAlign: 'left', whiteSpace: 'pre-wrap', fontSize: '0.88rem', lineHeight: 1.55, padding: '9px 12px', borderRadius: 'var(--orbit-radius)', cursor: 'text', boxShadow: 'inset 3px 0 0 var(--orbit-warn), var(--orbit-glass-shadow)' }}>
                    {saved}
                </button>
            )}
            {showNote && open && (
                <div>
                    <textarea value={draft} onChange={e => write(e.target.value)} onBlur={flush} rows={3} maxLength={5000} autoFocus aria-label="Your note on this question"
                        placeholder="Only you can see this. A mnemonic, why the answer is right, where you read about it…"
                        className="orbit-input" style={{ fontSize: '0.88rem' }} />
                    <div className="orbit-muted" style={{ minHeight: '1em', marginTop: 4 }} aria-live="polite">
                        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? "Couldn't save. Check your connection." : ''}
                    </div>
                </div>
            )}
        </div>
    );
}
