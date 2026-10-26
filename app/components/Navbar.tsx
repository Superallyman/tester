// Navbar.tsx — the frosted top bar (Orbit kit classes)

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import Logo from "../../public/eye.svg";
import { ModeToggle } from "./ui/toggle-mode";

//auth stuff
import { signIn, signOut, useSession } from "next-auth/react";

const LINKS = [
  { href: "/", label: "Quick Test" },
  { href: "/exam", label: "Practice Exam" },
  { href: "/data", label: "Analytics" },
  { href: "/history", label: "History" },
  { href: "/leaderboard", label: "Leaderboard" },
];

const small: React.CSSProperties = { fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", textDecoration: "none", color: "inherit" };

function AuthButton() {
  const { data: session } = useSession(); // go and get the session

  if (session) {
    return (
      <div className="flex flex-col items-start md:items-end gap-1 leading-tight">
        <Link href="/account" className="hover:underline" style={{ fontSize: "0.85rem", fontWeight: 500, color: "inherit", textDecoration: "none" }}>{session?.user?.name}</Link>
        <span className="flex gap-3">
          {session.user?.isAdmin && <Link href="/admin/questions" style={{ ...small, opacity: 0.6 }} className="hover:!opacity-100">Admin</Link>}
          <button onClick={() => signOut({ callbackUrl: "/signin" })} style={{ ...small, opacity: 0.6, background: "none", border: "none", padding: 0, cursor: "pointer" }} className="hover:!opacity-100">Sign out</button>
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start md:items-end gap-1 leading-tight">
      <span className="orbit-muted">Not signed in</span>
      <button onClick={() => signIn()} className="orbit-btn orbit-btn--ghost">Sign in</button>
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile menu after navigating
  useEffect(() => { setOpen(false); }, [pathname]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const { data: session } = useSession();
  const visibleLinks = LINKS.filter(link => link.href !== "/leaderboard" || session?.user?.canSeeLeaderboard !== false);

  const links = visibleLinks.map(link => (
    <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? "page" : undefined}>
      {link.label}
    </Link>
  ));

  return (
    <nav className="orbit-glass sticky top-0 z-40 w-full" style={{ borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 md:px-6 py-3">
        {/* Always lands on a fresh Quick Test: from another page a normal navigation does that, but on / itself
            (where a quiz may be open) only a reload clears it */}
        <Link href="/" aria-label="Tester: start a new Quick Test" className="shrink-0 flex items-center gap-3" style={{ color: "inherit", textDecoration: "none" }}
          onClick={e => { if (pathname === "/") { e.preventDefault(); window.location.assign("/"); } }}>
          <Image src={Logo} alt="" width={40} className="dark:invert" />
          <span style={{ fontSize: "0.9rem", fontWeight: 500, letterSpacing: "0.26em", textTransform: "uppercase" }}>Tester</span>
        </Link>

        {/* The wrapper does the hiding: .orbit-nav sets its own display, which would beat Tailwind's "hidden" */}
        <div className="hidden md:block"><div className="orbit-nav orbit-nav--bare" style={{ gap: 22 }}>{links}</div></div>

        <div className="hidden md:flex items-center gap-4">
          <AuthButton />
          <ModeToggle />
        </div>

        <div className="flex md:hidden items-center gap-2">
          <ModeToggle />
          <button
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="orbit-btn orbit-btn--icon"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden px-4 pb-4">
          <div className="orbit-nav orbit-nav--bare flex-col !items-start" style={{ gap: 14 }}>{links}</div>
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--orbit-track)" }}>
            <AuthButton />
          </div>
        </div>
      )}
    </nav>
  );
}
