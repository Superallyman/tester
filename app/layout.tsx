// layout.tsx

import type { Metadata } from "next";
// import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

//components
import Navbar from "./components/Navbar";

import { ThemeProvider } from "@/components/ui/theme-provider";
// const geistSans = Geist({
//   variable: "--font-geist-sans",
//   subsets: ["latin"],
// });

// const geistMono = Geist_Mono({
//   variable: "--font-geist-mono",
//   subsets: ["latin"],
// });

export const metadata: Metadata = {
  title: "Custom Tester 1.0",
  description: "When you live hardcore, you are hardcore",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system">
          <Navbar />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
