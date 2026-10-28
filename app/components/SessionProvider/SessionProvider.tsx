"use client";
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { ComponentProps } from "react";

// Re-reads the session every 5 minutes (and when the tab regains focus, the default), and the server re-reads
// the account each time, so admin changes like leaderboard access reach people without signing in again
export default function SessionProvider(props: ComponentProps<typeof NextAuthSessionProvider>) {
    return <NextAuthSessionProvider refetchInterval={5 * 60} {...props} />;
}
