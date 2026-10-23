"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/utils/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface User {
    id: string;
    email: string;
    name: string;
    github_login: string | null;
    has_password: boolean;
    is_admin: boolean;
    disabled: boolean;
    must_change_password: boolean;
    last_login_at: string | null;
    attempts: number;
}

interface Orphan {
    email: string;
    attempts: number;
}

// Shown once after creating an account or resetting a password; the server keeps only the hash
interface Issued {
    email: string;
    tempPassword: string;
}

const card = "rounded-xl border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04] p-4";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function AdminUsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [orphans, setOrphans] = useState<Orphan[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [issued, setIssued] = useState<Issued | null>(null);
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");

    const load = useCallback(() => api<{ users: User[]; orphans: Orphan[] }>("/api/admin/users")
        .then(d => { setUsers(d.users); setOrphans(d.orphans); })
        .catch(e => setError(e.message)), []);

    useEffect(() => { load(); }, [load]);

    const run = async (fn: () => Promise<Issued | unknown>) => {
        setError(null);
        try {
            const res = await fn();
            if (res && typeof res === "object" && "tempPassword" in res) setIssued(res as Issued);
            await load();
        } catch (e) {
            setError((e as Error).message);
        }
    };

    const create = (e: React.FormEvent) => {
        e.preventDefault();
        run(async () => {
            const res = await api<Issued>("/api/admin/users", { body: { email, name } });
            setEmail(""); setName("");
            return res;
        });
    };

    const act = (u: User, action: string) => {
        if (action === "reset-password" && !confirm(`Give ${u.email} a new temporary password? Their current password stops working.`)) return;
        run(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", body: { action } }));
    };

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-8 flex flex-col gap-6">
            <h1 className="text-2xl font-bold">Users</h1>

            {error && <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">{error}</p>}

            {issued && (
                <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 text-sm">
                    <p className="mb-2">Send these to <strong>{issued.email}</strong>. The password is shown only once, and they choose their own at first sign-in.</p>
                    <p className="font-mono text-base">Email: {issued.email}<br />Temporary password: <span className="select-all">{issued.tempPassword}</span></p>
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => setIssued(null)}>Done</Button>
                </div>
            )}

            <form onSubmit={create} className={`${card} grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end`}>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-email">Email</Label>
                    <Input id="new-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-name">Name</Label>
                    <Input id="new-name" value={name} onChange={e => setName(e.target.value)} placeholder="Shown on the leaderboard" />
                </div>
                <Button type="submit">Invite</Button>
                <p className="text-xs opacity-60 sm:col-span-3">
                    Use the email someone already signs in to GitHub with, and both sign-in methods share one account and history.
                </p>
            </form>

            <div className="flex flex-col gap-3">
                {users.map(u => (
                    <div key={u.id} className={`${card} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${u.disabled ? "opacity-60" : ""}`}>
                        <div className="min-w-0">
                            <p className="font-semibold">
                                {u.name}
                                {u.is_admin && <span className="ml-2 rounded bg-blue-500/15 px-1.5 py-0.5 text-xs font-medium">admin</span>}
                                {u.disabled && <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-xs font-medium">disabled</span>}
                            </p>
                            <p className="truncate text-sm opacity-80">{u.email}</p>
                            <p className="text-xs opacity-60">
                                {[u.github_login && `GitHub: ${u.github_login}`, u.has_password && (u.must_change_password ? "Temporary password" : "Password")]
                                    .filter(Boolean).join(" · ") || "Links to GitHub at next sign-in"}
                                {" · "}{u.attempts} attempts{u.last_login_at && ` · last sign-in ${fmtDate(u.last_login_at)}`}
                            </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                            <Button variant="outline" size="sm" onClick={() => act(u, "reset-password")}>
                                {u.has_password ? "Reset password" : "Add password"}
                            </Button>
                            {!u.is_admin && (
                                <Button variant="outline" size="sm" onClick={() => act(u, u.disabled ? "enable" : "disable")}>
                                    {u.disabled ? "Enable" : "Disable"}
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {orphans.length > 0 && (
                <div className={card}>
                    <h2 className="mb-1 font-semibold">History without an account</h2>
                    <p className="mb-3 text-sm opacity-70">Invite one of these emails and its past attempts carry over.</p>
                    <ul className="flex flex-col gap-1 text-sm">
                        {orphans.map(o => (
                            <li key={o.email} className="flex items-center justify-between gap-3">
                                <span className="truncate">{o.email} <span className="opacity-60">({o.attempts} attempts)</span></span>
                                <Button variant="ghost" size="sm" onClick={() => setEmail(o.email)}>Use</Button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
