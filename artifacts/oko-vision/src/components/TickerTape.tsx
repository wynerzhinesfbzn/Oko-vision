import { useState, useEffect, useRef } from "react";

const CGBASE = import.meta.env.DEV ? "/coingecko" : "https://api.coingecko.com";
const DEXBASE = import.meta.env.DEV ? "/dex"       : "https://api.dexscreener.com";

type Tick = { symbol: string; price: string; change: number };

const FALLBACK: Tick[] = [
  { symbol: "BTC",  price: "—",   change: 0 },
  { symbol: "ETH",  price: "—",   change: 0 },
  { symbol: "SOL",  price: "—",   change: 0 },
  { symbol: "DOGE", price: "—",   change: 0 },
];

function fmt(n: number): string {
  if (n >= 10_000)  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1)       return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 0.01)    return n.toFixed(4);
  return n.toFixed(6);
}

async function fetchTicks(): Promise<Tick[]> {
  // 1️⃣ CoinGecko — BTC, ETH, SOL + popular memes
  const cgIds = "bitcoin,ethereum,solana,dogecoin,pepe,bonk,dogwifcoin,shiba-inu";
  const cgUrl = `${CGBASE}/api/v3/simple/price?ids=${cgIds}&vs_currencies=usd&include_24hr_change=true`;

  const [cgRes, dexRes] = await Promise.allSettled([
    fetch(cgUrl).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    fetch(`${DEXBASE}/token-boosts/top/v1`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  ]);

  const ticks: Tick[] = [];

  // CoinGecko results
  const CG_MAP: Record<string, string> = {
    bitcoin: "BTC", ethereum: "ETH", solana: "SOL",
    dogecoin: "DOGE", pepe: "PEPE", bonk: "BONK",
    dogwifcoin: "WIF", "shiba-inu": "SHIB",
  };
  if (cgRes.status === "fulfilled") {
    const data = cgRes.value;
    for (const [id, sym] of Object.entries(CG_MAP)) {
      if (data[id]) {
        ticks.push({
          symbol: sym,
          price:  `$${fmt(data[id].usd)}`,
          change: data[id].usd_24h_change ?? 0,
        });
      }
    }
  }

  // DexScreener boosted — grab top 4 Solana meme coins not already in list
  if (dexRes.status === "fulfilled" && Array.isArray(dexRes.value)) {
    const existing = new Set(ticks.map((t) => t.symbol.toUpperCase()));
    const solBoosts: any[] = (dexRes.value as any[])
      .filter((b) => b.chainId === "solana" && b.tokenAddress)
      .slice(0, 20);

    if (solBoosts.length > 0) {
      try {
        const addrs = solBoosts.slice(0, 10).map((b) => b.tokenAddress).join(",");
        const pr = await fetch(`${DEXBASE}/latest/dex/tokens/${addrs}`);
        if (pr.ok) {
          const pj = await pr.json();
          const pairs: any[] = pj.pairs ?? [];
          const seen = new Set<string>();
          let added = 0;
          for (const p of pairs) {
            if (p.chainId !== "solana") continue;
            const sym = (p.baseToken?.symbol ?? "").toUpperCase();
            if (!sym || existing.has(sym) || seen.has(sym)) continue;
            const price = parseFloat(p.priceUsd ?? "0");
            if (!price) continue;
            seen.add(sym);
            existing.add(sym);
            ticks.push({
              symbol: sym,
              price:  `$${fmt(price)}`,
              change: p.priceChange?.h24 ?? 0,
            });
            if (++added >= 4) break;
          }
        }
      } catch { /* silent */ }
    }
  }

  return ticks.length >= 3 ? ticks : FALLBACK;
}

function TickItem({ t }: { t: Tick }) {
  const pos = t.change > 0;
  const neg = t.change < 0;
  const chg = t.change !== 0
    ? `${pos ? "+" : ""}${t.change.toFixed(2)}%`
    : null;

  return (
    <div className="flex items-center gap-2 shrink-0">
      <span style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: "10px", fontWeight: 700,
        color: "rgba(240,235,224,0.70)",
        letterSpacing: "0.07em",
      }}>
        {t.symbol}
      </span>
      <span style={{
        fontFamily: "monospace",
        fontSize: "10.5px", fontWeight: 600,
        color: "rgba(255,255,255,0.88)",
        letterSpacing: "0.02em",
      }}>
        {t.price}
      </span>
      {chg && (
        <span style={{
          fontSize: "9.5px", fontWeight: 700,
          color: pos ? "#C9A84C" : neg ? "#FF4D5E" : "rgba(240,235,224,0.35)",
          fontFamily: "monospace",
        }}>
          {chg}
        </span>
      )}
      <span style={{ color: "rgba(255,255,255,0.08)", fontSize: "10px", margin: "0 4px" }}>▸</span>
    </div>
  );
}

export default function TickerTape() {
  const [ticks, setTicks] = useState<Tick[]>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    try {
      const data = await fetchTicks();
      setTicks(data);
    } catch { /* keep previous */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Duplicate for seamless loop
  const all = [...ticks, ...ticks, ...ticks];

  return (
    <div
      className="w-full overflow-hidden"
      style={{
        background: "#0D0D0D",
        borderTop:    "1px solid rgba(255,255,255,0.06)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        height: 34,
        display: "flex",
        alignItems: "center",
        position: "relative",
      }}
    >
      {/* Live indicator */}
      <div
        className="flex items-center gap-1 shrink-0 px-3"
        style={{ borderRight: "1px solid rgba(255,255,255,0.06)", height: "100%" }}
      >
        <span
          style={{
            width: 5, height: 5, borderRadius: "50%",
            background: loading ? "rgba(255,255,255,0.15)" : "#C9A84C",
            display: "inline-block",
            animation: loading ? "none" : "pulse-dot 2.2s ease-in-out infinite",
          }}
        />
        <span style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: "7.5px", fontWeight: 700,
          color: loading ? "rgba(240,235,224,0.18)" : "#C9A84C",
          letterSpacing: "0.08em",
        }}>
          LIVE
        </span>
      </div>

      {/* Scrolling tickers */}
      <div className="flex-1 overflow-hidden" style={{ maskImage: "linear-gradient(90deg, transparent 0%, black 4%, black 96%, transparent 100%)" }}>
        <div
          className="ticker-tape flex items-center gap-5"
          style={{ width: "max-content", height: 34 }}
        >
          {all.map((t, i) => <TickItem key={i} t={t} />)}
        </div>
      </div>
    </div>
  );
}
