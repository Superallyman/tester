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
  
    return (
      <div style={{ position: "relative" }} ref={ref}>
        <span className="orbit-label" style={{ display: "block", marginBottom: 6 }}>{label}</span>
        <button onClick={() => setOpen(prev => !prev)} aria-haspopup="listbox" aria-expanded={open}
          className="orbit-input" style={{ textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{selected?.label}</span><span aria-hidden="true" style={{ opacity: 0.5 }}>▾</span>
        </button>

        {open && (
          <div role="listbox" className="orbit-glass"
            style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 6, zIndex: 1000, padding: 6, maxHeight: 240, overflowY: "auto", borderRadius: "var(--orbit-radius)" }}>
            {options.map(option => (
              <div key={String(option.value)} role="option" aria-selected={option.value === value}
                onClick={() => { onChange(option.value); setOpen(false); }}
                className="hover:bg-black/5 dark:hover:bg-white/10"
                style={{ padding: "8px 10px", borderRadius: "calc(var(--orbit-radius) - 2px)", cursor: "pointer", fontSize: "0.88rem", fontWeight: option.value === value ? 600 : 400 }}>
                {option.label}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
