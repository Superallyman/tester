"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { useEffect, useState } from "react"

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const [mounted, setMounted] = useState(false)

  // Prevents SSR mismatch by ensuring theme is set only on the client
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <>{children}</>  // Render nothing until the client has mounted
  }

  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
