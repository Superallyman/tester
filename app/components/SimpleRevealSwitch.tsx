"use client";

// Switch for the "simple reveal" preference, shared by Quick Test results and /account
export default function SimpleRevealSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
    return (
        <label className="orbit-row orbit-body" style={{ gap: 10, cursor: 'pointer' }}>
            <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="orbit-switch" aria-label="Simple reveal" />
            Simple reveal
        </label>
    );
}
