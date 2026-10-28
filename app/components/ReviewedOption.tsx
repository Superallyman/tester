// One answer option after the question is marked, as shown in Quick Test results and History:
// your pick glows green or red, a correct answer you didn't pick is outlined, and each says so in words.
// "Simple" keeps the options plain and puts a mark beside each instead (✓ your right answer, ✕ your wrong
// answer, – a right answer you missed), so a screenshot can be studied with the marks covered.

import React from 'react';
import { Check, Minus, X } from 'lucide-react';

export default function ReviewedOption({ text, letter, picked, correct, simple }: { text: string; letter?: string; picked: boolean; correct: boolean; simple?: boolean }) {
    const state = picked ? (correct ? 'is-right' : 'is-wrong') : correct ? 'is-missed' : '';
    const note = picked ? (correct ? 'Your answer ✓' : 'Your answer ✕') : correct ? 'Correct answer' : null;

    if (simple) {
        const Mark = picked ? (correct ? Check : X) : correct ? Minus : null;
        const color = picked ? (correct ? 'var(--orbit-good)' : 'var(--orbit-bad)') : 'var(--orbit-accent)';
        const label = picked ? (correct ? 'Your answer, correct' : 'Your answer, incorrect') : correct ? 'Correct answer, not picked' : '';
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 24, flexShrink: 0, display: 'flex', justifyContent: 'center', color }}>
                    {Mark && <Mark size={22} strokeWidth={Mark === Minus ? 4 : 2.75} aria-hidden="true" />}
                    {label && <span className="sr-only">{label}</span>}
                </span>
                <div className="orbit-option" style={{ flex: 1, cursor: 'default' }}>
                    <span>
                        {letter && <span className="orbit-label" style={{ color: 'inherit', marginRight: 10 }}>{letter}.</span>}
                        {text}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className={`orbit-option ${state}`} style={{ justifyContent: 'space-between', cursor: 'default' }}>
            <span>
                {letter && <span className="orbit-label" style={{ color: 'inherit', marginRight: 10 }}>{letter}.</span>}
                {text}
            </span>
            {note && <span className="orbit-label" style={{ flexShrink: 0, color: correct ? 'var(--orbit-good)' : 'var(--orbit-bad)', opacity: 1 }}>{note}</span>}
        </div>
    );
}
