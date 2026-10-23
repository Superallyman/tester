// Navbar.tsx

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
  { href: "/data", label: "Performance Analytics" },
  { href: "/history", label: "History" },
  { href: "/leaderboard", label: "Leaderboard" },
];

function AuthButton() {
  const { data: session } = useSession(); // go and get the session

  if (session) {
    return (
      <div className="flex flex-col items-start md:items-end text-sm leading-tight">
        <Link href="/account" className="font-medium hover:underline">{session?.user?.name}</Link>
        <span className="flex gap-3">
          {session.user?.isAdmin && <Link href="/admin/users" className="opacity-70 hover:opacity-100 hover:underline">Users</Link>}
          <button onClick={() => signOut({ callbackUrl: "/signin" })} className="opacity-70 hover:opacity-100 hover:underline">Sign out</button>
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start md:items-end text-sm leading-tight">
      <span className="opacity-70">Not signed in</span>
      <button onClick={() => signIn()} className="font-medium text-blue-500 hover:underline">Sign in</button>
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
    <Link
      key={link.href}
      href={link.href}
      aria-current={isActive(link.href) ? "page" : undefined}
      className={`rounded-md px-3 py-2 text-sm transition-colors ${
        isActive(link.href)
          ? "bg-black/5 dark:bg-white/10 font-semibold"
          : "text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
      }`}
    >
      {link.label}
    </Link>
  ));

  return (
    <nav className="w-full border-b-2 border-gray-200 dark:border-white/10">
      <div className="flex items-center justify-between gap-4 px-4 md:px-6 py-3">
        <Link href="/" className="shrink-0">
          <Image
            src={Logo}
            alt="logo"
            width={72}
            className="dark:invert"
          />
        </Link>

        <div className="hidden md:flex items-center gap-1">{links}</div>

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
            className="rounded-md border border-black/15 dark:border-white/15 p-2"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden flex flex-col gap-1 px-4 pb-4">
          {links}
          <div className="mt-2 border-t border-black/10 dark:border-white/10 pt-3 px-3">
            <AuthButton />
          </div>
        </div>
      )}
    </nav>
  );
}
