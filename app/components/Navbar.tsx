import React from "react";
import Link from "next/link";
import Image from "next/image";

import Logo from "../../public/eye.svg";


export default function Navbar() {
  return (
      <nav>
        <h1>Custom Tester</h1>
        <Image 
        src={Logo}
        alt='logo'
        width={50}
        />
        <Link href="/">Dashboard</Link>
        <Link href="/api/questions">Questions API</Link>
      </nav>
  );
}
