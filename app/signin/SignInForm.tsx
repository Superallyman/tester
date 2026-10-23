"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInForm({ callbackUrl, initialError }: { callbackUrl: string; initialError: string | null }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(initialError);
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await signIn("credentials", { email, password, redirect: false });
        if (res?.ok) {
            // A full load, so the server-rendered session in the layout picks up the new sign-in
            window.location.assign(callbackUrl);
            return;
        }
        setBusy(false);
        setError(res?.error && res.error !== "CredentialsSignin" ? res.error : "Wrong email or password.");
    };

    return (
        <div className="flex flex-col gap-6">
            {error && (
                <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">{error}</p>
            )}

            <Button variant="outline" size="lg" onClick={() => signIn("github", { callbackUrl })}>
                Continue with GitHub
            </Button>

            <div className="flex items-center gap-3 text-xs uppercase opacity-60">
                <span className="h-px flex-1 bg-current opacity-30" />or<span className="h-px flex-1 bg-current opacity-30" />
            </div>

            <form onSubmit={submit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                <Button type="submit" size="lg" disabled={busy}>{busy ? "Signing in…" : "Sign in with email"}</Button>
            </form>

            <p className="text-sm opacity-70">No account? Accounts are invite only; ask the admin for one. Forgot your password? The admin can reset it.</p>
        </div>
    );
}
