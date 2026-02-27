// Navbar.tsx

"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";

import Logo from "../../public/eye.svg";
import { ModeToggle } from "./ui/toggle-mode";

import { usePathname } from "next/navigation";


//auth stuff
import { signIn, signOut, useSession } from "next-auth/react";

function AuthButton() {
  const { data: session } = useSession(); // go and get the session

  if (session) {
    return (
      <>
        {session?.user?.name} <br />
        <button onClick={() => signOut()}>Sign out</button>
      </>
    );
  }
  return (
    <>
      Not signed in <br />
      <button onClick={() => signIn()}>Sign in</button>
    </>
  );
}

export default function Navbar() {

  return (
    <nav className="flex items-center justify-between w-full px-6 py-4">
      <Link href="/">
        <Image
          src={Logo}
          alt="logo"
          width={90}
          className="dark:invert"
        />
      </Link>
      {/* Hide Quick Test when on "/"
      {pathname !== "/" && (
        <Link href="/">
          <p>Quick Test</p>
        </Link>
      )}

      {/* Hide Quick Test when on "/" */}
        <Link href="/">
          <p>Quick Test</p>
        </Link>

        <Link href="/data">
          <p>Performance Analytics</p>
        </Link>

        <Link href="/history">
          <p>History</p>
        </Link>



      <AuthButton />
      <ModeToggle />
    </nav>
  );
}
