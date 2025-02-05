// Navbar.tsx

"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";

import Logo from "../../public/eye.svg";
import { ModeToggle } from "./ui/toggle-mode";

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
      <AuthButton />
      <ModeToggle />
    </nav>
  );
}
