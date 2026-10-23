"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, qs } from "@/utils/api";
import { smartClean } from "@/utils/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Row {
    id: string;
    category: string;
    question_text: string;
    updated_at: string | null;
    open_reports: number;
    latest_report: string | null;
}

interface ListResponse {
    rows: Row[];
    total: number;
    pageSize: number;
    openReports: number;
    categories: { category: string; n: number }[];
}

const card = "rounded-xl border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04]";

export default function AdminQuestionsPage() {
    const [view, setView] = useState<"reported" | "all">("reported");
    const [search, setSearch] = useState("");
    const [appliedSearch, setAppliedSearch] = useState("");
    const [category, setCategory] = useState("");
    const [offset, setOffset] = useState(0);
    const [data, setData] = useState<ListResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setError(null);
        api<ListResponse>(`/api/admin/questions${qs({ reported: view === "reported" ? "1" : undefined, q: appliedSearch, category, offset })}`)
            .then(d => {
                setData(d);
                // Nothing reported: show the bank instead of an empty queue on first visit
                if (view === "reported" && d.openReports === 0 && !appliedSearch && !category && offset === 0) setView("all");
            })
            .catch(e => setError(e.message));
    }, [view, appliedSearch, category, offset]);

    useEffect(() => { load(); }, [load]);

    const pages = data ? Math.ceil(data.total / data.pageSize) : 0;
    const page = data ? Math.floor(offset / data.pageSize) + 1 : 1;

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-bold">Questions</h1>
                <Button asChild><Link href="/admin/questions/new">New question</Link></Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {(["reported", "all"] as const).map(v => (
                    <button key={v} aria-pressed={view === v} onClick={() => { setView(v); setOffset(0); }}
                        className={`rounded-full px-3 py-1.5 text-sm border ${view === v ? "bg-blue-600 text-white border-blue-600" : "border-black/15 dark:border-white/20"}`}>
                        {v === "reported" ? `Reported${data ? ` (${data.openReports})` : ""}` : "All questions"}
                    </button>
                ))}
                <form className="flex flex-1 min-w-[220px] gap-2" onSubmit={e => { e.preventDefault(); setAppliedSearch(search.trim()); setOffset(0); }}>
                    <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search text, options or an id" aria-label="Search questions" />
                    <Button type="submit" variant="outline">Search</Button>
                </form>
                <select value={category} onChange={e => { setCategory(e.target.value); setOffset(0); }} aria-label="Category"
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-black">
                    <option value="">All categories</option>
                    {data?.categories.map(c => <option key={c.category} value={c.category}>{c.category} ({c.n})</option>)}
                </select>
            </div>

            {error && <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">{error}</p>}

            {data && (
                <p className="text-sm opacity-70">
                    {data.total} question{data.total === 1 ? "" : "s"}
                    {view === "reported" ? " with open reports" : ""}{appliedSearch ? ` matching “${appliedSearch}”` : ""}
                </p>
            )}

            <div className="flex flex-col gap-2">
                {data?.rows.map(r => (
                    <Link key={r.id} href={`/admin/questions/${r.id}`} className={`${card} block p-3 hover:border-blue-500/60`}>
                        <div className="flex items-start justify-between gap-3">
                            <p className="text-sm line-clamp-2">{smartClean(r.question_text)}</p>
                            {r.open_reports > 0 && (
                                <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                                    {r.open_reports} report{r.open_reports === 1 ? "" : "s"}
                                </span>
                            )}
                        </div>
                        <p className="mt-1 text-xs opacity-60">
                            {r.category}{r.updated_at ? ` · edited ${new Date(r.updated_at).toLocaleDateString()}` : ""}
                        </p>
                    </Link>
                ))}
                {data && data.rows.length === 0 && (
                    <p className={`${card} p-6 text-center text-sm opacity-70`}>
                        {view === "reported" ? "No open reports. Nice." : "No questions match."}
                    </p>
                )}
            </div>

            {pages > 1 && (
                <div className="flex items-center justify-center gap-3 text-sm">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setOffset(o => Math.max(0, o - data!.pageSize))}>Previous</Button>
                    <span>Page {page} of {pages}</span>
                    <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setOffset(o => o + data!.pageSize)}>Next</Button>
                </div>
            )}
        </div>
    );
}
