import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Link2, Users, DollarSign, Copy, CheckCircle2,
  Share2, TrendingUp, ChevronRight, Gift, Zap, Info, RefreshCw,
  ExternalLink,
} from "lucide-react";
import { useOkoWallet } from "@/context/WalletContext";
import {
  fetchReferralStats, buildRefCode, buildRefLink,
  type ReferralStats, type ReferralFriend, type ReferralPayout,
} from "@/lib/referral";

const COMMISSION_PCT = 0.25; // 25% of OKO's 1% = 0.25% of volume

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

function StatPill({ label, value, color = "#C9A84C", sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center py-3 px-2 rounded-2xl"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div style={{ color, fontFamily: "monospace", fontWeight: 800, fontSize: "20px", lineHeight: 1 }}>{value}</div>
      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "8px", marginTop: "4px", textAlign: "center" }}>{label}</div>
      {sub && <div style={{ color, fontSize: "8px", marginTop: "2px" }}>{sub}</div>}
    </div>
  );
}

function EarningsCalc({ refCount }: { refCount: number }) {
  const [vol, setVol] = useState(50_000);
  const monthly = (vol * COMMISSION_PCT) / 100 * refCount;
  const steps = [10_000, 50_000, 100_000, 500_000, 1_000_000];
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.12)" }}>
      <div className="flex items-center gap-2 mb-4">
        <Zap size={13} style={{ color: "#C9A84C" }} />
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.1em" }}>
          КАЛЬКУЛЯТОР ЗАРАБОТКА
        </span>
      </div>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", marginBottom: "8px" }}>
        Средний объём сделок 1 друга в месяц
      </div>
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {steps.map((s) => (
          <button key={s} onClick={() => setVol(s)}
            className="flex-1 py-1.5 rounded-xl"
            style={{
              background:  vol === s ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.04)",
              border:      vol === s ? "1px solid rgba(201,168,76,0.35)" : "1px solid rgba(255,255,255,0.07)",
              color:       vol === s ? "#C9A84C" : "rgba(255,255,255,0.3)",
              fontSize:    "9px", fontWeight: vol === s ? 700 : 400, whiteSpace: "nowrap",
            }}>
            {fmt(s)}
          </button>
        ))}
      </div>
      <div className="rounded-2xl p-4 text-center" style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.18)" }}>
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", marginBottom: "4px" }}>
          Пассивный доход/мес ({refCount} {refCount === 1 ? "друг" : refCount < 5 ? "друга" : "друзей"} × {fmt(vol)}/мес)
        </div>
        <div style={{ color: "#C9A84C", fontSize: "32px", fontWeight: 800, fontFamily: "monospace", lineHeight: 1 }}>
          ${monthly.toFixed(2)}
        </div>
        <div style={{ color: "rgba(201,168,76,0.5)", fontSize: "9px", marginTop: "4px" }}>
          = {refCount} × {fmt(vol)} × 0.25%
        </div>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <Info size={11} style={{ color: "#C9A84C", flexShrink: 0, marginTop: "1px" }} />
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", lineHeight: 1.5 }}>
          Ты получаешь <span style={{ color: "#C9A84C" }}>0.25%</span> от объёма каждой сделки реферала — автоматически в SOL, без заявок.
        </span>
      </div>
    </div>
  );
}

function FriendCard({ f }: { f: ReferralFriend }) {
  const isActive = f.tradeCount > 0;
  return (
    <div className="rounded-2xl p-3.5" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center gap-3 mb-2.5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: isActive ? "rgba(201,168,76,0.1)" : "rgba(255,255,255,0.06)",
            border: isActive ? "1px solid rgba(201,168,76,0.25)" : "1px solid rgba(255,255,255,0.1)"
          }}>
          <Users size={14} style={{ color: isActive ? "#C9A84C" : "rgba(255,255,255,0.3)" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-2">
            <span style={{ color: "rgba(255,255,255,0.75)", fontSize: "11px", fontFamily: "monospace" }}>{f.shortAddr}</span>
            <span style={{
              background: isActive ? "rgba(201,168,76,0.1)" : "rgba(255,171,0,0.1)",
              border: isActive ? "1px solid rgba(201,168,76,0.25)" : "1px solid rgba(255,171,0,0.25)",
              color: isActive ? "#C9A84C" : "#ffab00",
              fontSize: "7px", padding: "1px 6px", borderRadius: "20px",
            }}>
              {isActive ? "АКТИВЕН" : "НОВЫЙ"}
            </span>
          </div>
          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "8px" }}>Вступил {fmtDate(f.joinedAt)}</div>
        </div>
        <div className="text-right">
          <div style={{ color: "#C9A84C", fontSize: "13px", fontFamily: "monospace", fontWeight: 700 }}>
            ${f.earnedUsd.toFixed(2)}
          </div>
          <div style={{ color: "rgba(201,168,76,0.4)", fontSize: "8px" }}>заработано</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Объём",    value: fmt(f.volumeUsd),           color: "#C9A84C" },
          { label: "Сделок",   value: String(f.tradeCount),       color: "rgba(255,255,255,0.5)" },
          { label: "Доход",    value: `$${f.earnedUsd.toFixed(2)}`, color: "#C9A84C" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl px-2 py-1.5 text-center"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ color: m.color, fontSize: "11px", fontWeight: 700, fontFamily: "monospace" }}>{m.value}</div>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "7px", marginTop: "1px" }}>{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

type Tab = "overview" | "friends" | "history";

export default function Referral() {
  const [, navigate] = useLocation();
  const { address }  = useOkoWallet();
  const [copied, setCopied] = useState(false);
  const [tab, setTab]       = useState<Tab>("overview");
  const [stats, setStats]   = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(false);
  const linkRef = useRef<HTMLDivElement>(null);

  const refCode = address ? buildRefCode(address) : "OKO-DEMO";
  const refLink = address ? buildRefLink(address) : "https://oko.vision/?ref=OKO-DEMO";

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetchReferralStats(address).then(s => {
      setStats(s);
      setLoading(false);
    });
  }, [address]);

  const refresh = () => {
    if (!address) return;
    setLoading(true);
    fetchReferralStats(address).then(s => { setStats(s); setLoading(false); });
  };

  const totalEarnedUsd    = stats?.totalEarnedUsd   ?? 0;
  const pendingUsd        = stats?.pendingUsd        ?? 0;
  const friendCount       = stats?.friendCount       ?? 0;
  const friends           = stats?.friends           ?? [];
  const payouts           = stats?.payouts           ?? [];
  const recentTrades      = stats?.recentTrades      ?? [];

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(refLink); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "OKO Vision Terminal",
          text: "Торгуй на Solana с умом — OKO Vision даёт реальное преимущество. Регистрируйся по моей ссылке:",
          url: refLink,
        });
      } catch {}
    } else {
      copyLink();
    }
  };

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: "Обзор" },
    { key: "friends",  label: `Друзья (${friendCount})` },
    { key: "history",  label: "Выплаты" },
  ];

  return (
    <div className="min-h-screen pb-10" style={{ background: "#080808" }}>

      {/* Header */}
      <div className="sticky top-0 z-30 px-4 py-3.5 flex items-center gap-3"
        style={{ background: "rgba(5,5,15,0.94)", borderBottom: "1px solid rgba(201,168,76,0.08)", backdropFilter: "blur(20px)" }}>
        <button onClick={() => navigate("/")} className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <ArrowLeft size={14} style={{ color: "rgba(255,255,255,0.6)" }} />
        </button>
        <div>
          <div className="font-orbitron font-black" style={{ color: "#C9A84C", fontSize: "14px", letterSpacing: "0.12em" }}>
            РЕФЕРАЛЬНАЯ ПРОГРАММА
          </div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px" }}>
            Зарабатывай 0.25% от объёма сделок друзей · авто-выплата в SOL
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={refresh} className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <RefreshCw size={13} style={{ color: loading ? "#C9A84C" : "rgba(255,255,255,0.4)", animation: loading ? "spin 1s linear infinite" : "none" }} />
          </button>
          <div className="px-3 py-1.5 rounded-full flex items-center gap-1.5"
            style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.22)" }}>
            <Gift size={11} style={{ color: "#C9A84C" }} />
            <span style={{ color: "#C9A84C", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif" }}>
              {friendCount} РЕФЕРАЛОВ
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto space-y-4">

        {/* Hero stats */}
        <div className="rounded-2xl p-4"
          style={{ background: "linear-gradient(135deg, rgba(201,168,76,0.06), rgba(201,168,76,0.03))", border: "1px solid rgba(201,168,76,0.18)" }}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={13} style={{ color: "#C9A84C" }} />
            <span style={{ color: "rgba(201,168,76,0.7)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.1em" }}>
              ВАШ ЗАРАБОТОК (РЕАЛЬНЫЙ)
            </span>
          </div>
          <div className="flex items-end gap-2 mb-4">
            <span style={{ color: "#C9A84C", fontFamily: "monospace", fontWeight: 900, fontSize: "38px", lineHeight: 1 }}>
              ${totalEarnedUsd.toFixed(2)}
            </span>
            <span style={{ color: "rgba(201,168,76,0.45)", fontSize: "11px", marginBottom: "4px" }}>всего</span>
          </div>
          <div className="flex gap-2">
            <StatPill label="Ожидает выплаты" value={`$${pendingUsd.toFixed(2)}`} color="#ffab00" />
            <StatPill label="Выплачено"        value={`$${(stats?.paidOutUsd ?? 0).toFixed(2)}`} color="#C9A84C" />
            <StatPill label="Ставка"           value="0.25%" sub="от объёма" color="#C9A84C" />
          </div>

          {/* Payout threshold notice */}
          <div className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5"
            style={{ background: "rgba(255,171,0,0.05)", border: "1px solid rgba(255,171,0,0.15)" }}>
            <Zap size={11} style={{ color: "#ffab00", flexShrink: 0, marginTop: "1px" }} />
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", lineHeight: 1.5 }}>
              Авто-выплата в <span style={{ color: "#ffab00" }}>SOL</span> запускается когда накопится $0.50 — 
              деньги отправляются автоматически на твой кошелёк.
            </span>
          </div>
        </div>

        {/* Ref link */}
        <div className="rounded-2xl p-4"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.1em", marginBottom: "12px" }}>
            ВАША РЕФЕРАЛЬНАЯ ССЫЛКА
          </div>
          <div className="flex items-center justify-center py-3 rounded-2xl mb-3"
            style={{ background: "rgba(201,168,76,0.07)", border: "1px solid rgba(201,168,76,0.22)" }}>
            <span className="font-orbitron font-black" style={{ color: "#C9A84C", fontSize: "22px", letterSpacing: "0.18em" }}>
              {refCode}
            </span>
          </div>
          <div ref={linkRef} className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <Link2 size={11} style={{ color: "rgba(201,168,76,0.4)", flexShrink: 0 }} />
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px", fontFamily: "monospace",
              flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {refLink}
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={copyLink} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl"
              style={{
                background: copied ? "rgba(201,168,76,0.10)" : "rgba(255,255,255,0.05)",
                border: copied ? "1px solid rgba(201,168,76,0.3)" : "1px solid rgba(255,255,255,0.1)",
              }}>
              {copied
                ? <><CheckCircle2 size={14} style={{ color: "#C9A84C" }} /><span style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>СКОПИРОВАНО</span></>
                : <><Copy size={14} style={{ color: "rgba(255,255,255,0.5)" }} /><span style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif" }}>КОПИРОВАТЬ</span></>
              }
            </button>
            <button onClick={shareLink} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl"
              style={{ background: "rgba(201,168,76,0.10)", border: "1px solid rgba(201,168,76,0.28)" }}>
              <Share2 size={14} style={{ color: "#C9A84C" }} />
              <span style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>
                ПОДЕЛИТЬСЯ
              </span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-2xl p-1"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex-1 py-2.5 rounded-xl"
              style={{
                background: tab === t.key ? "rgba(201,168,76,0.1)" : "transparent",
                border:     tab === t.key ? "1px solid rgba(201,168,76,0.25)" : "1px solid transparent",
                color:      tab === t.key ? "#C9A84C" : "rgba(255,255,255,0.35)",
                fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: tab === t.key ? 700 : 400,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Overview */}
        {tab === "overview" && (
          <div className="space-y-4">
            <EarningsCalc refCount={Math.max(friendCount, 1)} />

            {/* How it works */}
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.1em", marginBottom: "14px" }}>
                КАК ЭТО РАБОТАЕТ
              </div>
              <div className="space-y-3">
                {[
                  { step: "01", title: "Поделись ссылкой", desc: "Скопируй реферальный код и отправь друзьям в Telegram, Twitter или Discord", icon: <Link2 size={15} style={{ color: "#C9A84C" }} /> },
                  { step: "02", title: "Друг регистрируется", desc: "Он переходит по ссылке, подключает кошелёк — и автоматически привязан к тебе навсегда", icon: <Users size={15} style={{ color: "#C9A84C" }} /> },
                  { step: "03", title: "Получай пассивный доход", desc: "С каждой сделки друга OKO берёт 1%. Ты получаешь 25% от этой суммы = 0.25% от объёма", icon: <DollarSign size={15} style={{ color: "#C9A84C" }} /> },
                  { step: "04", title: "Авто-выплата в SOL", desc: "Как только накопится $0.50 — SOL отправляется прямо на твой кошелёк. Автоматически, без заявок", icon: <Zap size={15} style={{ color: "#C9A84C" }} /> },
                ].map((s) => (
                  <div key={s.step} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.18)" }}>
                      {s.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span style={{ color: "#C9A84C", fontSize: "8px", fontFamily: "'Space Grotesk', sans-serif", opacity: 0.6 }}>ШАГ {s.step}</span>
                        <span style={{ color: "rgba(255,255,255,0.65)", fontSize: "11px", fontWeight: 600 }}>{s.title}</span>
                      </div>
                      <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px", lineHeight: 1.5 }}>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Terms */}
            <div className="rounded-2xl p-4" style={{ background: "rgba(201,168,76,0.03)", border: "1px solid rgba(201,168,76,0.1)" }}>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.1em", marginBottom: "12px" }}>
                УСЛОВИЯ
              </div>
              <div className="space-y-2">
                {[
                  { label: "Ваш доход с каждой сделки", value: "0.25%", desc: "от объёма торгов реферала", color: "#C9A84C" },
                  { label: "Привязка реферала",          value: "∞",     desc: "навсегда, с каждой их сделки",   color: "#C9A84C" },
                  { label: "Порог авто-выплаты",         value: "$0.50", desc: "накопилось → SOL на кошелёк",   color: "#ffab00" },
                  { label: "Валюта выплат",              value: "SOL",   desc: "по курсу на момент выплаты",    color: "#C9A84C" },
                ].map((r) => (
                  <div key={r.label} className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px" }}>{r.label}</div>
                      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "8px" }}>{r.desc}</div>
                    </div>
                    <div style={{ color: r.color, fontFamily: "monospace", fontWeight: 700, fontSize: "14px" }}>{r.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Friends */}
        {tab === "friends" && (
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw size={24} style={{ color: "#C9A84C", margin: "0 auto 10px", animation: "spin 1s linear infinite" }} />
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "12px" }}>Загрузка...</p>
              </div>
            ) : friends.length === 0 ? (
              <div className="text-center py-12">
                <Users size={36} style={{ color: "rgba(201,168,76,0.15)", margin: "0 auto 10px" }} />
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "12px" }}>Пока нет рефералов</p>
                <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px", marginTop: "4px" }}>Поделись ссылкой и начни зарабатывать</p>
              </div>
            ) : (
              <>
                <div className="rounded-xl px-4 py-3 flex items-center justify-between"
                  style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.12)" }}>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px" }}>Суммарный объём</span>
                  <span style={{ color: "#C9A84C", fontFamily: "monospace", fontWeight: 700, fontSize: "13px" }}>
                    {fmt(friends.reduce((s, f) => s + f.volumeUsd, 0))}
                  </span>
                </div>
                {friends.map((f) => <FriendCard key={f.address} f={f} />)}
              </>
            )}
          </div>
        )}

        {/* Tab: History */}
        {tab === "history" && (
          <div className="space-y-3">
            {/* SOL payouts */}
            {payouts.length > 0 && (
              <div className="space-y-2">
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.1em" }}>
                  ВЫПЛАЧЕНО В SOL
                </div>
                {payouts.map((p) => (
                  <div key={p.id} className="rounded-2xl px-4 py-3.5 flex items-center gap-3"
                    style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(201,168,76,0.12)" }}>
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.2)" }}>
                      <DollarSign size={12} style={{ color: "#C9A84C" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="flex items-center gap-2">
                        <span style={{ color: "#C9A84C", fontSize: "13px", fontFamily: "monospace", fontWeight: 700 }}>
                          ${p.amountUsd.toFixed(2)}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px" }}>
                          ≈ {p.amountSol.toFixed(4)} SOL
                        </span>
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "8px" }}>{fmtDate(p.createdAt)}</div>
                    </div>
                    <a href={`https://solscan.io/tx/${p.txHash}`} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} style={{ color: "rgba(201,168,76,0.4)" }} />
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Recent referral trades */}
            {recentTrades.length > 0 && (
              <div className="space-y-2">
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.1em" }}>
                  СДЕЛКИ РЕФЕРАЛОВ
                </div>
                {recentTrades.map((t, i) => (
                  <div key={i} className="rounded-2xl px-4 py-3 flex items-center gap-3"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: t.paid ? "rgba(201,168,76,0.08)" : "rgba(255,171,0,0.08)",
                        border: t.paid ? "1px solid rgba(201,168,76,0.2)" : "1px solid rgba(255,171,0,0.2)" }}>
                      <ChevronRight size={12} style={{ color: t.paid ? "#C9A84C" : "#ffab00" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="flex items-center gap-2">
                        <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "11px", fontFamily: "monospace" }}>{t.from}</span>
                        <span style={{ fontSize: "7px", padding: "1px 5px", borderRadius: "12px",
                          background: t.paid ? "rgba(201,168,76,0.08)" : "rgba(255,171,0,0.08)",
                          border: t.paid ? "1px solid rgba(201,168,76,0.2)" : "1px solid rgba(255,171,0,0.2)",
                          color: t.paid ? "#C9A84C" : "#ffab00" }}>
                          {t.paid ? "ОПЛАЧЕНО" : "В ОЧЕРЕДИ"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "8px" }}>{fmtDate(t.createdAt)}</span>
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontFamily: "monospace" }}>
                          объём {fmt(t.volumeUsd)} → доход <span style={{ color: "#C9A84C" }}>${t.referralUsd.toFixed(3)}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {payouts.length === 0 && recentTrades.length === 0 && (
              <div className="text-center py-12">
                <DollarSign size={36} style={{ color: "rgba(201,168,76,0.15)", margin: "0 auto 10px" }} />
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "12px" }}>Нет выплат</p>
                <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px", marginTop: "4px" }}>
                  Пригласи друга — выплаты появятся здесь
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
