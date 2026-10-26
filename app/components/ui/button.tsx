import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Variants map onto the Orbit kit's buttons (app/design/orbit/orbit.css)
const buttonVariants = cva(
  "orbit-btn [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "orbit-btn--primary",
        destructive: "orbit-btn--danger",
        outline: "",
        secondary: "",
        ghost: "orbit-btn--ghost",
        link: "orbit-btn--ghost",
      },
      size: {
        default: "",
        sm: "!px-3 !py-1.5",
        lg: "!px-7 !py-3",
        icon: "orbit-btn--icon",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
