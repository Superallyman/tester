"use client";

// The Orbit kit's showcase: every component, live, with the HTML to copy, plus controls that write the CSS
// overrides for another app. Built only from orbit/orbit.css classes, so what you see is what an app gets.

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Bookmark, Check, Copy, Menu, Search } from "lucide-react";
import { barlow, inter, spaceGrotesk } from "./fonts";
import "./orbit/orbit.css";

type Theme = "app" | "light" | "dark" | "system";

const FONT_CHOICES = [
    { key: "barlow", label: "Barlow (default)", family: barlow.style.fontFamily, css: '"Barlow", "Inter", system-ui, sans-serif' },
    { key: "inter", label: "Inter", family: inter.style.fontFamily, css: '"Inter", system-ui, sans-serif' },
    { key: "grotesk", label: "Space Grotesk", family: spaceGrotesk.style.fontFamily, css: '"Space Grotesk", system-ui, sans-serif' },
    { key: "system", label: "System UI", family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
];
const ACCENTS = ["#0a84ff", "#e31937", "#2fbf71", "#a855f7", "#f5a524", "#e5e7eb"];
const DEFAULTS = { accent: "#0a84ff", radius: 6, blur: 20, font: "barlow" };

const pre: React.CSSProperties = {
    margin: 0, padding: "12px 14px", fontSize: "0.74rem", lineHeight: 1.55, overflowX: "auto", whiteSpace: "pre",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: 0, textTransform: "none",
};

function CopyButton({ text, label = "Copy", compact = true }: { text: string | (() => Promise<string>); label?: string; compact?: boolean }) {
    const [done, setDone] = useState(false);
    return (
        <button type="button" className="orbit-btn" style={compact ? { padding: "6px 12px" } : undefined}
            onClick={async () => {
                await navigator.clipboard.writeText(typeof text === "string" ? text : await text());
                setDone(true);
                setTimeout(() => setDone(false), 1500);
            }}>
            {done ? <Check size={13} /> : <Copy size={13} />}{done ? "Copied" : label}
        </button>
    );
}

function Code({ html }: { html: string }) {
    return (
        <div className="orbit-glass" style={{ borderRadius: "var(--orbit-radius)", position: "relative" }}>
            <div style={{ position: "absolute", top: 8, right: 8 }}><CopyButton text={html} /></div>
            <pre style={pre}><code>{html}</code></pre>
        </div>
    );
}

function Block({ id, title, blurb, html, children }: { id: string; title: string; blurb: string; html: string; children: React.ReactNode }) {
    return (
        <section id={id} className="orbit-card orbit-stack" style={{ scrollMarginTop: 16 }}>
            <div>
                <h2 className="orbit-h2">{title}</h2>
                <p className="orbit-muted" style={{ marginTop: 4 }}>{blurb}</p>
            </div>
            <div className="orbit-stack" style={{ gap: 14 }}>{children}</div>
            <details>
                <summary className="orbit-label" style={{ cursor: "pointer" }}>HTML</summary>
                <div style={{ marginTop: 10 }}><Code html={html} /></div>
            </details>
        </section>
    );
}

export default function OrbitKit() {
    const [theme, setTheme] = useState<Theme>("app");
    const [accent, setAccent] = useState(DEFAULTS.accent);
    const [radius, setRadius] = useState(DEFAULTS.radius);
    const [blur, setBlur] = useState(DEFAULTS.blur);
    const [fontKey, setFontKey] = useState(DEFAULTS.font);
    const [segment, setSegment] = useState("week");
    const [chips, setChips] = useState<Record<string, boolean>>({ Design: true, Research: false, Billing: false });
    const [notify, setNotify] = useState(true);
    const [plan, setPlan] = useState("team");
    const font = FONT_CHOICES.find(f => f.key === fontKey)!;

    const vars = { "--orbit-accent": accent, "--orbit-radius": `${radius}px`, "--orbit-blur": `${blur}px`, "--orbit-font": font.family } as React.CSSProperties;

    // Only what differs from the kit's defaults
    const overrides = useMemo(() => {
        const lines = [
            accent !== DEFAULTS.accent && `  --orbit-accent: ${accent};`,
            radius !== DEFAULTS.radius && `  --orbit-radius: ${radius}px;`,
            blur !== DEFAULTS.blur && `  --orbit-blur: ${blur}px;`,
            fontKey !== DEFAULTS.font && `  --orbit-font: ${font.css};`,
        ].filter(Boolean);
        return lines.length ? `.orbit {\n${lines.join("\n")}\n}` : "/* Defaults: nothing to override */";
    }, [accent, radius, blur, fontKey, font.css]);

    return (
        <main className="orbit orbit-backdrop" data-theme={theme === "app" ? undefined : theme} style={{ ...vars, minHeight: "100vh", padding: "28px 16px 64px" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto" }} className="orbit-stack">

                {/* ---------- Header ---------- */}
                <header className="orbit-stack" style={{ gap: 10, marginBottom: 6 }}>
                    <p className="orbit-label">Design kit</p>
                    <h1 className="orbit-title" style={{ fontSize: "2.6rem" }}>Orbit</h1>
                    <p className="orbit-body" style={{ maxWidth: 680 }}>
                        Mission-style restraint (monochrome, light numerals, tracked caps, tight corners) made of glass. Colour is kept
                        for state and shows as a glow. One CSS file, no build step, any framework, scoped so it only styles what you wrap.
                    </p>
                    <div className="orbit-row" style={{ marginTop: 4 }}>
                        <CopyButton compact={false} label="Copy orbit.css" text={() => fetch("/design/orbit.css").then(r => r.text())} />
                        <a className="orbit-btn" href="/design/orbit.css" target="_blank" rel="noreferrer">View raw CSS</a>
                        <Link className="orbit-btn orbit-btn--ghost" href="/design/compare">Compare with other directions</Link>
                    </div>
                </header>

                {/* ---------- Controls ---------- */}
                <section className="orbit-card orbit-stack" aria-label="Customise">
                    <h2 className="orbit-h2">Make it yours</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                        <div className="orbit-field">
                            <span className="orbit-label">Theme</span>
                            <div className="orbit-segment" role="group" aria-label="Theme" style={{ flexWrap: "wrap" }}>
                                {([["app", "Follow app"], ["light", "Light"], ["dark", "Dark"], ["system", "System"]] as const).map(([k, l]) => (
                                    <button key={k} aria-pressed={theme === k} onClick={() => setTheme(k)}>{l}</button>
                                ))}
                            </div>
                        </div>
                        <div className="orbit-field">
                            <span className="orbit-label">Accent</span>
                            <div className="orbit-row">
                                {ACCENTS.map(c => (
                                    <button key={c} aria-label={`Accent ${c}`} aria-pressed={accent === c} onClick={() => setAccent(c)}
                                        style={{ width: 24, height: 24, borderRadius: "50%", background: c, cursor: "pointer", border: accent === c ? "2px solid var(--orbit-ink)" : "1px solid var(--orbit-glass-border)", boxShadow: `0 0 10px ${c}66` }} />
                                ))}
                                <input type="color" value={accent} onChange={e => setAccent(e.target.value)} aria-label="Custom accent" style={{ width: 30, height: 26, border: "none", background: "none", cursor: "pointer" }} />
                            </div>
                        </div>
                        <label className="orbit-field">
                            <span className="orbit-label">Corners · {radius}px</span>
                            <input type="range" min={0} max={16} value={radius} onChange={e => setRadius(Number(e.target.value))} style={{ accentColor: "var(--orbit-accent)" }} />
                        </label>
                        <label className="orbit-field">
                            <span className="orbit-label">Frost · {blur}px</span>
                            <input type="range" min={0} max={40} value={blur} onChange={e => setBlur(Number(e.target.value))} style={{ accentColor: "var(--orbit-accent)" }} />
                        </label>
                        <label className="orbit-field">
                            <span className="orbit-label">Font</span>
                            <select className="orbit-input" value={fontKey} onChange={e => setFontKey(e.target.value)}>
                                {FONT_CHOICES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                            </select>
                        </label>
                    </div>
                    <div className="orbit-stack" style={{ gap: 6 }}>
                        <span className="orbit-label">Your overrides, to paste after orbit.css</span>
                        <Code html={overrides} />
                        <div className="orbit-row">
                            <button className="orbit-btn orbit-btn--ghost" onClick={() => { setAccent(DEFAULTS.accent); setRadius(DEFAULTS.radius); setBlur(DEFAULTS.blur); setFontKey(DEFAULTS.font); }}>Reset to defaults</button>
                        </div>
                    </div>
                </section>

                {/* ---------- Integration ---------- */}
                <section className="orbit-card orbit-stack" aria-labelledby="add-title">
                    <h2 id="add-title" className="orbit-h2">Add it to an app</h2>
                    <ol className="orbit-stack" style={{ margin: 0, paddingLeft: 18 }}>
                        <li className="orbit-body"><strong>Copy orbit.css</strong> into the app and load it once (root layout, <code>main.tsx</code>, or a <code>&lt;link&gt;</code>).</li>
                        <li className="orbit-body"><strong>Add the <code>orbit</code> class</strong> to what should use it: <code>&lt;body&gt;</code> for everything, or one section to adopt it gradually. Add <code>orbit-backdrop</code> for the horizon background.</li>
                        <li className="orbit-body"><strong>Dark mode</strong> follows the app&apos;s <code>.dark</code> class or <code>data-theme=&quot;dark&quot;</code> by default; set <code>data-theme</code> on the orbit element to <code>light</code>, <code>dark</code> or <code>system</code> to override.</li>
                        <li className="orbit-body"><strong>Optional:</strong> load Barlow, and paste your overrides from above.</li>
                    </ol>
                    <Code html={`<!-- 1. once, globally -->\n<link rel="stylesheet" href="/orbit.css">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@200;300;400;500;600&display=swap">\n\n<!-- 2. opt in -->\n<body class="orbit orbit-backdrop">\n  <div class="orbit-card orbit-stack">\n    <p class="orbit-label">Account</p>\n    <input class="orbit-input" placeholder="Email">\n    <button class="orbit-btn orbit-btn--primary">Save changes</button>\n  </div>\n</body>`} />
                    <p className="orbit-muted">The full guide (tokens, every class, browser support) is <code>app/design/orbit/README.md</code>, next to the CSS. Copy both.</p>
                </section>

                <nav className="orbit-row" aria-label="Components" style={{ gap: "6px 16px", padding: "4px 2px" }}>
                    {[["type", "Type"], ["buttons", "Buttons"], ["toggles", "Toggles"], ["fields", "Fields"], ["rows", "Selectable rows"], ["status", "Status"], ["nav", "Navigation"], ["example", "Example screen"]].map(([id, l]) => (
                        <a key={id} href={`#${id}`} className="orbit-label" style={{ textDecoration: "none" }}>{l}</a>
                    ))}
                </nav>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
                    <Block id="type" title="Type" blurb="Light display type, tracked caps for structure, tabular numerals"
                        html={`<h1 class="orbit-title">Mission control</h1>\n<h2 class="orbit-h2">Section title</h2>\n<p class="orbit-body">Body text for reading.</p>\n<p class="orbit-muted">Secondary detail</p>\n<p class="orbit-label">Label</p>\n<span class="orbit-stat">74%</span>`}>
                        <h1 className="orbit-title">Mission control</h1>
                        <h2 className="orbit-h2">Section title</h2>
                        <p className="orbit-body">Body text for reading. Calm, legible, generous line height.</p>
                        <p className="orbit-muted">Secondary detail · updated 3 minutes ago</p>
                        <p className="orbit-label">Label</p>
                        <span className="orbit-stat">74%</span>
                    </Block>

                    <Block id="buttons" title="Buttons" blurb="Ink primary, accent for the one thing that matters, glass for the rest"
                        html={`<button class="orbit-btn orbit-btn--primary">Save changes</button>\n<button class="orbit-btn orbit-btn--accent">Launch</button>\n<button class="orbit-btn">Cancel</button>\n<button class="orbit-btn orbit-btn--danger">Delete</button>\n<button class="orbit-btn orbit-btn--ghost">Learn more</button>\n<button class="orbit-btn orbit-btn--icon" aria-label="Menu">…</button>\n<button class="orbit-btn orbit-btn--primary" disabled>Saving…</button>`}>
                        <div className="orbit-row"><button className="orbit-btn orbit-btn--primary">Save changes</button><button className="orbit-btn orbit-btn--accent">Launch</button></div>
                        <div className="orbit-row"><button className="orbit-btn">Cancel</button><button className="orbit-btn orbit-btn--danger">Delete</button><button className="orbit-btn orbit-btn--ghost">Learn more</button></div>
                        <div className="orbit-row">
                            <button className="orbit-btn orbit-btn--icon" aria-label="Menu"><Menu size={17} /></button>
                            <button className="orbit-btn orbit-btn--icon" aria-label="Bookmark"><Bookmark size={16} /></button>
                            <button className="orbit-btn orbit-btn--icon" aria-label="Notifications"><Bell size={16} /></button>
                            <button className="orbit-btn orbit-btn--primary" disabled>Saving…</button>
                        </div>
                    </Block>

                    <Block id="toggles" title="Toggles" blurb="Segmented control, filter chips, switch; state lives in aria attributes"
                        html={`<div class="orbit-segment" role="group">\n  <button aria-pressed="false">Day</button>\n  <button aria-pressed="true">Week</button>\n  <button aria-pressed="false">Month</button>\n</div>\n\n<button class="orbit-chip" aria-pressed="true">Design</button>\n<button class="orbit-chip">Research</button>\n<span class="orbit-chip is-excluded">Archived</span>\n\n<button class="orbit-switch" role="switch" aria-checked="true" aria-label="Notifications"></button>`}>
                        <div className="orbit-segment" role="group" aria-label="Range">
                            {["day", "week", "month"].map(k => <button key={k} aria-pressed={segment === k} onClick={() => setSegment(k)}>{k}</button>)}
                        </div>
                        <div className="orbit-row">
                            {Object.keys(chips).map(c => <button key={c} className="orbit-chip" aria-pressed={chips[c]} onClick={() => setChips(p => ({ ...p, [c]: !p[c] }))}>{c}</button>)}
                            <span className="orbit-chip is-excluded">Archived</span>
                        </div>
                        <label className="orbit-row"><button className="orbit-switch" role="switch" aria-checked={notify} onClick={() => setNotify(v => !v)} aria-label="Notifications" /> <span className="orbit-label">Notifications</span></label>
                    </Block>

                    <Block id="fields" title="Fields" blurb="Frosted inputs, accent focus ring, error via aria-invalid"
                        html={`<label class="orbit-field">\n  <span class="orbit-label">Email</span>\n  <input class="orbit-input" type="email" placeholder="you@company.com">\n</label>\n<select class="orbit-input">…</select>\n<textarea class="orbit-input" rows="2"></textarea>\n<input class="orbit-input" aria-invalid="true" value="not-an-email">`}>
                        <div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 12, top: 12, opacity: 0.5 }} /><input className="orbit-input" style={{ paddingLeft: 34 }} placeholder="Search" /></div>
                        <label className="orbit-field"><span className="orbit-label">Email</span><input className="orbit-input" type="email" placeholder="you@company.com" /></label>
                        <select className="orbit-input" defaultValue=""><option value="">Choose a region</option><option>North America</option><option>Europe</option></select>
                        <textarea className="orbit-input" rows={2} placeholder="Notes" style={{ fontFamily: "inherit" }} />
                        <label className="orbit-field"><span className="orbit-label" style={{ color: "var(--orbit-bad)" }}>Email · check the address</span><input className="orbit-input" aria-invalid="true" defaultValue="not-an-email" /></label>
                        <label className="orbit-row orbit-body"><input type="checkbox" defaultChecked /> Remember me</label>
                    </Block>

                    <Block id="rows" title="Selectable rows" blurb="Choices, settings, quiz answers; marking states glow instead of filling"
                        html={`<button class="orbit-option" role="radio" aria-checked="true">Team plan</button>\n<button class="orbit-option" role="radio" aria-checked="false">Solo plan</button>\n\n<!-- after marking -->\n<div class="orbit-option is-wrong">Your pick</div>\n<div class="orbit-option is-missed">Right answer you missed</div>\n<div class="orbit-option is-right">Right pick</div>`}>
                        <div className="orbit-stack" style={{ gap: 8 }} role="radiogroup" aria-label="Plan">
                            {[["solo", "Solo", "1 seat"], ["team", "Team", "Up to 20 seats"], ["org", "Organisation", "Unlimited"]].map(([k, name, note]) => (
                                <button key={k} className="orbit-option" role="radio" aria-checked={plan === k} onClick={() => setPlan(k)}>
                                    <span className="orbit-label" style={{ color: "inherit" }}>{name}</span><span style={{ flex: 1 }} /><span className="orbit-muted">{note}</span>
                                </button>
                            ))}
                        </div>
                        <div className="orbit-stack" style={{ gap: 8 }}>
                            <div className="orbit-option is-wrong"><span style={{ flex: 1 }}>Your pick</span><span className="orbit-label" style={{ color: "var(--orbit-bad)" }}>Yours</span></div>
                            <div className="orbit-option is-missed"><span style={{ flex: 1 }}>The right answer you missed</span><span className="orbit-label" style={{ color: "var(--orbit-good)" }}>Answer</span></div>
                            <div className="orbit-option is-right"><span style={{ flex: 1 }}>A right pick</span><span className="orbit-label" style={{ color: "var(--orbit-good)" }}>Correct</span></div>
                        </div>
                    </Block>

                    <Block id="status" title="Status" blurb="Stat tiles, badges, alerts and progress"
                        html={`<div class="orbit-card">\n  <p class="orbit-label">Uptime</p>\n  <span class="orbit-stat">99.9%</span>\n</div>\n<span class="orbit-badge">Admin</span>\n<span class="orbit-badge orbit-badge--good">Live</span>\n<span class="orbit-badge orbit-badge--bad">3</span>\n<div class="orbit-alert orbit-alert--bad">Payment failed.</div>\n<div class="orbit-progress"><span style="width: 60%"></span></div>`}>
                        <div className="orbit-row" style={{ alignItems: "stretch" }}>
                            <div className="orbit-card" style={{ flex: 1 }}><p className="orbit-label">Uptime</p><div className="orbit-stat" style={{ marginTop: 8 }}>99.9%</div></div>
                            <div className="orbit-card" style={{ flex: 1 }}><p className="orbit-label">Queue</p><div className="orbit-stat" style={{ marginTop: 8 }}>12</div></div>
                        </div>
                        <div className="orbit-row"><span className="orbit-badge">Admin</span><span className="orbit-badge orbit-badge--good">Live</span><span className="orbit-badge orbit-badge--bad">3</span></div>
                        <div className="orbit-alert orbit-alert--bad">Payment failed. Update the card on file.</div>
                        <div className="orbit-alert orbit-alert--good">Changes saved.</div>
                        <div className="orbit-alert orbit-alert--warn">Your trial ends in 3 days.</div>
                        <div><div className="orbit-row" style={{ justifyContent: "space-between" }}><span className="orbit-label">Storage</span><span className="orbit-label">60 / 100 GB</span></div>
                            <div className="orbit-progress" style={{ marginTop: 8 }}><span style={{ width: "60%" }} /></div></div>
                    </Block>

                    <Block id="nav" title="Navigation" blurb="A frosted bar; aria-current marks the active link"
                        html={`<nav class="orbit-nav">\n  <a href="/" aria-current="page">Overview</a>\n  <a href="/reports">Reports</a>\n  <a href="/settings">Settings</a>\n</nav>`}>
                        <nav className="orbit-nav"><a href="#nav" aria-current="page">Overview</a><a href="#nav">Reports</a><a href="#nav">Settings</a></nav>
                        <div className="orbit-segment" role="tablist" aria-label="Tabs"><button role="tab" aria-selected>Members</button><button role="tab" aria-selected={false}>Invites · 2</button></div>
                    </Block>

                    <Block id="example" title="Example screen" blurb="The pieces together: a settings panel"
                        html={`<div class="orbit-card orbit-stack">\n  <p class="orbit-label">Workspace</p>\n  <h2 class="orbit-h2">Settings</h2>\n  <label class="orbit-field"><span class="orbit-label">Name</span><input class="orbit-input" value="Northwind"></label>\n  <div class="orbit-row"><button class="orbit-switch" role="switch" aria-checked="true"></button><span class="orbit-label">Weekly digest</span></div>\n  <hr class="orbit-divider">\n  <div class="orbit-row"><button class="orbit-btn orbit-btn--primary">Save</button><button class="orbit-btn">Cancel</button></div>\n</div>`}>
                        <div className="orbit-card orbit-stack">
                            <p className="orbit-label">Workspace</p>
                            <h2 className="orbit-h2">Settings</h2>
                            <label className="orbit-field"><span className="orbit-label">Name</span><input className="orbit-input" defaultValue="Northwind" /></label>
                            <div className="orbit-row"><button className="orbit-switch" role="switch" aria-checked={notify} onClick={() => setNotify(v => !v)} aria-label="Weekly digest" /><span className="orbit-label">Weekly digest</span></div>
                            <hr className="orbit-divider" />
                            <div className="orbit-row"><button className="orbit-btn orbit-btn--primary">Save</button><button className="orbit-btn">Cancel</button></div>
                        </div>
                    </Block>
                </div>
            </div>
        </main>
    );
}
