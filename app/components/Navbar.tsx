// Navbar.tsx

import React from "react";
import Link from "next/link";
import Image from "next/image";

import Logo from "../../public/eye.svg";
import { ModeToggle } from "./ui/toggle-mode";

export default function Navbar() {
  return (
    <nav className="flex items-center justify-center">
        <Link href="/">
        <Image
          src={Logo}
          alt="logo"
          width={90}
          className="dark:invert"
        />
        </Link>
        <ModeToggle />
    </nav>
  );
}
