"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/utils/api";

const TABS = [
    { href: "/admin/users", label: "Users" },
    { href: "/admin/questions", label: "Questions" },
];

export default function AdminNav() {
    const pathname = usePathname();
    const [openReports, setOpenReports] = useState(0);

    // Re-checked on every admin page change, so resolving reports updates the badge
    useEffect(() => {
        api<{ open: number }>("/api/admin/reports").then(r => setOpenReports(r.open)).catch(() => {});
    }, [pathname]);

    return (
        <div className="mx-auto w-full max-w-4xl px-4 pt-6">
            <nav aria-label="Admin" className="flex gap-1 border-b border-black/10 dark:border-white/15">
                {TABS.map(t => {
                    const active = pathname.startsWith(t.href);
                    return (
                        <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
                            className={`-mb-px border-b-2 px-4 py-2 text-sm ${active ? "border-blue-500 font-semibold" : "border-transparent opacity-70 hover:opacity-100"}`}>
                            {t.label}
                            {t.href === "/admin/questions" && openReports > 0 && (
                                <span className="ml-2 rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">{openReports}</span>
                            )}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
