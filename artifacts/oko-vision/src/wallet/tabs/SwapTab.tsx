import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useOkoWallet } from "@/context/WalletContext";

const GREEN = "#00c853";
const RED   = "#ff1744";
const BLUE  = "#2962ff";

const TOKENS = [
  { symbol: "SOL",  mint: "So11111111111111111111111111111111111111112",  decimals: 9  },
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6  },
  { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6  },
  { symbol: "RAY",  mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", decimals: 6  },
  { symbol: "JUP",  mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",  decimals: 6  },
  { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5  },
  { symbol: "WIF",  mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",  decimals: 6 },
];

interface Quote {
  outFormatted: string;
  priceImpact: string;
  route: string;
}

export default function SwapTab() {
  const { connected } = useOkoWallet();
  const [fromIdx, setFromIdx] = useState(0);
  const [toIdx,   setToIdx]   = useState(1);
  const [amount,  setAmount]  = useState("");
  const [quote,   setQuote]   = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [done,    setDone]    = useState(false);

  const from = TOKENS[fromIdx];
  const to   = TOKENS[toIdx];

  const flip = () => {
    setFromIdx(toIdx); setToIdx(fromIdx);
    setQuote(null); setAmount(""); setDone(false);
  };

  const getQuote = useCallback(async () => {
    if (!amount || +amount <= 0) return;
    setLoading(true); setError(""); setQuote(null); setDone(false);
    try {
      const lamports = Math.round(+amount * 10 ** from.decimals);
      const res = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${from.mint}&outputMint=${to.mint}&amount=${lamports}&slippageBps=50`
      );
      if (!res.ok) throw new Error(`Jupiter: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const out = (Number(data.outAmount) / 10 ** to.decimals).toFixed(6);
      const impact = Number(data.priceImpactPct).toFixed(3);
      const route = (data.routePlan as any[]).map(r => r.swapInfo.label).join(" → ");
      setQuote({ outFormatted: out, priceImpact: impact, route });
    } catch (e: any) {
      setError(e.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [amount, from, to]);

  return (
    <div style={{ padding: "20px 16px 32px" }}>

      {/* title */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>Обмен</div>
        <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>Solana · Jupiter v6</div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: "#111",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 20, padding: 20,
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        {/* From */}
        <AmountBox
          label="Отдаёте"
          value={amount}
          onChange={v => { setAmount(v); setQuote(null); setDone(false); }}
          token={from}
          tokens={TOKENS}
          selectedIdx={fromIdx}
          onTokenChange={setFromIdx}
          excludeIdx={toIdx}
        />

        {/* Flip button */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            onClick={flip}
            style={{
              width: 38, height: 38, borderRadius: "50%",
              background: "#1a1a1a",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#555", fontSize: 18, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "color 0.15s, border-color 0.15s",
            }}
          >⇅</button>
        </div>

        {/* To */}
        <AmountBox
          label="Получаете"
          value={quote?.outFormatted ?? ""}
          readOnly
          token={to}
          tokens={TOKENS}
          selectedIdx={toIdx}
          onTokenChange={setToIdx}
          excludeIdx={fromIdx}
        />

        {/* Route info */}
        {quote && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            borderRadius: 12, padding: "10px 14px",
            fontSize: 12, color: "#555", lineHeight: 1.6,
          }}>
            <div>Маршрут: <span style={{ color: "#888" }}>{quote.route}</span></div>
            <div>Влияние на цену: <span style={{ color: Number(quote.priceImpact) > 1 ? RED : GREEN }}>
              {quote.priceImpact}%
            </span></div>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 13, color: RED, padding: "4px 0" }}>{error}</div>
        )}

        {/* Buttons */}
        <button
          onClick={getQuote}
          disabled={loading || !amount}
          style={{
            width: "100%", padding: "14px 0",
            background: "rgba(255,255,255,0.06)",
            border: "none", borderRadius: 14,
            color: loading || !amount ? "#333" : "#888",
            fontSize: 14, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {loading ? "Поиск маршрута…" : "Получить котировку"}
        </button>

        <button
          disabled={!quote || !connected}
          onClick={() => setDone(true)}
          style={{
            width: "100%", padding: "16px 0",
            background: (!quote || !connected) ? "#1a1a1a" : BLUE,
            border: "none", borderRadius: 14,
            color: (!quote || !connected) ? "#333" : "#fff",
            fontSize: 15, fontWeight: 700, cursor: "pointer",
            letterSpacing: "0.01em",
            boxShadow: (quote && connected) ? `0 4px 16px rgba(41,98,255,0.3)` : "none",
            transition: "background 0.2s, color 0.2s",
          }}
        >
          {!connected ? "Подключите кошелёк" : done ? "✓ Выполнено" : "Обменять"}
        </button>

        <div style={{ textAlign: "center", fontSize: 11, color: "#333" }}>
          Slippage 0.5% · Mainnet Solana
        </div>
      </motion.div>
    </div>
  );
}

function AmountBox({
  label, value, onChange, readOnly = false,
  token, tokens, selectedIdx, onTokenChange, excludeIdx,
}: {
  label: string; value: string;
  onChange?: (v: string) => void; readOnly?: boolean;
  token: { symbol: string }; tokens: { symbol: string }[];
  selectedIdx: number; onTokenChange: (i: number) => void; excludeIdx: number;
}) {
  return (
    <div style={{
      background: "#1a1a1a", borderRadius: 14, padding: "14px 16px",
    }}>
      <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input
          type={readOnly ? "text" : "number"}
          readOnly={readOnly}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          placeholder="0.00"
          style={{
            flex: 1, background: "none", border: "none", outline: "none",
            fontSize: 28, fontWeight: 300, color: readOnly ? "#888" : "#fff",
            width: 0, minWidth: 0,
          }}
        />
        <select
          value={selectedIdx}
          onChange={e => onTokenChange(Number(e.target.value))}
          style={{
            background: "#2a2a2a",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10, padding: "6px 10px",
            color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: "pointer", outline: "none", flexShrink: 0,
          }}
        >
          {tokens.map((t, i) => (
            <option key={i} value={i} disabled={i === excludeIdx}>{t.symbol}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
