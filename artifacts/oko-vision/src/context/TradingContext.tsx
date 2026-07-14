import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Position {
  id: string;
  symbol: string;
  mint: string;
  logoURI?: string;
  entryPrice: number;
  currentPrice: number;
  amount: number;
  usdValue: number;       // current USD value
  costBasisUsd?: number;  // original invested USD amount (more reliable than amount*entryPrice)
  pnlUsd: number;
  pnlPct: number;
  openedAt: number;
  buyMcapUsd?: number;    // market cap in USD at time of purchase
  slPrice?: number;
  tpPrice?: number;
  trailingPct?: number;
  highWaterMark?: number; // highest price seen since position opened (for trailing stop)
  dipPct?: number;        // auto-buy on dip: trigger when price drops this % from entry
  dipAmountUsd?: number;  // USD amount to spend on the dip buy
  dipBought?: boolean;    // set to true once dip buy has been executed
  slOrderKey?: string;
  tpOrderKey?: string;
}

// ── Conditional Sell Order ─────────────────────────────────────────────────────

export interface ConditionalOrder {
  id:            string;
  mint:          string;
  symbol:        string;
  logoURI?:      string;
  sellPct:       number;          // % of holdings to sell when triggered (25/50/75/100)
  triggerType:   "tp" | "sl" | "mcap";
  triggerPct?:   number;          // +50 for TP, -20 for SL (relative to entry price)
  targetPrice?:  number;          // pre-calculated USD trigger price
  targetMcap?:   number;          // target market cap in USD (for mcap orders)
  entryPrice:    number;          // token price at time of order creation
  createdAt:     number;
  status:        "pending" | "triggered" | "cancelled";
  triggeredAt?:  number;
  triggerLabel:  string;          // human-readable: "+50% TP", "-20% SL", "$5M капа"
}

export interface DCAOrder {
  id: string;
  symbol: string;
  mint: string;
  price: number;
  amountUsd: number;
  intervalMs: number;
  nextBuyAt: number;
  totalSpent: number;
  buysExecuted: number;
  createdAt: number;
  active: boolean;
}

export interface SLTPSettings {
  slPct: number;
  tpPct: number;
  trailingPct: number;
  autoPlace: boolean;
}

export interface RiskSettings {
  maxRiskPct: number;
  maxOpenPositions: number;
  dailyLossLimit: number;
  minProfitPct: number;
}

export interface CopyTrader {
  id: string;
  address: string;
  shortAddress: string;
  name: string;
  avatarUrl?: string;
  winRate: number;
  pnl30d: number;
  followers: number;
  isCopying: boolean;
  allocation: number;
}

export interface TradeRecord {
  id: string;
  timestamp: number;
  symbol: string;
  mint?: string;
  side: "BUY" | "SELL";
  amount: number;
  price: number;
  usdValue: number;
  pnlPct?: number;
  txHash?: string;
  fee: number;
}

export interface PortfolioSnapshot {
  timestamp: number;
  totalUsd: number;
}

export interface TradingState {
  autoTrading: boolean;
  setAutoTrading: (v: boolean) => void;

  sltpSettings: SLTPSettings;
  setSLTPSettings: (s: SLTPSettings) => void;

  riskSettings: RiskSettings;
  setRiskSettings: (s: RiskSettings) => void;

  positions: Position[];
  addPosition: (p: Omit<Position, "id" | "pnlUsd" | "pnlPct">) => void;
  removePosition: (id: string) => void;
  clearAllPositions: () => void;
  updatePositionPrice: (mint: string, currentPrice: number) => void;
  setPositionHighWater: (mint: string, price: number) => void;
  totalUsd: number;
  totalPnlUsd: number;
  totalPnlPct: number;
  portfolioHistory: PortfolioSnapshot[];

  tradeHistory: TradeRecord[];
  addTrade: (t: Omit<TradeRecord, "id">) => void;

  copyTraders: CopyTrader[];
  toggleCopyTrader: (id: string) => void;
  setCopyAllocation: (id: string, pct: number) => void;

  checkTradeRisk: (usdAmount: number) => { allowed: boolean; reason?: string };

  // DCA
  dcaOrders: DCAOrder[];
  addDCAOrder: (order: Omit<DCAOrder, "id" | "totalSpent" | "buysExecuted" | "nextBuyAt" | "createdAt" | "active">) => void;
  removeDCAOrder: (id: string) => void;
  getDCAForMint: (mint: string) => DCAOrder | undefined;
  updateDCAOrder: (id: string, updates: Partial<Pick<DCAOrder, "totalSpent" | "buysExecuted" | "nextBuyAt" | "active">>) => void;
  markDipBought: (positionId: string) => void;

  // Conditional sell orders
  conditionalOrders: ConditionalOrder[];
  addConditionalOrder: (o: Omit<ConditionalOrder, "id" | "createdAt" | "status">) => void;
  removeConditionalOrder: (id: string) => void;
  getConditionalOrdersForMint: (mint: string) => ConditionalOrder[];
}

// ── Defaults ───────────────────────────────────────────────────────────────────

const DEFAULT_SLTP: SLTPSettings = {
  slPct: 10, tpPct: 30, trailingPct: 5, autoPlace: true,
};

const DEFAULT_RISK: RiskSettings = {
  maxRiskPct: 2, maxOpenPositions: 10, dailyLossLimit: 500, minProfitPct: 10,
};

// ── Context ────────────────────────────────────────────────────────────────────

const TradingCtx = createContext<TradingState>({} as TradingState);

/** Fetch current price from Jupiter Price API */
async function fetchJupiterPrice(mint: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`);
    const json = await res.json() as any;
    const p = json?.data?.[mint]?.price;
    return p ? parseFloat(p) : null;
  } catch {
    return null;
  }
}

export function TradingProvider({ children }: { children: ReactNode }) {
  const [autoTrading,        setAutoTradingState]   = useState(false);
  const [sltpSettings,       setSLTPState]          = useState<SLTPSettings>(DEFAULT_SLTP);
  const [riskSettings,       setRiskState]          = useState<RiskSettings>(DEFAULT_RISK);
  const [positions,          setPositions]          = useState<Position[]>([]);
  const [tradeHistory,       setTradeHistory]       = useState<TradeRecord[]>([]);
  const [portfolioHistory,   setPortfolioHistory]   = useState<PortfolioSnapshot[]>([]);
  const [copyTraders,        setCopyTraders]        = useState<CopyTrader[]>([]);
  const [dcaOrders,          setDcaOrders]          = useState<DCAOrder[]>([]);
  const [conditionalOrders,  setConditionalOrders]  = useState<ConditionalOrder[]>([]);

  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const dcaRef = useRef(dcaOrders);
  dcaRef.current = dcaOrders;
  const condRef = useRef(conditionalOrders);
  condRef.current = conditionalOrders;

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("oko-trading");
      if (stored) {
        const d = JSON.parse(stored);
        if (d.autoTrading       !== undefined) setAutoTradingState(d.autoTrading);
        if (d.sltpSettings)                  setSLTPState(d.sltpSettings);
        if (d.riskSettings)                  setRiskState(d.riskSettings);
        if (d.tradeHistory)                  setTradeHistory(d.tradeHistory);
        if (d.copyTraders)                   setCopyTraders(d.copyTraders);
        if (d.dcaOrders)                     setDcaOrders(d.dcaOrders);
        if (d.positions)                     setPositions(d.positions);
        if (d.portfolioHistory)              setPortfolioHistory(d.portfolioHistory);
        if (d.conditionalOrders)             setConditionalOrders(d.conditionalOrders);
      }
    } catch {}
  }, []);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("oko-trading", JSON.stringify({
        autoTrading, sltpSettings, riskSettings,
        tradeHistory: tradeHistory.slice(0, 100),
        copyTraders, dcaOrders,
        positions,
        portfolioHistory: portfolioHistory.slice(-90),
        conditionalOrders: conditionalOrders.slice(0, 50),
      }));
    } catch {}
  }, [autoTrading, sltpSettings, riskSettings, tradeHistory, copyTraders, dcaOrders, positions, portfolioHistory, conditionalOrders]);

  // DCA execution is handled by PositionMonitor (real swaps for generated wallets)

  // ── Conditional Order Check Timer ── checks every 30 seconds ────────────────
  useEffect(() => {
    const tick = async () => {
      const pending = condRef.current.filter((o) => o.status === "pending");
      if (pending.length === 0) return;

      const triggered: string[] = [];
      for (const order of pending) {
        // For price-based orders, check current price
        if (order.targetPrice && order.triggerType !== "mcap") {
          const price = await fetchJupiterPrice(order.mint);
          if (!price) continue;
          const isTP = order.triggerType === "tp" && price >= order.targetPrice;
          const isSL = order.triggerType === "sl" && price <= order.targetPrice;
          if (isTP || isSL) triggered.push(order.id);
        }
        // For market cap orders, we rely on the UI to fetch mcap
      }

      if (triggered.length > 0) {
        setConditionalOrders((prev) =>
          prev.map((o) =>
            triggered.includes(o.id)
              ? { ...o, status: "triggered", triggeredAt: Date.now() }
              : o,
          ),
        );
      }
    };

    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, []);

  // ── Conditional Order functions ───────────────────────────────────────────────
  const addConditionalOrder = useCallback((o: Omit<ConditionalOrder, "id" | "createdAt" | "status">) => {
    const newOrder: ConditionalOrder = {
      ...o,
      id: `cond-${Date.now()}`,
      createdAt: Date.now(),
      status: "pending",
    };
    setConditionalOrders((prev) => [newOrder, ...prev]);
  }, []);

  const removeConditionalOrder = useCallback((id: string) => {
    setConditionalOrders((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const getConditionalOrdersForMint = useCallback((mint: string) => {
    return conditionalOrders.filter((o) => o.mint === mint && o.status === "pending");
  }, [conditionalOrders]);

  // Derived totals
  const totalUsd    = positions.reduce((s, p) => s + p.usdValue, 0);
  const totalPnlUsd = positions.reduce((s, p) => s + p.pnlUsd, 0);
  const totalPnlPct = totalUsd > 0 ? (totalPnlUsd / (totalUsd - totalPnlUsd)) * 100 : 0;

  const addPosition = useCallback((p: Omit<Position, "id" | "pnlUsd" | "pnlPct">) => {
    const pnlUsd = (p.currentPrice - p.entryPrice) * p.amount;
    const pnlPct = p.entryPrice > 0 ? ((p.currentPrice - p.entryPrice) / p.entryPrice) * 100 : 0;
    setPositions((prev) => [{ ...p, id: `pos-${Date.now()}`, pnlUsd, pnlPct }, ...prev]);
  }, []);

  const removePosition = useCallback((id: string) => {
    setPositions((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearAllPositions = useCallback(() => setPositions([]), []);

  const updatePositionPrice = useCallback((mint: string, currentPrice: number) => {
    setPositions((prev) =>
      prev.map((p) => {
        if (p.mint !== mint) return p;
        const usdValue = currentPrice * p.amount;
        // Use costBasisUsd when available — more accurate than entryPrice * amount
        const costBasis = p.costBasisUsd ?? (p.entryPrice * p.amount);
        const pnlUsd = costBasis > 0 ? usdValue - costBasis : (currentPrice - p.entryPrice) * p.amount;
        const pnlPct = p.entryPrice > 0 ? ((currentPrice - p.entryPrice) / p.entryPrice) * 100 : 0;
        return { ...p, currentPrice, pnlUsd, pnlPct, usdValue };
      }),
    );
  }, []);

  const setPositionHighWater = useCallback((mint: string, price: number) => {
    setPositions((prev) =>
      prev.map((p) => {
        if (p.mint !== mint) return p;
        if (!p.highWaterMark || price > p.highWaterMark) {
          return { ...p, highWaterMark: price };
        }
        return p;
      }),
    );
  }, []);

  const addTrade = useCallback((t: Omit<TradeRecord, "id">) => {
    const record: TradeRecord = { ...t, id: `trade-${Date.now()}` };

    // Write to localStorage IMMEDIATELY (synchronous) — don't rely on useEffect
    // to avoid losing the record if the component unmounts before the effect fires.
    try {
      const raw  = localStorage.getItem("oko-trading");
      const data = raw ? JSON.parse(raw) : {};
      const prev = Array.isArray(data.tradeHistory) ? data.tradeHistory : [];
      data.tradeHistory = [record, ...prev].slice(0, 100);
      localStorage.setItem("oko-trading", JSON.stringify(data));
    } catch (e) {
      console.error("[addTrade] direct localStorage write failed:", e);
    }

    setTradeHistory((prev) => [record, ...prev.slice(0, 99)]);
    // Record portfolio snapshot after each trade
    setPortfolioHistory((prev) => {
      const snap: PortfolioSnapshot = { timestamp: Date.now(), totalUsd: positionsRef.current.reduce((s, p) => s + p.usdValue, 0) };
      return [...prev.slice(-89), snap];
    });
  }, []);

  const checkTradeRisk = useCallback((usdAmount: number): { allowed: boolean; reason?: string } => {
    const maxAllowed = (totalUsd * riskSettings.maxRiskPct) / 100;
    if (usdAmount > maxAllowed)
      return { allowed: false, reason: `Сумма $${usdAmount.toFixed(0)} превышает лимит риска $${maxAllowed.toFixed(0)} (${riskSettings.maxRiskPct}% портфеля)` };
    if (positions.length >= riskSettings.maxOpenPositions)
      return { allowed: false, reason: `Открытых позиций: ${positions.length} (макс. ${riskSettings.maxOpenPositions})` };
    const today = Date.now() - 86400000;
    const dailyLoss = tradeHistory
      .filter((t) => t.timestamp > today && (t.pnlPct ?? 0) < 0)
      .reduce((s, t) => s + Math.abs(t.pnlPct ?? 0) / 100 * t.usdValue, 0);
    if (dailyLoss >= riskSettings.dailyLossLimit)
      return { allowed: false, reason: `Дневной лимит убытков $${riskSettings.dailyLossLimit} исчерпан` };
    return { allowed: true };
  }, [totalUsd, riskSettings, positions.length, tradeHistory]);

  const setAutoTrading  = useCallback((v: boolean) => setAutoTradingState(v), []);
  const setSLTPSettings = useCallback((s: SLTPSettings) => setSLTPState(s), []);
  const setRiskSettings = useCallback((s: RiskSettings) => setRiskState(s), []);

  const toggleCopyTrader = useCallback((id: string) => {
    setCopyTraders((prev) => prev.map((t) => t.id === id ? { ...t, isCopying: !t.isCopying } : t));
  }, []);

  const setCopyAllocation = useCallback((id: string, pct: number) => {
    setCopyTraders((prev) => prev.map((t) => t.id === id ? { ...t, allocation: pct } : t));
  }, []);

  const addDCAOrder = useCallback((
    order: Omit<DCAOrder, "id" | "totalSpent" | "buysExecuted" | "nextBuyAt" | "createdAt" | "active">,
  ) => {
    const now = Date.now();
    const newOrder: DCAOrder = {
      ...order,
      id: `dca-${now}`,
      totalSpent: 0,
      buysExecuted: 0,
      nextBuyAt: now + order.intervalMs,
      createdAt: now,
      active: true,
    };
    setDcaOrders((prev) => {
      const filtered = prev.filter((o) => o.mint !== order.mint);
      return [newOrder, ...filtered];
    });
  }, []);

  const removeDCAOrder = useCallback((id: string) => {
    setDcaOrders((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const getDCAForMint = useCallback((mint: string) => {
    return dcaOrders.find((o) => o.mint === mint && o.active);
  }, [dcaOrders]);

  const updateDCAOrder = useCallback((
    id: string,
    updates: Partial<Pick<DCAOrder, "totalSpent" | "buysExecuted" | "nextBuyAt" | "active">>,
  ) => {
    setDcaOrders((prev) => prev.map((o) => o.id === id ? { ...o, ...updates } : o));
  }, []);

  const markDipBought = useCallback((positionId: string) => {
    setPositions((prev) => prev.map((p) => p.id === positionId ? { ...p, dipBought: true } : p));
  }, []);

  return (
    <TradingCtx.Provider value={{
      autoTrading, setAutoTrading,
      sltpSettings, setSLTPSettings,
      riskSettings, setRiskSettings,
      positions, addPosition, removePosition, clearAllPositions, updatePositionPrice, setPositionHighWater,
      totalUsd, totalPnlUsd, totalPnlPct,
      portfolioHistory,
      tradeHistory, addTrade,
      copyTraders, toggleCopyTrader, setCopyAllocation,
      checkTradeRisk,
      dcaOrders, addDCAOrder, removeDCAOrder, getDCAForMint, updateDCAOrder, markDipBought,
      conditionalOrders, addConditionalOrder, removeConditionalOrder, getConditionalOrdersForMint,
    }}>
      {children}
    </TradingCtx.Provider>
  );
}

export function useTrading() {
  return useContext(TradingCtx);
}
