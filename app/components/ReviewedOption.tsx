// One answer option after the question is marked, as shown in Quick Test results and History:
// your pick glows green or red, a correct answer you didn't pick is outlined, and each says so in words.

import React from 'react';

export default function ReviewedOption({ text, letter, picked, correct }: { text: string; letter?: string; picked: boolean; correct: boolean }) {
    const state = picked ? (correct ? 'is-right' : 'is-wrong') : correct ? 'is-missed' : '';
    const note = picked ? (correct ? 'Your answer ✓' : 'Your answer ✕') : correct ? 'Correct answer' : null;
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
