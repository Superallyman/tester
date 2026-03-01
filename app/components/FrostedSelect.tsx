import React, { useState, useRef, useEffect } from "react";

type Option<T> = {
    label: string;
    value: T;
  };
  
  type FrostedSelectProps<T> = {
    label: string;
    value: T;
    options: Option<T>[];
    onChange: (value: T) => void;
  };
  
  export function FrostedSelect<T extends string | number>({
    label,
    value,
    options,
    onChange
  }: FrostedSelectProps<T>) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
  
    // Close when clicking outside
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
  
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, []);
  
    const selected = options.find(o => o.value === value);
  
    const frostedStyle = {
      background: "rgba(128,128,128,0.2)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      border: "1px solid rgba(128,128,128,0.2)",
      borderRadius: "8px"
    };
  
    return (
      <div style={{ position: "relative" }} ref={ref}>
        <label
          style={{
            display: "block",
            fontSize: "0.65rem",
            opacity: 0.6,
            marginBottom: "5px",
            fontWeight: "bold"
          }}
        >
          {label}
        </label>
  
        <button
          onClick={() => setOpen(prev => !prev)}
          style={{
            width: "100%",
            padding: "10px",
            textAlign: "left",
            color: "inherit",
            ...frostedStyle
          }}
        >
          {selected?.label}
        </button>
  
        {open && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: "6px",
              zIndex: 1000,
              padding: "8px",
              maxHeight: "220px",
              overflowY: "auto",
              boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
              ...frostedStyle
            }}
          >
            {options.map(option => (
              <div
                key={String(option.value)}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={{
                  padding: "8px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "0.85rem"
                }}
                onMouseEnter={e =>
                  (e.currentTarget.style.background =
                    "rgba(255,255,255,0.1)")
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                {option.label}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }