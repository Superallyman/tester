"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { Input } from "./input"

// A password field with a show / hide button inside its right edge
const PasswordInput = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<"input">, "type">>(
  ({ style, ...props }, ref) => {
    const [shown, setShown] = React.useState(false)
    return (
      <div style={{ position: "relative" }}>
        <Input ref={ref} type={shown ? "text" : "password"} style={{ ...style, paddingRight: 44 }} {...props} />
        <button type="button" onClick={() => setShown(s => !s)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}
          style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", display: "flex", padding: 6, background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer" }}
          className="hover:!opacity-100">
          {shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    )
  }
)
PasswordInput.displayName = "PasswordInput"

export { PasswordInput }
