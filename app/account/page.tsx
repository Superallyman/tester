"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/utils/api";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import SimpleRevealSwitch from "@/components/SimpleRevealSwitch";
import { useSimpleReveal } from "@/components/useSimpleReveal";
import { Label } from "@/components/ui/label";

interface AccountInfo {
    email: string;
    name: string;
    hasPassword: boolean;
    githubLogin: string | null;
}

export default function AccountPage() {
    const { data: session, update } = useSession();
    const mustChange = !!session?.user?.mustChangePassword;

    const [info, setInfo] = useState<AccountInfo | null>(null);
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [simpleReveal, setSimpleReveal] = useSimpleReveal();

    useEffect(() => { api<AccountInfo>("/api/account/password").then(setInfo).catch(console.error); }, []);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (next !== confirm) {
            setMessage({ ok: false, text: "The new passwords don't match." });
            return;
        }
        setBusy(true);
        setMessage(null);
        try {
            await api("/api/account/password", { body: { currentPassword: current, newPassword: next } });
            const hadPassword = info?.hasPassword;
            setInfo(i => i && { ...i, hasPassword: true });
            setCurrent(""); setNext(""); setConfirm("");
            // Re-reads the account into the session, which clears the forced redirect here
            await update();
            setMessage({ ok: true, text: hadPassword ? "Password changed." : `Password set. You can now sign in with ${info?.email} and this password.` });
            if (mustChange) window.location.assign("/");
        } catch (err) {
            setMessage({ ok: false, text: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-md px-4 py-12">
            <h1 className="orbit-title mb-6">Account</h1>

            {mustChange && (
                <p className="orbit-alert orbit-alert--warn mb-6">
                    You signed in with a temporary password. Choose your own to continue.
                </p>
            )}

            {info && (
                <dl className="mb-8 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="opacity-60">Name</dt><dd>{info.name}</dd>
                    <dt className="opacity-60">Email</dt><dd>{info.email}</dd>
                    <dt className="opacity-60">Sign in with</dt>
                    <dd>{[info.githubLogin && `GitHub (${info.githubLogin})`, info.hasPassword && "Email + password"].filter(Boolean).join(", ") || "—"}</dd>
                </dl>
            )}

            <h2 className="mb-1 text-lg font-semibold">{info?.hasPassword ? "Change password" : "Add a password"}</h2>
            {info && !info.hasPassword && (
                <p className="mb-4 text-sm opacity-70">Then you can sign in with your email instead of GitHub. Your history stays the same either way.</p>
            )}

            <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
                {info?.hasPassword && (
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="current">{mustChange ? "Temporary password" : "Current password"}</Label>
                        <PasswordInput id="current" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} />
                    </div>
                )}
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new">New password</Label>
                    <PasswordInput id="new" autoComplete="new-password" required minLength={10} value={next} onChange={e => setNext(e.target.value)} />
                    <span className="text-xs opacity-60">At least 10 characters.</span>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="confirm">Confirm new password</Label>
                    <PasswordInput id="confirm" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} />
                </div>
                {message && (
                    <p role="status" className={`orbit-alert ${message.ok ? "orbit-alert--good" : "orbit-alert--bad"}`}>{message.text}</p>
                )}
                <Button type="submit" disabled={busy || !info}>{busy ? "Saving…" : "Save password"}</Button>
            </form>

            {!mustChange && (
                <section className="mt-10">
                    <h2 className="mb-3 text-lg font-semibold">Display</h2>
                    <SimpleRevealSwitch on={simpleReveal} onChange={setSimpleReveal} />
                    <p className="mt-2 text-sm opacity-70">
                        After submitting a Quick Test, show a plain check, cross or dash beside each answer instead of coloured
                        answers, so you can screenshot a question and cover the marks to study it.
                    </p>
                </section>
            )}
        </div>
    );
}
