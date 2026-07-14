import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Search, Filter, TrendingUp, Zap, ChevronLeft, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import Header from "@/components/Header";
import TokenCard from "@/components/TokenCard";
import TradingPanel from "@/components/TradingPanel";
import ChartModal from "@/components/ChartModal";
import MultiChainSwitch from "@/components/MultiChainSwitch";
import { fetchTrendingPools, searchPools, fetchPoolsByTokenAddress, CHAINS, type PoolSignal, type Chain, type SearchSuggestion } from "@/lib/geckoTerminal";

const FILTERS = ["All", "🔥 Volume Spike", "🐳 Whale", "📈 BUY", "📉 SELL"];

export default function Markets() {
  const [, navigate] = useLocation();
  const [tokens, setTokens] = useState<PoolSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedChain, setSelectedChain] = useState<Chain>(CHAINS[0]);
  const [chartToken, setChartToken] = useState<PoolSignal | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [searchResults, setSearchResults] = useState<PoolSignal[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSearchRef = useRef(false);

  // Trading panel state
  const [tradingToken, setTradingToken] = useState<PoolSignal | null>(null);
  const [tradingSide, setTradingSide]   = useState<"buy" | "sell">("buy");

  const handleTrade = useCallback((token: PoolSignal, side: "buy" | "sell") => {
    if (tradingToken?.poolAddress === token.poolAddress && tradingSide === side) {
      setTradingToken(null); // toggle off
    } else {
      setTradingToken(token);
      setTradingSide(side);
      // scroll into view after render
      setTimeout(() => {
        const el = document.getElementById(`trading-panel-${token.poolAddress}`);
        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    }
  }, [tradingToken, tradingSide]);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchTrendingPools(selectedChain.id);
      setTokens(data);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedChain]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30 seconds (only when not searching)
  useEffect(() => {
    if (search) return;
    const interval = setInterval(() => load(true), 30_000);
    return () => clearInterval(interval);
  }, [load, search]);

  // Single unified search effect — ONE API call for both suggestions and results
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults(null);
      setSearchError(null);
      setSuggestions([]);
      setShowSuggestions(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const results = await searchPools(q.trim(), selectedChain.id);
      setSearchResults(results);
      // Populate autocomplete suggestions from same response — deduplicate by token address
      const seen = new Set<string>();
      const sugg: SearchSuggestion[] = results
        .filter((p) => {
          // Deduplicate by token contract address (more accurate than symbol)
          const k = p.baseToken.id || p.baseToken.symbol.toUpperCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 6)
        .map((p) => ({
          symbol:       p.baseToken.symbol,
          name:         p.baseToken.name,
          poolName:     p.name,
          imageUrl:     p.baseToken.imageUrl,
          tokenAddress: p.baseToken.id,
          poolAddress:  p.poolAddress,
        }));
      setSuggestions(sugg);
      setShowSuggestions(sugg.length > 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      setSearchError(msg.includes("429") ? "Слишком много запросов — подожди секунду" : "Ошибка соединения с API");
      setSearchResults(null);
    } finally {
      setSearching(false);
    }
  }, [selectedChain]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!search.trim()) {
      setSearchResults(null);
      setSearchError(null);
      setSuggestions([]);
      setShowSuggestions(false);
      setSearching(false);
      return;
    }
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(() => runSearch(search), 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search, selectedChain, runSearch]);

  const pickSuggestion = async (s: SearchSuggestion) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    skipNextSearchRef.current = true;
    setSearch(s.symbol);
    setShowSuggestions(false);
    setSuggestions([]);

    // If we have the exact token address, fetch by address — ensures the
    // correct token is shown (not whatever has the highest market cap for that symbol)
    if (s.tokenAddress) {
      setSearching(true);
      setSearchError(null);
      try {
        const results = await fetchPoolsByTokenAddress(s.tokenAddress, selectedChain.id);
        setSearchResults(results.length > 0 ? results : await searchPools(s.symbol, selectedChain.id));
      } catch {
        // Fallback to symbol search
        runSearch(s.symbol);
      } finally {
        setSearching(false);
      }
    } else {
      runSearch(s.symbol);
    }
  };

  const isSearchMode = search.trim().length > 0;

  // Trending filtered by quick-filter chips
  const filtered = isSearchMode
    ? (searchResults ?? [])
    : tokens.filter((t) => {
        const matchFilter =
          filter === "All" ? true
          : filter.includes("Spike") ? t.volumeSpike
          : filter.includes("Whale") ? t.whaleEntry
          : filter.includes("BUY") ? t.aiSignal === "BUY"
          : filter.includes("SELL") ? t.aiSignal === "SELL"
          : true;
        return matchFilter;
      });

  const spikeCount = tokens.filter((t) => t.volumeSpike).length;
  const whaleCount = tokens.filter((t) => t.whaleEntry).length;
  const buyCount = tokens.filter((t) => t.aiSignal === "BUY").length;

  return (
    <div
      className="min-h-screen min-h-dvh"
      style={{ background: "#080808" }}
    >
      
      

      <div className="relative z-10">
        <Header />

        {/* Page header */}
        <div className="px-4 pt-4 pb-3 max-w-lg mx-auto">
          {/* Back + Title */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl shrink-0"
              style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.12)", color: "rgba(201,168,76,0.6)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <ChevronLeft size={12} /> Back
            </button>
            <div className="flex-1">
              <h1 className="font-orbitron font-bold" style={{ fontSize: "16px", color: "#F0EBE0", letterSpacing: "0.05em" }}>
                SIGNAL BOARD
              </h1>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px" }}>
                {lastUpdate ? `Обновлено ${lastUpdate.toLocaleTimeString("ru")}` : "Загрузка..."}
              </p>
            </div>
            <MultiChainSwitch selected={selectedChain} onChange={setSelectedChain} />
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: "Vol Spike", value: spikeCount },
              { label: "Whale",     value: whaleCount },
              { label: "AI Buy",    value: buyCount   },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl px-3 py-2 text-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <p style={{ color: "#F0EBE0", fontSize: "18px", fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>{stat.value}</p>
                <p style={{ color: "rgba(240,235,224,0.28)", fontSize: "8px", letterSpacing: "0.06em", textTransform: "uppercase" }}>{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Search + Refresh */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              {searching
                ? <Loader2 size={12} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: "#C9A84C", zIndex: 2 }} />
                : <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(201,168,76,0.4)", zIndex: 2 }} />
              }
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 300)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Поиск токена..."
                className="w-full pl-8 pr-8 py-2.5 rounded-xl outline-none"
                style={{
                  background: isSearchMode ? "rgba(201,168,76,0.07)" : "rgba(201,168,76,0.04)",
                  border: `1px solid ${isSearchMode ? "rgba(201,168,76,0.25)" : "rgba(201,168,76,0.14)"}`,
                  color: "rgba(255,255,255,0.75)",
                  fontSize: "12px",
                  caretColor: "#C9A84C",
                  transition: "all 0.2s ease",
                }}
              />
              {search && (
                <button
                  onClick={() => { setSearch(""); setSuggestions([]); setShowSuggestions(false); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "rgba(255,255,255,0.3)", fontSize: "16px", lineHeight: 1, zIndex: 2 }}
                >
                  ×
                </button>
              )}

              {/* Autocomplete dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden"
                  style={{
                    background: "rgba(8,8,8,0.97)",
                    border: "1px solid rgba(201,168,76,0.2)",
                    boxShadow: "0 8px 32px rgba(201,168,76,0.08)",
                    zIndex: 50,
                  }}
                >
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => pickSuggestion(s)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                      style={{
                        borderBottom: i < suggestions.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                        background: "transparent",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(201,168,76,0.06)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {s.imageUrl ? (
                        <img src={s.imageUrl} alt={s.symbol} className="w-6 h-6 rounded-full shrink-0" style={{ objectFit: "cover" }} />
                      ) : (
                        <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center" style={{ background: "rgba(201,168,76,0.1)", fontSize: "8px", color: "#C9A84C", fontWeight: 700 }}>
                          {s.symbol.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div style={{ color: "#fff", fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}>{s.symbol}</div>
                        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                      </div>
                      <div style={{ color: "rgba(201,168,76,0.3)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", flexShrink: 0 }}>
                        {s.poolName.split("/")[1]?.trim() || ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => load(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.16)" }}
            >
              <RefreshCw size={13} style={{ color: "#C9A84C", animation: refreshing ? "spin 0.8s linear infinite" : "none" }} />
            </button>
          </div>

          {/* Filter chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="shrink-0 px-3 py-1.5 rounded-full"
                style={{
                  background: f === filter ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.03)",
                  border: f === filter ? "1px solid rgba(201,168,76,0.30)" : "1px solid rgba(255,255,255,0.07)",
                  color: f === filter ? "#C9A84C" : "rgba(255,255,255,0.40)",
                  fontSize: "10px",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: f === filter ? 700 : 400,
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                  transition: "all 0.2s ease",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Token grid */}
        <div className="px-4 pb-8 max-w-lg mx-auto">
          {loading && !isSearchMode ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(201,168,76,0.15)", borderTopColor: "#C9A84C" }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Zap size={16} style={{ color: "#C9A84C" }} />
                </div>
              </div>
              <div className="text-center">
                <p className="font-orbitron" style={{ color: "#C9A84C", fontSize: "11px", letterSpacing: "0.1em" }}>ЗАГРУЗКА СИГНАЛОВ</p>
                <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px", marginTop: "4px" }}>Получаем данные с GeckoTerminal...</p>
              </div>
            </div>
          ) : searching && isSearchMode ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={28} className="animate-spin" style={{ color: "rgba(201,168,76,0.5)" }} />
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "12px" }}>Ищем «{search}»...</p>
            </div>
          ) : searchError && isSearchMode ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div style={{ fontSize: "28px" }}>⚠️</div>
              <p style={{ color: "#ff5252", fontSize: "12px", textAlign: "center", padding: "0 16px" }}>{searchError}</p>
              <button
                onClick={() => runSearch(search)}
                className="px-4 py-2 rounded-xl"
                style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)", color: "#C9A84C", fontSize: "11px", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                ПОВТОРИТЬ
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Filter size={28} style={{ color: "rgba(201,168,76,0.2)" }} />
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "13px" }}>
                {isSearchMode ? `«${search}» не найден на ${selectedChain.label}` : "Нет токенов по фильтру"}
              </p>
              {isSearchMode && (
                <>
                  <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "11px", textAlign: "center" }}>
                    Попробуйте другую сеть или уточните запрос
                  </p>
                  <button
                    onClick={() => runSearch(search)}
                    className="px-4 py-2 rounded-xl"
                    style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.15)", color: "rgba(201,168,76,0.6)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    ИСКАТЬ ЕЩЁ РАЗ
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              {isSearchMode ? (
                <>
                  {/* Original (highest mcap) */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(201,168,76,0.4), transparent)" }} />
                    <span style={{ color: "#C9A84C", fontSize: "8px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.12em" }}>
                      ОРИГИНАЛ · MAX CAP
                    </span>
                    <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent, rgba(201,168,76,0.4))" }} />
                  </div>
                  <div className="mb-4">
                    <TokenCard
                      key={filtered[0].poolAddress}
                      token={filtered[0]}
                      onOpenChart={setChartToken}
                      onTrade={handleTrade}
                      tradingOpen={tradingToken?.poolAddress === filtered[0].poolAddress}
                    />
                    {tradingToken?.poolAddress === filtered[0].poolAddress && (
                      <div id={`trading-panel-${filtered[0].poolAddress}`} className="mt-2">
                        <TradingPanel token={tradingToken} initialTab={tradingSide} onClose={() => setTradingToken(null)} />
                      </div>
                    )}
                  </div>

                  {/* Copies */}
                  {filtered.length > 1 && (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(201,168,76,0.2), transparent)" }} />
                        <span style={{ color: "rgba(201,168,76,0.4)", fontSize: "8px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.12em" }}>
                          ДРУГИЕ ПУЛЫ · {filtered.length - 1}
                        </span>
                        <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent, rgba(201,168,76,0.2))" }} />
                      </div>
                      <div className="flex flex-col gap-3">
                        {filtered.slice(1).map((token) => (
                          <div key={token.poolAddress}>
                            <TokenCard
                              token={token}
                              onOpenChart={setChartToken}
                              onTrade={handleTrade}
                              tradingOpen={tradingToken?.poolAddress === token.poolAddress}
                            />
                            {tradingToken?.poolAddress === token.poolAddress && (
                              <div id={`trading-panel-${token.poolAddress}`} className="mt-2">
                                <TradingPanel token={tradingToken} initialTab={tradingSide} onClose={() => setTradingToken(null)} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px", marginBottom: "10px", letterSpacing: "0.04em" }}>
                    {filtered.length} сигналов · {selectedChain.label}
                    {tradingToken && <span style={{ color: "#C9A84C", marginLeft: 8 }}>· {tradingToken.baseToken.symbol} открыт</span>}
                  </p>
                  {tradingToken ? (
                    /* Single-column layout when trading panel is open */
                    <div className="flex flex-col gap-3">
                      {filtered.map((token) => {
                        const isActive = tradingToken.poolAddress === token.poolAddress;
                        return (
                          <div key={token.poolAddress}>
                            <TokenCard
                              token={token}
                              onOpenChart={setChartToken}
                              onTrade={handleTrade}
                              tradingOpen={isActive}
                            />
                            {isActive && (
                              <div
                                id={`trading-panel-${token.poolAddress}`}
                                className="mt-2"
                                style={{ animation: "fadeInUp 0.25s ease" }}
                              >
                                <TradingPanel
                                  token={tradingToken}
                                  initialTab={tradingSide}
                                  onClose={() => setTradingToken(null)}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Normal 2-column grid */
                    <div className="grid grid-cols-2 gap-3">
                      {filtered.map((token, i) => (
                        <TokenCard
                          key={token.poolAddress}
                          token={token}
                          onOpenChart={setChartToken}
                          onTrade={handleTrade}
                          loadDelay={300 + i * 120}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Full-screen chart modal */}
      <ChartModal token={chartToken} onClose={() => setChartToken(null)} />
    </div>
  );
}
