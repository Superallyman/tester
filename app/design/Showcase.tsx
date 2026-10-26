"use client";

// /design: every styled piece of the app in three directions, side by side, each with a code to refer to.
//   A · Current  – copied from today's pages (inline styles and the shadcn ui/ components, used unchanged)
//   B · Glass    – Apple's Liquid Glass: translucent, blurred, specular edges, pill shapes
//   C · Mission  – Tesla / SpaceX: monochrome, sharp, hairlines, thin type, tracked uppercase labels
// Nothing outside app/design/ is changed or styled by this page.

import React, { useState } from "react";
import { Bookmark, Check, Flag, Flame, Menu, NotebookPen, Search, Timer, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FONTS } from "./fonts";
import s from "./design.module.css";

const ACCENTS = [
    { code: "AC1", label: "App blue (current)", color: "#0070f3", ink: "#ffffff" },
    { code: "AC2", label: "Apple blue", color: "#0a84ff", ink: "#ffffff" },
    { code: "AC3", label: "Tesla red", color: "#e31937", ink: "#ffffff" },
    { code: "AC4", label: "Ink (monochrome)", color: "#171a20", ink: "#ffffff" },
];

const SECTIONS = [
    ["type", "Typography"], ["color", "Colour"], ["buttons", "Buttons"], ["inputs", "Inputs"],
    ["quiz", "Quiz pieces"], ["cards", "Cards & status"], ["nav", "Navigation"],
] as const;

// ---------- layout helpers ----------

function Spec({ code, note, children }: { code: string; note?: string; children: React.ReactNode }) {
    return (
        <div className={s.spec}>
            <span className={s.code}>{code}{note && <span className={s.codeNote}>{note}</span>}</span>
            {children}
        </div>
    );
}

function Section({ id, title, blurb, a, b, c }: { id: string; title: string; blurb: string; a: React.ReactNode; b: React.ReactNode; c: React.ReactNode }) {
    return (
        <section id={id} className={s.section}>
            <div className={s.sectionHead}><h2>{title}</h2><p>{blurb}</p></div>
            <div className={s.columns}>
                <div><div className={s.colHead}>A · CURRENT</div><div className={`${s.stage} ${s.stageA}`}>{a}</div></div>
                <div><div className={s.colHead}>B · GLASS</div><div className={`${s.stage} ${s.stageB}`}>{b}</div></div>
                <div><div className={s.colHead}>C · MISSION</div><div className={`${s.stage} ${s.stageC}`}>{c}</div></div>
            </div>
        </section>
    );
}

// Today's recurring inline styles, copied from the pages that use them
const A = {
    card: { padding: "1.25rem", border: "1px solid rgba(128,128,128,0.2)", borderRadius: 12, background: "rgba(128,128,128,0.05)" } as React.CSSProperties,
    primary: { padding: "12px 18px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer" } as React.CSSProperties,
    secondary: { padding: "10px 18px", background: "transparent", color: "inherit", border: "1px solid rgba(128,128,128,0.4)", borderRadius: 8, cursor: "pointer" } as React.CSSProperties,
    field: { padding: "10px", background: "rgba(128,128,128,0.1)", border: "1px solid rgba(128,128,128,0.2)", color: "inherit", borderRadius: 8, width: "100%" } as React.CSSProperties,
    label: { fontSize: "0.65rem", opacity: 0.6, letterSpacing: "0.05em" } as React.CSSProperties,
};

const OPTIONS = ["Central retinal vein", "Central retinal artery", "Choroidal ciliaries", "Vortex veins"];
// Demo of every option state: B picked (wrong), C is the answer (missed)
const STATES = ["plain", "wrong", "missed", "plain"] as const;

export default function Showcase() {
    const [font, setFont] = useState<(typeof FONTS)[number]["key"]>("system");
    const [accent, setAccent] = useState(ACCENTS[1]);
    const [radius, setRadius] = useState(1);
    const [segment, setSegment] = useState<"all" | "one">("all");
    const [picked, setPicked] = useState<number | null>(1);
    const [rating, setRating] = useState<number | null>(3);
    const [switchOn, setSwitchOn] = useState(true);
    const fontClass = FONTS.find(f => f.key === font)!.className;

    const pageVars = { "--accent": accent.color, "--accent-ink": accent.ink, "--r": radius } as React.CSSProperties;

    const ratingRow = (cls: { on: string; off: string } | null) => (
        <div className={s.row} role="radiogroup" aria-label="Confidence">
            {[1, 2, 3, 4].map(n => cls ? (
                <button key={n} role="radio" aria-checked={rating === n} onClick={() => setRating(rating === n ? null : n)}
                    className={rating === n ? cls.on : cls.off} style={{ flex: 1, minWidth: 0 }}>{n}</button>
            ) : (
                <button key={n} role="radio" aria-checked={rating === n} onClick={() => setRating(rating === n ? null : n)}
                    style={{ flex: 1, padding: 8, borderRadius: 6, border: rating === n ? "1px solid #0070f3" : "1px solid rgba(128,128,128,0.4)", cursor: "pointer", background: rating === n ? "#0070f3" : "transparent", color: rating === n ? "white" : "inherit", fontSize: "0.8rem" }}>{n}</button>
            ))}
        </div>
    );

    return (
        <main className={`${s.page} ${fontClass}`} style={pageVars}>
            <div className={s.intro}>
                <h1>Design showcase</h1>
                <p>Every styled piece of the app, as it is today (A) and in two directions: <strong>B · Glass</strong>, after Apple&apos;s
                    Liquid Glass, and <strong>C · Mission</strong>, after Tesla and SpaceX. Nothing here changes the real pages.</p>
                <p>Each specimen has a code. Mix and match, e.g. &ldquo;BTN-C1 buttons, IN-B1 inputs, F3 font, AC4 accent, radius 0.5&rdquo;.
                    Use the theme toggle in the navbar to see dark mode.</p>
            </div>

            <div className={s.controls} aria-label="Preview controls">
                <label>Font
                    <select value={font} onChange={e => setFont(e.target.value as typeof font)}>
                        {FONTS.map(f => <option key={f.key} value={f.key}>{f.code} · {f.label}</option>)}
                    </select>
                </label>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Accent
                    {ACCENTS.map(a => (
                        <button key={a.code} className={s.swatch} aria-pressed={accent.code === a.code} title={`${a.code} · ${a.label}`}
                            onClick={() => setAccent(a)} style={{ background: a.color }} />
                    ))}
                    <span style={{ opacity: 0.7 }}>{accent.code}</span>
                </span>
                <label>Corners (B, C)
                    <input type="range" min={0} max={2} step={0.25} value={radius} onChange={e => setRadius(Number(e.target.value))} />
                    <span style={{ opacity: 0.7, width: 32 }}>×{radius}</span>
                </label>
            </div>
            <nav className={s.toc} aria-label="Sections">{SECTIONS.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}</nav>

            {/* ---------------- TYPOGRAPHY ---------------- */}
            <Section id="type" title="Typography" blurb="Page title, section title, body, muted text, labels, big numbers"
                a={<>
                    <Spec code="TYPE-A1" note="page title"><h1 style={{ margin: 0, fontSize: "1.7rem", fontWeight: 700 }}>NBEO Part I Practice Exam</h1></Spec>
                    <Spec code="TYPE-A2" note="section title"><h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>Your past exams</h2></Spec>
                    <Spec code="TYPE-A3" note="body"><p style={{ margin: 0, lineHeight: 1.5 }}>The photoreceptors receive their blood supply from the choroid.</p></Spec>
                    <Spec code="TYPE-A4" note="muted"><p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.6 }}>Last attempted 3 days ago</p></Spec>
                    <Spec code="TYPE-A5" note="label"><span style={A.label}>QUESTION LIMIT</span></Spec>
                    <Spec code="TYPE-A6" note="stat"><span style={{ fontSize: "1.4rem", fontWeight: 700 }}>74%</span></Spec>
                </>}
                b={<div className={s.gCard} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <Spec code="TYPE-B1"><h1 className={s.gTitle}>NBEO Part I Practice Exam</h1></Spec>
                    <Spec code="TYPE-B2"><h2 className={s.gH2}>Your past exams</h2></Spec>
                    <Spec code="TYPE-B3"><p className={s.gBody}>The photoreceptors receive their blood supply from the choroid.</p></Spec>
                    <Spec code="TYPE-B4"><p className={s.gMuted}>Last attempted 3 days ago</p></Spec>
                    <Spec code="TYPE-B5"><p className={s.gLabel}>Question limit</p></Spec>
                    <Spec code="TYPE-B6"><span className={s.gStat}>74%</span></Spec>
                </div>}
                c={<>
                    <Spec code="TYPE-C1"><h1 className={s.mTitle}>NBEO Part I Practice Exam</h1></Spec>
                    <Spec code="TYPE-C2"><h2 className={s.mH2}>Your past exams</h2></Spec>
                    <Spec code="TYPE-C3"><p className={s.mBody}>The photoreceptors receive their blood supply from the choroid.</p></Spec>
                    <Spec code="TYPE-C4"><p className={s.mMuted}>Last attempted 3 days ago</p></Spec>
                    <Spec code="TYPE-C5"><p className={s.mLabel}>Question limit</p></Spec>
                    <Spec code="TYPE-C6"><span className={s.mStat}>74%</span></Spec>
                </>}
            />

            {/* ---------------- COLOUR ---------------- */}
            <Section id="color" title="Colour" blurb="Surfaces, text, accent and the reserved status colours"
                a={<Spec code="COL-A1" note="today">
                    <Swatches items={[["#0070f3", "primary"], ["#3b82f6", "links"], ["#10b981", "correct"], ["#ef4444", "wrong"], ["#f59e0b", "warning"], ["rgba(128,128,128,0.05)", "card"]]} />
                </Spec>}
                b={<Spec code="COL-B1" note="system colours, translucent surfaces">
                    <Swatches items={[[accent.color, "accent"], ["#30d158", "correct"], ["#ff453a", "wrong"], ["#ff9f0a", "warning"], ["rgba(255,255,255,0.45)", "glass"], ["#1d1d1f", "ink"]]} />
                </Spec>}
                c={<Spec code="COL-C1" note="ink, paper, one accent">
                    <Swatches items={[["#171a20", "ink"], ["#ffffff", "paper"], ["#5c5e62", "secondary"], [accent.color, "accent"], ["#12a150", "correct"], ["#e31937", "wrong"]]} />
                </Spec>}
            />

            {/* ---------------- BUTTONS ---------------- */}
            <Section id="buttons" title="Buttons" blurb="Primary, secondary, link, destructive, icon, disabled, segmented, chips"
                a={<>
                    <Spec code="BTN-A1" note="primary"><div className={s.row}><button style={A.primary}>Generate Quiz</button><Button>Save</Button></div></Spec>
                    <Spec code="BTN-A2" note="secondary"><div className={s.row}><button style={A.secondary}>Discard</button><Button variant="outline">Reset password</Button></div></Spec>
                    <Spec code="BTN-A3" note="link"><button style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", padding: 0 }}>Change goal</button></Spec>
                    <Spec code="BTN-A4" note="destructive"><button style={{ ...A.primary, background: "#ef4444" }}>Send report</button></Spec>
                    <Spec code="BTN-A5" note="icon"><button aria-label="Menu" style={{ border: "1px solid rgba(128,128,128,0.3)", borderRadius: 8, padding: 8, background: "none", color: "inherit", display: "inline-flex" }}><Menu size={18} /></button></Spec>
                    <Spec code="BTN-A6" note="disabled"><button style={{ ...A.primary, opacity: 0.4 }} disabled>Building exam…</button></Spec>
                    <Spec code="BTN-A7" note="segmented">
                        <div role="group" style={{ display: "inline-flex", border: "1px solid rgba(128,128,128,0.3)", borderRadius: 8, overflow: "hidden", fontSize: "0.8rem" }}>
                            {(["all", "one"] as const).map(m => (
                                <button key={m} aria-pressed={segment === m} onClick={() => setSegment(m)}
                                    style={{ padding: "6px 12px", border: "none", cursor: "pointer", color: segment === m ? "white" : "inherit", background: segment === m ? "#0070f3" : "transparent" }}>
                                    {m === "all" ? "All at once" : "One at a time"}
                                </button>
                            ))}
                        </div>
                    </Spec>
                    <Spec code="BTN-A8" note="category chips">
                        <div className={s.row}>
                            <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: "0.75rem", background: "#059669", color: "white" }}>✓ Glaucoma</span>
                            <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: "0.75rem", background: "#dc2626", color: "white" }}>✕ Optics</span>
                            <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: "0.75rem", background: "rgba(128,128,128,0.2)" }}>Neuro</span>
                        </div>
                    </Spec>
                </>}
                b={<>
                    <Spec code="BTN-B1"><div className={s.row}><button className={s.gBtnPrimary}>Generate Quiz</button></div></Spec>
                    <Spec code="BTN-B2"><div className={s.row}><button className={s.gBtn}>Discard</button></div></Spec>
                    <Spec code="BTN-B3"><button className={s.gBtnGhost}>Change goal</button></Spec>
                    <Spec code="BTN-B4"><button className={s.gBtnDanger}>Send report</button></Spec>
                    <Spec code="BTN-B5"><div className={s.row}><button className={s.gIconBtn} aria-label="Menu"><Menu size={18} /></button><button className={s.gIconBtn} aria-label="Bookmark"><Bookmark size={17} /></button></div></Spec>
                    <Spec code="BTN-B6"><button className={`${s.gBtnPrimary} ${s.gDisabled}`} disabled>Building exam…</button></Spec>
                    <Spec code="BTN-B7">
                        <div className={s.gSegment} role="group">
                            {(["all", "one"] as const).map(m => <button key={m} aria-pressed={segment === m} onClick={() => setSegment(m)}>{m === "all" ? "All at once" : "One at a time"}</button>)}
                        </div>
                    </Spec>
                    <Spec code="BTN-B8"><div className={s.row}><span className={s.gChipOn}>Glaucoma</span><span className={s.gChipOff}>Optics</span><span className={s.gChip}>Neuro</span></div></Spec>
                </>}
                c={<>
                    <Spec code="BTN-C1"><div className={s.row}><button className={s.mBtnPrimary}>Generate Quiz</button></div></Spec>
                    <Spec code="BTN-C2"><div className={s.row}><button className={s.mBtn}>Discard</button></div></Spec>
                    <Spec code="BTN-C3"><button className={s.mBtnGhost}>Change goal</button></Spec>
                    <Spec code="BTN-C4"><button className={s.mBtnDanger}>Send report</button></Spec>
                    <Spec code="BTN-C5"><div className={s.row}><button className={s.mIconBtn} aria-label="Menu"><Menu size={18} /></button><button className={s.mIconBtn} aria-label="Bookmark"><Bookmark size={17} /></button></div></Spec>
                    <Spec code="BTN-C6"><button className={`${s.mBtnPrimary} ${s.mDisabled}`} disabled>Building exam…</button></Spec>
                    <Spec code="BTN-C7">
                        <div className={s.mSegment} role="group">
                            {(["all", "one"] as const).map(m => <button key={m} aria-pressed={segment === m} onClick={() => setSegment(m)}>{m === "all" ? "All at once" : "One at a time"}</button>)}
                        </div>
                    </Spec>
                    <Spec code="BTN-C8"><div className={s.row}><span className={s.mChipOn}>Glaucoma</span><span className={s.mChipOff}>Optics</span><span className={s.mChip}>Neuro</span></div></Spec>
                </>}
            />

            {/* ---------------- INPUTS ---------------- */}
            <Section id="inputs" title="Inputs" blurb="Search, numbers, selects, checkboxes, text areas, and a switch the app doesn't have yet"
                a={<>
                    <Spec code="IN-A1" note="search"><div className={s.row} style={{ flexWrap: "nowrap" }}><Input placeholder="Search text, options or an id" /><Button variant="outline">Search</Button></div></Spec>
                    <Spec code="IN-A2" note="number"><span style={A.label}>QUESTION LIMIT</span><input type="number" defaultValue={20} style={A.field} /></Spec>
                    <Spec code="IN-A3" note="select"><select style={{ ...A.field, padding: 8 }} defaultValue=""><option value="">Any difficulty</option><option>Hard</option></select></Spec>
                    <Spec code="IN-A4" note="checkbox"><label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.9rem" }}><input type="checkbox" defaultChecked /> Exclude Mastered</label></Spec>
                    <Spec code="IN-A5" note="text area"><textarea rows={2} placeholder="Only you can see this…" style={{ ...A.field, fontFamily: "inherit" }} /></Spec>
                </>}
                b={<>
                    <Spec code="IN-B1"><div className={s.row} style={{ flexWrap: "nowrap" }}><div style={{ position: "relative", flex: 1 }}><Search size={16} style={{ position: "absolute", left: 12, top: 12, opacity: 0.5 }} /><input className={s.gInput} style={{ paddingLeft: 36 }} placeholder="Search questions" /></div></div></Spec>
                    <Spec code="IN-B2"><p className={s.gLabel}>Question limit</p><input type="number" defaultValue={20} className={s.gInput} /></Spec>
                    <Spec code="IN-B3"><select className={s.gInput} defaultValue=""><option value="">Any difficulty</option><option>Hard</option></select></Spec>
                    <Spec code="IN-B4"><label className={s.row} style={{ fontSize: "0.9rem" }}><button role="switch" aria-checked={switchOn} onClick={() => setSwitchOn(v => !v)} className={s.gSwitch} aria-label="Exclude mastered" /> Exclude mastered</label></Spec>
                    <Spec code="IN-B5"><textarea rows={2} className={s.gInput} placeholder="Only you can see this…" style={{ fontFamily: "inherit" }} /></Spec>
                </>}
                c={<>
                    <Spec code="IN-C1"><div className={s.row} style={{ flexWrap: "nowrap" }}><input className={s.mInput} placeholder="Search questions" /><button className={s.mBtn}>Search</button></div></Spec>
                    <Spec code="IN-C2"><p className={s.mLabel}>Question limit</p><input type="number" defaultValue={20} className={s.mInput} /></Spec>
                    <Spec code="IN-C3"><select className={s.mInput} defaultValue=""><option value="">Any difficulty</option><option>Hard</option></select></Spec>
                    <Spec code="IN-C4"><label className={s.row} style={{ fontSize: "0.85rem" }}><button role="switch" aria-checked={switchOn} onClick={() => setSwitchOn(v => !v)} className={s.mSwitch} aria-label="Exclude mastered" /> <span className={s.mLabel} style={{ color: "inherit" }}>Exclude mastered</span></label></Spec>
                    <Spec code="IN-C5"><textarea rows={2} className={s.mInput} placeholder="Only you can see this…" style={{ fontFamily: "inherit" }} /></Spec>
                </>}
            />

            {/* ---------------- QUIZ ---------------- */}
            <Section id="quiz" title="Quiz pieces" blurb="Answer options before and after marking, the rating picker, the question footer"
                a={<>
                    <Spec code="Q-A1" note="choosing (click one)">
                        <div style={{ display: "grid", gap: 8 }}>
                            {OPTIONS.slice(0, 3).map((o, i) => (
                                <button key={o} onClick={() => setPicked(i)} style={{ padding: 12, textAlign: "left", borderRadius: 8, color: "inherit", cursor: "pointer", display: "flex", gap: 10,
                                    background: picked === i ? "rgba(0,112,243,0.12)" : "transparent", border: picked === i ? "1.5px solid #0070f3" : "1px solid rgba(128,128,128,0.4)" }}>
                                    <span>{picked === i ? "●" : "○"}</span><b style={{ opacity: 0.6 }}>{"ABC"[i]}.</b>{o}
                                </button>
                            ))}
                        </div>
                    </Spec>
                    <Spec code="Q-A2" note="marked: wrong pick, missed answer">
                        <div style={{ display: "grid", gap: 8 }}>
                            {OPTIONS.map((o, i) => <MarkedA key={o} text={o} letter={"ABCD"[i]} state={STATES[i]} />)}
                        </div>
                    </Spec>
                    <Spec code="Q-A3" note="rating">{ratingRow(null)}</Spec>
                    <Spec code="Q-A4" note="footer"><QuizFooter tone="a" /></Spec>
                </>}
                b={<>
                    <Spec code="Q-B1">
                        <div style={{ display: "grid", gap: 8 }}>
                            {OPTIONS.slice(0, 3).map((o, i) => (
                                <button key={o} onClick={() => setPicked(i)} className={`${s.gOption} ${picked === i ? s.gOptionSel : ""}`}>
                                    <b style={{ opacity: 0.55 }}>{"ABC"[i]}</b>{o}
                                </button>
                            ))}
                        </div>
                    </Spec>
                    <Spec code="Q-B2">
                        <div style={{ display: "grid", gap: 8 }}>
                            {OPTIONS.map((o, i) => (
                                <div key={o} className={`${s.gOption} ${STATES[i] === "wrong" ? s.gOptionWrong : STATES[i] === "missed" ? s.gOptionMissed : ""}`}>
                                    <b style={{ opacity: 0.55 }}>{"ABCD"[i]}</b><span style={{ flex: 1 }}>{o}</span>
                                    {STATES[i] === "wrong" && <X size={16} color="#ff453a" aria-label="Your answer, wrong" />}
                                    {STATES[i] === "missed" && <Check size={16} color="#30d158" aria-label="Correct answer" />}
                                </div>
                            ))}
                        </div>
                    </Spec>
                    <Spec code="Q-B3">{ratingRow({ on: s.gBtnPrimary, off: s.gBtn })}</Spec>
                    <Spec code="Q-B4"><QuizFooter tone="b" /></Spec>
                </>}
                c={<>
                    <Spec code="Q-C1">
                        <div style={{ display: "grid", gap: 8 }}>
                            {OPTIONS.slice(0, 3).map((o, i) => (
                                <button key={o} onClick={() => setPicked(i)} className={`${s.mOption} ${picked === i ? s.mOptionSel : ""}`}>
                                    <span className={s.mLabel} style={{ color: "inherit" }}>{"ABC"[i]}</span>{o}
                                </button>
                            ))}
                        </div>
                    </Spec>
                    <Spec code="Q-C2">
                        <div style={{ display: "grid", gap: 8 }}>
                            {OPTIONS.map((o, i) => (
                                <div key={o} className={`${s.mOption} ${STATES[i] === "wrong" ? s.mOptionWrong : STATES[i] === "missed" ? s.mOptionMissed : ""}`}>
                                    <span className={s.mLabel} style={{ color: "inherit" }}>{"ABCD"[i]}</span><span style={{ flex: 1 }}>{o}</span>
                                    {STATES[i] === "wrong" && <span className={s.mLabel} style={{ color: "#e31937" }}>Your answer</span>}
                                    {STATES[i] === "missed" && <span className={s.mLabel} style={{ color: "#12a150" }}>Correct</span>}
                                </div>
                            ))}
                        </div>
                    </Spec>
                    <Spec code="Q-C3">{ratingRow({ on: s.mBtnPrimary, off: s.mBtn })}</Spec>
                    <Spec code="Q-C4"><QuizFooter tone="c" /></Spec>
                </>}
            />

            {/* ---------------- CARDS & STATUS ---------------- */}
            <Section id="cards" title="Cards & status" blurb="Stat tiles, Smart Review cards, alerts, badges, progress"
                a={<>
                    <Spec code="CARD-A1" note="stat tile"><div style={{ ...A.card, padding: "0.9rem 1rem" }}><div style={A.label}>AVERAGE</div><div style={{ fontSize: "1.4rem", fontWeight: 700 }}>64%</div></div></Spec>
                    <Spec code="CARD-A2" note="Smart Review card">
                        <div style={{ ...A.card, padding: "12px 14px", borderLeft: "4px solid #10b981" }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}><strong>Due for review</strong><b style={{ color: "#10b981" }}>12</b></div>
                            <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>Spaced repetition: scheduled for today</div>
                        </div>
                    </Spec>
                    <Spec code="CARD-A3" note="alerts">
                        <p role="alert" style={{ margin: 0, padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)", fontSize: "0.85rem" }}>Wrong email or password.</p>
                        <p style={{ margin: 0, padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.1)", fontSize: "0.85rem" }}>Password changed.</p>
                    </Spec>
                    <Spec code="CARD-A4" note="badges"><div className={s.row}><span style={{ fontSize: "0.7rem", borderRadius: 4, padding: "2px 6px", background: "rgba(59,130,246,0.15)" }}>admin</span><span style={{ fontSize: "0.65rem", color: "#10b981", border: "1px solid #10b981", padding: "1px 6px", borderRadius: 3 }}>✓ SAVED TO HISTORY</span><span style={{ fontSize: "0.7rem", fontWeight: 700, color: "white", background: "#ef4444", borderRadius: 999, padding: "1px 7px" }}>3</span></div></Spec>
                    <Spec code="CARD-A5" note="progress"><div><div style={{ fontSize: "0.95rem" }}><b>12</b> of 20 questions</div><div style={{ height: 8, borderRadius: 4, background: "rgba(128,128,128,0.2)", marginTop: 6 }}><div style={{ width: "60%", height: "100%", borderRadius: 4, background: "#2a78d6" }} /></div></div></Spec>
                </>}
                b={<>
                    <Spec code="CARD-B1"><div className={s.gCard}><p className={s.gLabel}>Average</p><div className={s.gStat}>64%</div></div></Spec>
                    <Spec code="CARD-B2">
                        <div className={s.gCard}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong>Due for review</strong><span className={s.gBadge} style={{ color: "#30d158" }}>12</span></div>
                            <p className={s.gMuted} style={{ marginTop: 4 }}>Spaced repetition: scheduled for today</p>
                        </div>
                    </Spec>
                    <Spec code="CARD-B3">
                        <div className={s.gCard} style={{ padding: "10px 14px", fontSize: "0.85rem", borderColor: "rgba(255,69,58,0.6)" }}>Wrong email or password.</div>
                        <div className={s.gCard} style={{ padding: "10px 14px", fontSize: "0.85rem", borderColor: "rgba(48,209,88,0.6)" }}>Password changed.</div>
                    </Spec>
                    <Spec code="CARD-B4"><div className={s.row}><span className={s.gBadge}>Admin</span><span className={s.gBadge} style={{ color: "#30d158" }}>Saved</span><span className={s.gBadge} style={{ background: "#ff453a", color: "#fff", borderColor: "transparent" }}>3</span></div></Spec>
                    <Spec code="CARD-B5"><div><p className={s.gBody}><b>12</b> of 20 questions</p><div className={s.gTrack} style={{ marginTop: 6 }}><div className={s.gFill} style={{ width: "60%" }} /></div></div></Spec>
                </>}
                c={<>
                    <Spec code="CARD-C1"><div className={s.mCard}><p className={s.mLabel}>Average</p><div className={s.mStat} style={{ marginTop: 6 }}>64%</div></div></Spec>
                    <Spec code="CARD-C2">
                        <div className={s.mCard}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span className={s.mH2} style={{ fontSize: "0.8rem" }}>Due for review</span><span className={s.mStat} style={{ fontSize: "1.6rem" }}>12</span></div>
                            <p className={s.mMuted} style={{ marginTop: 6 }}>Spaced repetition: scheduled for today</p>
                        </div>
                    </Spec>
                    <Spec code="CARD-C3">
                        <div className={s.mCard} style={{ padding: "10px 14px", borderLeft: "3px solid #e31937", fontSize: "0.85rem" }}>Wrong email or password.</div>
                        <div className={s.mCard} style={{ padding: "10px 14px", borderLeft: "3px solid #12a150", fontSize: "0.85rem" }}>Password changed.</div>
                    </Spec>
                    <Spec code="CARD-C4"><div className={s.row}><span className={s.mBadge}>Admin</span><span className={s.mBadge} style={{ color: "#12a150" }}>Saved</span><span className={s.mBadge} style={{ background: "#e31937", color: "#fff", borderColor: "#e31937" }}>3</span></div></Spec>
                    <Spec code="CARD-C5"><div><div style={{ display: "flex", justifyContent: "space-between" }}><span className={s.mLabel}>Today</span><span className={s.mLabel}>12 / 20</span></div><div className={s.mTrack} style={{ marginTop: 8 }}><div className={s.mFill} style={{ width: "60%" }} /></div></div></Spec>
                </>}
            />

            {/* ---------------- NAVIGATION ---------------- */}
            <Section id="nav" title="Navigation" blurb="The top bar and the admin tabs"
                a={<>
                    <Spec code="NAV-A1" note="navbar">
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", fontSize: "0.85rem" }}>
                            {["Quick Test", "Practice Exam", "History"].map((l, i) => (
                                <span key={l} style={{ padding: "6px 10px", borderRadius: 6, background: i === 0 ? "rgba(128,128,128,0.12)" : "transparent", fontWeight: i === 0 ? 600 : 400, opacity: i === 0 ? 1 : 0.65 }}>{l}</span>
                            ))}
                        </div>
                    </Spec>
                    <Spec code="NAV-A2" note="tabs">
                        <div style={{ display: "flex", borderBottom: "1px solid rgba(128,128,128,0.25)", fontSize: "0.85rem" }}>
                            <span style={{ padding: "8px 14px", opacity: 0.7 }}>Users</span>
                            <span style={{ padding: "8px 14px", borderBottom: "2px solid #3b82f6", fontWeight: 600 }}>Questions <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "white", background: "#ef4444", borderRadius: 999, padding: "1px 6px" }}>2</span></span>
                        </div>
                    </Spec>
                </>}
                b={<>
                    <Spec code="NAV-B1"><nav className={s.gNav}>{["Quick Test", "Practice Exam", "History"].map((l, i) => <a key={l} href="#nav" aria-current={i === 0 ? "page" : undefined}>{l}</a>)}</nav></Spec>
                    <Spec code="NAV-B2"><div className={s.gSegment} role="tablist"><button aria-pressed={false}>Users</button><button aria-pressed>Questions · 2</button></div></Spec>
                </>}
                c={<>
                    <Spec code="NAV-C1"><nav className={s.mNav}>{["Quick Test", "Practice Exam", "History"].map((l, i) => <a key={l} href="#nav" aria-current={i === 0 ? "page" : undefined}>{l}</a>)}</nav></Spec>
                    <Spec code="NAV-C2"><nav className={s.mNav} style={{ borderBottom: "none" }}><a href="#nav">Users</a><a href="#nav" aria-current="page">Questions (2)</a></nav></Spec>
                </>}
            />
        </main>
    );
}

// ---------- small pieces ----------

function Swatches({ items }: { items: [string, string][] }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {items.map(([c, name]) => (
                <div key={name} style={{ fontSize: "0.72rem" }}>
                    <div style={{ height: 34, borderRadius: 6, background: c, border: "1px solid rgba(128,128,128,0.3)" }} />
                    <div style={{ marginTop: 3 }}>{name}</div>
                    <div style={{ opacity: 0.55, fontFamily: "ui-monospace, monospace" }}>{c.startsWith("#") ? c : "translucent"}</div>
                </div>
            ))}
        </div>
    );
}

// Today's ReviewedOption look, copied (the real component is left untouched)
function MarkedA({ text, letter, state }: { text: string; letter: string; state: (typeof STATES)[number] }) {
    const picked = state === "wrong", correct = state === "missed";
    const tone = picked ? "#ef4444" : correct ? "#10b981" : null;
    return (
        <div style={{ padding: "10px 12px", borderRadius: 8, fontSize: "0.9rem", display: "flex", justifyContent: "space-between", gap: 12,
            border: tone ? `${picked ? "solid" : "dashed"} 1.5px ${tone}` : "1px solid rgba(128,128,128,0.2)", background: picked ? "rgba(239,68,68,0.10)" : "transparent" }}>
            <span><b style={{ opacity: 0.6, marginRight: 10 }}>{letter}.</b>{text}</span>
            {tone && <b style={{ fontSize: "0.72rem", color: tone }}>{picked ? "Your answer ✕" : "Correct answer"}</b>}
        </div>
    );
}

function QuizFooter({ tone }: { tone: "a" | "b" | "c" }) {
    const text = tone === "c" ? s.mLabel : undefined;
    const item: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, fontSize: tone === "c" ? undefined : "0.75rem", opacity: 0.75 };
    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center" }}>
            <span style={item} className={text}><Users size={13} /> Medium · 2 of 3 right first try</span>
            <span style={item} className={text}><Bookmark size={13} /> Bookmark</span>
            <span style={item} className={text}><NotebookPen size={13} /> Add a note</span>
            <span style={item} className={text}><Flag size={13} /> Report</span>
            <span style={item} className={text}><Timer size={13} /> 00:42</span>
            <span style={item} className={text}><Flame size={13} /> 5-day streak</span>
        </div>
    );
}
