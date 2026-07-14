import { useState } from "react";
import { CHAINS, type Chain } from "@/lib/geckoTerminal";
import { ChevronDown } from "lucide-react";

interface Props {
  selected: Chain;
  onChange: (chain: Chain) => void;
}

export default function MultiChainSwitch({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
          color: "rgba(255,255,255,0.8)",
          fontSize: "12px",
          transition: "all 0.2s ease",
        }}
      >
        <span style={{ color: selected.color, fontSize: "14px", fontWeight: "bold" }}>
          {selected.icon}
        </span>
        <span className="font-orbitron" style={{ fontSize: "10px", letterSpacing: "0.06em", color: selected.color }}>
          {selected.label}
        </span>
        <ChevronDown
          size={12}
          style={{
            color: "rgba(255,255,255,0.35)",
            transform: open ? "rotate(180deg)" : "rotate(0)",
            transition: "transform 0.2s ease",
          }}
        />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 z-50 rounded-xl overflow-hidden min-w-[140px]"
          style={{
            background: "rgba(10,10,40,0.97)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
            backdropFilter: "blur(20px)",
          }}
        >
          {CHAINS.map((chain) => (
            <button
              key={chain.id}
              onClick={() => { onChange(chain); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left"
              style={{
                background: chain.id === selected.id ? `${chain.color}12` : "transparent",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                transition: "background 0.15s ease",
              }}
            >
              <span style={{ color: chain.color, fontSize: "14px", fontWeight: "bold" }}>{chain.icon}</span>
              <span style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "10px",
                color: chain.id === selected.id ? chain.color : "rgba(255,255,255,0.6)",
                letterSpacing: "0.06em",
              }}>
                {chain.label}
              </span>
              {chain.id === selected.id && (
                <span className="ml-auto" style={{ color: chain.color, fontSize: "10px" }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}

      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  );
}
