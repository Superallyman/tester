"use client";

// Edit one question (or, at /admin/questions/new, write one), see its reports and undo earlier edits.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/utils/api";
import { smartClean } from "@/utils/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface QuestionFields {
    category: string;
    question_text: string;
    options: string[];
    correct_answers: string[];
    explanation: string;
}

interface Report {
    id: string;
    reason: string;
    comment: string | null;
    status: "open" | "resolved" | "dismissed";
    created_at: string;
    reporter: string;
    resolved_by: string | null;
}

interface Edit {
    id: string;
    before: QuestionFields | null;
    after: QuestionFields;
    edited_at: string;
    editor: string;
}

interface Detail {
    question: QuestionFields & { id: string };
    reports: Report[];
    edits: Edit[];
    stats: { attempts: number; correct: number };
}

const REASON_LABELS: Record<string, string> = {
    wrong_answer: "Answer key is wrong",
    unclear: "Question is unclear",
    typo: "Typo or formatting",
    outdated: "Out of date",
    other: "Something else",
};

const LETTERS = "ABCDEFGHIJKLMNOP";
const card = "rounded-xl border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04] p-4";
const textarea = "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

interface Draft {
    category: string;
    question_text: string;
    options: { text: string; correct: boolean }[];
    explanation: string;
}

const blankDraft = (): Draft => ({ category: "", question_text: "", options: [0, 1, 2, 3].map(() => ({ text: "", correct: false })), explanation: "" });

// Stored text can hold HTML entities from the original import; edit it the way it's shown
const toDraft = (q: QuestionFields): Draft => {
    const correct = q.correct_answers.map(smartClean);
    return {
        category: q.category,
        question_text: smartClean(q.question_text),
        options: q.options.map(o => ({ text: smartClean(o), correct: correct.includes(smartClean(o)) })),
        explanation: smartClean(q.explanation || ""),
    };
};

const fromDraft = (d: Draft): QuestionFields => ({
    category: d.category,
    question_text: d.question_text,
    options: d.options.map(o => o.text),
    correct_answers: d.options.filter(o => o.correct).map(o => o.text),
    explanation: d.explanation,
});

/** Which fields an edit changed, for the history list */
const changedFields = (e: Edit) => {
    if (!e.before) return "created the question";
    const names: [keyof QuestionFields, string][] = [
        ["question_text", "question"], ["options", "options"], ["correct_answers", "answer key"], ["explanation", "explanation"], ["category", "category"],
    ];
    const changed = names.filter(([k]) => JSON.stringify(e.before![k]) !== JSON.stringify(e.after[k])).map(([, n]) => n);
    return changed.length ? `changed ${changed.join(", ")}` : "saved without changes";
};

export default function QuestionEditorPage() {
    const { id } = useParams<{ id: string }>();
    const isNew = id === "new";
    const router = useRouter();
    const [detail, setDetail] = useState<Detail | null>(null);
    const [draft, setDraft] = useState<Draft>(blankDraft);
    const [categories, setCategories] = useState<string[]>([]);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (isNew) return;
        try {
            const d = await api<Detail>(`/api/admin/questions/${id}`);
            setDetail(d);
            setDraft(toDraft(d.question));
        } catch (e) {
            setMessage({ ok: false, text: (e as Error).message });
        }
    }, [id, isNew]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        api<{ categories: { category: string }[] }>("/api/admin/questions?offset=0")
            .then(d => setCategories(d.categories.map(c => c.category))).catch(() => {});
    }, []);

    const openReports = detail?.reports.filter(r => r.status === "open").length ?? 0;
    const original = useMemo(() => (detail ? toDraft(detail.question) : null), [detail]);
    const dirty = isNew || !original || JSON.stringify(original) !== JSON.stringify(draft);
    // Past answers are stored as option text, so rewording an option detaches them from it
    const rewordedOptions = !!original && original.options.some(o => !draft.options.some(d => d.text.trim() === o.text.trim()));

    const setOption = (i: number, patch: Partial<Draft["options"][number]>) =>
        setDraft(d => ({ ...d, options: d.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));

    const save = async (resolveReports: boolean) => {
        setSaving(true);
        setMessage(null);
        try {
            if (isNew) {
                const { id: newId } = await api<{ id: string }>("/api/admin/questions", { body: fromDraft(draft) });
                router.replace(`/admin/questions/${newId}`);
                return;
            }
            const res = await api<{ resolved: number }>(`/api/admin/questions/${id}`, { method: "PUT", body: { ...fromDraft(draft), resolveReports } });
            await load();
            setMessage({ ok: true, text: `Saved.${res.resolved ? ` ${res.resolved} report${res.resolved === 1 ? "" : "s"} marked resolved.` : ""}` });
        } catch (e) {
            setMessage({ ok: false, text: (e as Error).message });
        } finally {
            setSaving(false);
        }
    };

    const setReport = async (reportId: string, status: Report["status"]) => {
        try {
            await api(`/api/admin/reports/${reportId}`, { method: "PATCH", body: { status } });
            await load();
        } catch (e) {
            setMessage({ ok: false, text: (e as Error).message });
        }
    };

    const undo = async (edit: Edit) => {
        if (!confirm(`Put this question back the way it was before the edit by ${edit.editor} on ${new Date(edit.edited_at).toLocaleString()}?`)) return;
        try {
            await api(`/api/admin/questions/${id}/revert`, { body: { editId: edit.id } });
            await load();
            setMessage({ ok: true, text: "Edit undone." });
        } catch (e) {
            setMessage({ ok: false, text: (e as Error).message });
        }
    };

    if (!isNew && !detail && !message) return <p className="mx-auto max-w-4xl px-4 py-6 opacity-60">Loading…</p>;

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-6 flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href="/admin/questions" className="text-sm text-blue-500 hover:underline">← All questions</Link>
                {detail && (
                    <span className="text-sm opacity-70">
                        {detail.stats.attempts
                            ? `Answered ${detail.stats.attempts} time${detail.stats.attempts === 1 ? "" : "s"}, ${Math.round((detail.stats.correct / detail.stats.attempts) * 100)}% correct`
                            : "Not answered yet"}
                    </span>
                )}
            </div>
            <h1 className="text-2xl font-bold">{isNew ? "New question" : "Edit question"}</h1>

            {detail && openReports > 0 && (
                <section className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
                    <h2 className="mb-2 font-semibold">{openReports} open report{openReports === 1 ? "" : "s"}</h2>
                    <ReportList reports={detail.reports.filter(r => r.status === "open")} onSet={setReport} />
                </section>
            )}

            <section className={`${card} flex flex-col gap-4`}>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="category">Category</Label>
                    <Input id="category" list="category-list" value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))} />
                    <datalist id="category-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="question">Question</Label>
                    <textarea id="question" rows={4} className={textarea} value={draft.question_text}
                        onChange={e => setDraft(d => ({ ...d, question_text: e.target.value }))} />
                </div>
                <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm font-medium">Options <span className="font-normal opacity-60">· tick every correct one</span></legend>
                    {draft.options.map((o, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <span className="w-5 text-sm font-semibold opacity-60">{LETTERS[i]}.</span>
                            <Input value={o.text} onChange={e => setOption(i, { text: e.target.value })} aria-label={`Option ${LETTERS[i]}`} />
                            <label className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm ${o.correct ? "bg-green-500/15 text-green-700 dark:text-green-400" : ""}`}>
                                <input type="checkbox" checked={o.correct} onChange={e => setOption(i, { correct: e.target.checked })} />
                                Correct
                            </label>
                            <button type="button" aria-label={`Remove option ${LETTERS[i]}`} disabled={draft.options.length <= 2}
                                onClick={() => setDraft(d => ({ ...d, options: d.options.filter((_, j) => j !== i) }))}
                                className="px-1 opacity-50 hover:opacity-100 disabled:opacity-20">✕</button>
                        </div>
                    ))}
                    <div>
                        <Button type="button" variant="outline" size="sm" disabled={draft.options.length >= 16}
                            onClick={() => setDraft(d => ({ ...d, options: [...d.options, { text: "", correct: false }] }))}>
                            Add option
                        </Button>
                    </div>
                    {rewordedOptions && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            You reworded or removed an option. Past answers that picked the old wording keep it, so History shows them as they were.
                        </p>
                    )}
                </fieldset>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="explanation">Explanation</Label>
                    <textarea id="explanation" rows={5} className={textarea} value={draft.explanation}
                        onChange={e => setDraft(d => ({ ...d, explanation: e.target.value }))} />
                </div>

                {message && (
                    <p role="status" className={`rounded-md border px-3 py-2 text-sm ${message.ok ? "border-green-500/40 bg-green-500/10" : "border-red-500/40 bg-red-500/10"}`}>{message.text}</p>
                )}

                <div className="flex flex-wrap justify-end gap-2">
                    {!isNew && dirty && <Button variant="ghost" onClick={() => original && setDraft(original)}>Discard changes</Button>}
                    {openReports > 0 && (
                        <Button variant="outline" disabled={saving || !dirty} onClick={() => save(true)}>
                            Save and resolve {openReports} report{openReports === 1 ? "" : "s"}
                        </Button>
                    )}
                    <Button disabled={saving || !dirty} onClick={() => save(false)}>{saving ? "Saving…" : isNew ? "Add question" : "Save"}</Button>
                </div>
            </section>

            {detail && detail.reports.some(r => r.status !== "open") && (
                <details className={card}>
                    <summary className="cursor-pointer text-sm font-semibold">Closed reports ({detail.reports.filter(r => r.status !== "open").length})</summary>
                    <div className="mt-3"><ReportList reports={detail.reports.filter(r => r.status !== "open")} onSet={setReport} /></div>
                </details>
            )}

            {detail && detail.edits.length > 0 && (
                <section className={card}>
                    <h2 className="mb-2 text-sm font-semibold">Edit history</h2>
                    <ul className="flex flex-col gap-2 text-sm">
                        {detail.edits.map((e, i) => (
                            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2">
                                <span><strong>{e.editor}</strong> {changedFields(e)} <span className="opacity-60">· {new Date(e.edited_at).toLocaleString()}</span></span>
                                {e.before && i === 0 && <Button variant="outline" size="sm" onClick={() => undo(e)}>Undo</Button>}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

function ReportList({ reports, onSet }: { reports: Report[]; onSet: (id: string, status: Report["status"]) => void }) {
    return (
        <ul className="flex flex-col gap-3">
            {reports.map(r => (
                <li key={r.id} className="flex flex-col gap-1 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                            <strong>{REASON_LABELS[r.reason] ?? r.reason}</strong>
                            <span className="opacity-60"> · {r.reporter} · {new Date(r.created_at).toLocaleDateString()}</span>
                            {r.status !== "open" && <span className="opacity-60"> · {r.status}{r.resolved_by ? ` by ${r.resolved_by}` : ""}</span>}
                        </span>
                        <span className="flex gap-2">
                            {r.status === "open" ? (
                                <>
                                    <Button variant="outline" size="sm" onClick={() => onSet(r.id, "resolved")}>Resolved</Button>
                                    <Button variant="ghost" size="sm" onClick={() => onSet(r.id, "dismissed")}>Dismiss</Button>
                                </>
                            ) : (
                                <Button variant="ghost" size="sm" onClick={() => onSet(r.id, "open")}>Reopen</Button>
                            )}
                        </span>
                    </div>
                    {r.comment && <p className="whitespace-pre-wrap rounded-md bg-black/5 px-3 py-2 dark:bg-white/5">{r.comment}</p>}
                </li>
            ))}
        </ul>
    );
}
