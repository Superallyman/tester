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
            <nav aria-label="Admin" className="orbit-nav" style={{ gap: 22 }}>
                {TABS.map(t => {
                    const active = pathname.startsWith(t.href);
                    return (
                        <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
                            className="inline-flex items-center">
                            {t.label}
                            {t.href === "/admin/questions" && openReports > 0 && (
                                <span className="orbit-badge orbit-badge--bad ml-2">{openReports}</span>
                            )}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
