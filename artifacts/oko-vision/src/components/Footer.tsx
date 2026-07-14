import { useState } from "react";
import { X } from "lucide-react";

// ── Content for each legal/info page ────────────────────────────────────────

const PAGES: Record<string, { title: string; subtitle: string; body: React.ReactNode }> = {

  Privacy: {
    title: "PRIVACY POLICY",
    subtitle: "Last updated: March 2026",
    body: (
      <div className="space-y-5">
        <Section title="1. Who We Are">
          OKO Vision Terminal ("OKO", "we", "us") is a non-custodial, browser-based trading interface built on the Solana blockchain. We do not hold your funds, control your private keys, or store your seed phrases on our servers — ever.
        </Section>
        <Section title="2. Data We Collect">
          <ul className="space-y-2 mt-1">
            <Li>Public wallet addresses you choose to connect or display within the terminal.</Li>
            <Li>Anonymous usage analytics (page views, feature interactions) collected without any personally identifiable information.</Li>
            <Li>Technical data: browser type, device type, and approximate timezone for performance optimization.</Li>
          </ul>
          We do <Em>not</Em> collect: your name, email, phone number, IP address logs tied to identity, or any financial account information.
        </Section>
        <Section title="3. Seed Phrases & Private Keys">
          OKO Vision operates entirely in your browser. Any seed phrase or private key you enter is processed locally using AES-256-GCM encryption and stored only in your device's local storage. <Em>It never leaves your device.</Em> OKO Vision employees and systems have zero access to your keys at any time.
        </Section>
        <Section title="4. On-Chain Data">
          All transactions you initiate are broadcast to the Solana blockchain — a public, immutable ledger. By using OKO Vision you acknowledge that on-chain activity is publicly visible by design.
        </Section>
        <Section title="5. Third-Party Services">
          OKO Vision interfaces with the following external APIs to provide market data:
          <ul className="space-y-1 mt-1">
            <Li>DexScreener — token price and pool data</Li>
            <Li>Jupiter Aggregator — swap routing</Li>
            <Li>RugCheck — token security scoring</Li>
            <Li>CoinGecko — market cap and global metrics</Li>
          </ul>
          Each provider operates under their own privacy policy. We transmit only the minimum data required (e.g., token addresses) to fetch results.
        </Section>
        <Section title="6. Cookies & Storage">
          We use browser localStorage to persist your wallet preferences and UI settings between sessions. No third-party tracking cookies are deployed. You may clear your browser storage at any time to remove all locally stored OKO data.
        </Section>
        <Section title="7. Data Retention">
          Since we store no personal data on our servers, there is nothing to delete on our end. Your local browser data is fully under your control.
        </Section>
        <Section title="8. Contact">
          Privacy concerns: <Gold>privacy@okovision.io</Gold>
        </Section>
      </div>
    ),
  },

  Terms: {
    title: "TERMS OF SERVICE",
    subtitle: "Effective: March 2026",
    body: (
      <div className="space-y-5">
        <Section title="1. Acceptance">
          By accessing or using OKO Vision Terminal, you agree to be bound by these Terms of Service. If you do not agree, do not use this platform. These terms constitute a legally binding agreement between you and OKO Vision.
        </Section>
        <Section title="2. Nature of Service">
          OKO Vision is a <Em>non-custodial trading interface</Em>. We provide a graphical layer over public blockchain infrastructure and third-party DEX protocols. We do not:
          <ul className="space-y-1 mt-1">
            <Li>Hold, control, or insure your digital assets</Li>
            <Li>Act as a broker, dealer, financial advisor, or exchange</Li>
            <Li>Guarantee execution of any trade or the availability of any token</Li>
          </ul>
        </Section>
        <Section title="3. Eligibility">
          You must be at least 18 years of age. You represent that you are not located in, or a citizen of, any jurisdiction where use of decentralized trading platforms is prohibited or restricted by law, including but not limited to: OFAC sanctioned territories, the United States (where certain DeFi regulations may apply), and regions with total cryptocurrency bans.
        </Section>
        <Section title="4. Risk Disclosure">
          <Em>Cryptocurrency trading carries substantial risk of loss.</Em> Token prices can move 100% in either direction within minutes. You may lose your entire invested capital. OKO Vision provides information and tooling only — not investment advice. Never trade with funds you cannot afford to lose.
        </Section>
        <Section title="5. No Warranty">
          OKO Vision is provided "as is" and "as available" without warranties of any kind. We do not guarantee uninterrupted access, accuracy of market data, or successful execution of transactions. Network congestion, RPC failures, or smart contract bugs may cause unexpected outcomes.
        </Section>
        <Section title="6. Limitation of Liability">
          To the maximum extent permitted by applicable law, OKO Vision and its contributors shall not be liable for any direct, indirect, incidental, special, or consequential damages arising from your use of the platform, including but not limited to trading losses, failed transactions, or security breaches of your own device.
        </Section>
        <Section title="7. Prohibited Conduct">
          <ul className="space-y-1">
            <Li>Attempting to exploit, hack, or disrupt OKO Vision systems</Li>
            <Li>Using automated bots to scrape or abuse our APIs</Li>
            <Li>Using OKO Vision for money laundering or sanctioned activities</Li>
            <Li>Impersonating OKO Vision or its team members</Li>
          </ul>
        </Section>
        <Section title="8. Intellectual Property">
          The OKO Vision name, logo, interface design, and codebase are proprietary. You may not reproduce, redistribute, or create derivative products without written consent.
        </Section>
        <Section title="9. Governing Law">
          These Terms shall be governed by the laws of the applicable jurisdiction. Disputes shall be resolved by binding arbitration, not class action or jury trial.
        </Section>
        <Section title="10. Changes">
          We may update these Terms at any time. Continued use after changes constitutes acceptance. We will note the update date above.
        </Section>
        <Section title="11. Contact">
          Legal inquiries: <Gold>legal@okovision.io</Gold>
        </Section>
      </div>
    ),
  },

  Support: {
    title: "SUPPORT",
    subtitle: "OKO Vision Help Center",
    body: (
      <div className="space-y-5">
        <Section title="Frequently Asked Questions">{"" as any}</Section>

        <FAQ q="My wallet connected but I see no balance.">
          Balance data is fetched live from the Solana RPC network. If your balance shows zero, try: (1) wait 10–15 seconds and refresh, (2) check your RPC connection status in the terminal header, (3) ensure you are on Solana mainnet-beta.
        </FAQ>
        <FAQ q="A swap failed — what happened?">
          Swap failures occur due to: slippage exceeded, insufficient SOL for gas fees (keep ≥ 0.01 SOL in your wallet), RPC congestion, or a pool with insufficient liquidity. Review the error message in the Trading panel and retry with adjusted slippage.
        </FAQ>
        <FAQ q="Where is my seed phrase stored?">
          Your seed phrase never leaves your device. It is encrypted with AES-256-GCM and stored only in your browser's localStorage. OKO Vision servers cannot access it under any circumstances.
        </FAQ>
        <FAQ q="What wallets are supported?">
          OKO Vision supports: Phantom, Solflare, Backpack, and any wallet compatible with the Solana Wallet Adapter standard. You can also create or import a wallet directly within the terminal using a seed phrase.
        </FAQ>
        <FAQ q="How are swap fees calculated?">
          Swaps use Jupiter's routing which finds the best price across all Solana DEXes. Standard Solana network fees (~$0.001) apply. There are no additional hidden fees.
        </FAQ>
        <FAQ q="Can I use OKO Vision on desktop?">
          OKO Vision is optimized as a mobile-first PWA. Desktop browsers are supported but the experience is designed for mobile screens. Install it as a PWA via your browser's "Add to Home Screen" for the best experience.
        </FAQ>
        <FAQ q="A token shows 'DANGER' or 'HIGH RISK'.">
          OKO Vision integrates RugCheck's security scoring. Tokens flagged as high risk exhibit patterns associated with: honeypots, frozen liquidity, excessive developer allocations, or copy-contract attacks. Proceed with extreme caution — we do not block trades, but we will always inform you.
        </FAQ>
        <FAQ q="How do I export or back up my wallets?">
          Navigate to your Wallet panel → tap the wallet name → select "Show Seed Phrase". Save your 12-word phrase in a secure offline location. OKO Vision does not provide cloud backup — your security is your responsibility.
        </FAQ>

        <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.15)", marginTop: 8 }}>
          <p style={{ color: "#C9A84C", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6 }}>CONTACT SUPPORT</p>
          <p style={{ color: "rgba(240,235,224,0.45)", fontSize: "11px", lineHeight: 1.7 }}>
            Email: <Gold>support@okovision.io</Gold><br />
            Telegram: <Gold>@okovision_support</Gold><br />
            Response time: within 24 hours on business days.
          </p>
          <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px", marginTop: 8 }}>
            OKO Vision will <Em>never</Em> DM you first, ask for your seed phrase, or request remote access to your device. All official communications come from @okovision.io addresses only.
          </p>
        </div>
      </div>
    ),
  },

  API: {
    title: "API REFERENCE",
    subtitle: "OKO Vision Developer Access",
    body: (
      <div className="space-y-5">
        <Section title="Overview">
          The OKO Vision API provides programmatic access to the same market data, token security scores, and portfolio analytics available in the terminal. Built for algorithmic traders, bot developers, and institutional integrations on Solana.
        </Section>

        <div style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.12)" }}>
          <p style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>BASE URL</p>
          <code style={{ color: "#F0EBE0", fontSize: "11px", fontFamily: "monospace" }}>https://api.okovision.io/v1</code>
        </div>

        <Section title="Authentication">
          All API requests require a Bearer token in the Authorization header:
          <CodeBlock>Authorization: Bearer {'<YOUR_API_KEY>'}</CodeBlock>
          API keys are available on request during our private beta. Apply via <Gold>api@okovision.io</Gold>
        </Section>

        <Section title="Endpoints">
          <EndpointRow method="GET" path="/markets" desc="Top tokens by volume, sorted by 24h activity" />
          <EndpointRow method="GET" path="/token/:address" desc="Full token profile — price, volume, liquidity, holder count" />
          <EndpointRow method="GET" path="/token/:address/risk" desc="RugCheck security score and risk flags" />
          <EndpointRow method="GET" path="/portfolio/:wallet" desc="Full portfolio snapshot for a Solana wallet address" />
          <EndpointRow method="GET" path="/swap/quote" desc="Jupiter V6 swap quote (params: inputMint, outputMint, amount)" />
          <EndpointRow method="POST" path="/swap/execute" desc="Execute a signed swap transaction (requires wallet signing)" />
        </Section>

        <Section title="Rate Limits">
          <ul className="space-y-1">
            <Li>Free tier: 100 requests / minute</Li>
            <Li>Pro tier: 2,000 requests / minute</Li>
            <Li>Institutional: unlimited (contact us)</Li>
          </ul>
        </Section>

        <Section title="SDKs & Examples">
          JavaScript SDK, Python client, and Postman collection available at:<br />
          <Gold>github.com/okovision/api-sdk</Gold> (private beta — request access)
        </Section>

        <Section title="Webhooks">
          Subscribe to real-time events: price alerts, wallet activity, and risk flag changes. Webhook delivery uses signed HMAC-SHA256 payloads for verification.
        </Section>

        <Section title="Status">
          API uptime and incident history: <Gold>status.okovision.io</Gold>
        </Section>
      </div>
    ),
  },

  Careers: {
    title: "CAREERS",
    subtitle: "Join the OKO Vision team",
    body: (
      <div className="space-y-5">
        <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
          <p style={{ color: "#C9A84C", fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", marginBottom: 6 }}>
            BUILT BY TRADERS, FOR TRADERS
          </p>
          <p style={{ color: "rgba(240,235,224,0.4)", fontSize: "11px", lineHeight: 1.75 }}>
            OKO Vision is assembling a small, elite team obsessed with precision, speed, and transparency in DeFi. We do not hire for headcount — we hire for impact.
          </p>
        </div>

        <Section title="Our Culture">
          <ul className="space-y-2">
            <Li>Remote-first, async-friendly, results-driven</Li>
            <Li>No bureaucracy — your work ships directly to users</Li>
            <Li>Competitive compensation in USDC + token allocation</Li>
            <Li>Deep respect for technical craft and design excellence</Li>
          </ul>
        </Section>

        <Section title="Open Roles">
          <RoleCard
            title="Senior Solana Engineer"
            type="Full-time · Remote"
            desc="Deep expertise in Rust and Solana program development. Experience with Anchor, Jupiter SDK, and on-chain protocol design required."
          />
          <RoleCard
            title="Frontend Engineer — TypeScript / React"
            type="Full-time · Remote"
            desc="Expert-level React, Vite, and TypeScript. Experience building financial UIs, real-time data visualization, and performance-critical applications."
          />
          <RoleCard
            title="DeFi Research Analyst"
            type="Part-time · Remote"
            desc="Deep understanding of Solana DeFi ecosystem — DEXes, liquidity pools, MEV, and token economics. Ability to translate on-chain data into actionable intelligence."
          />
          <RoleCard
            title="Product Designer"
            type="Full-time · Remote"
            desc="Luxury-grade UI/UX with a trader's eye. Experience designing complex financial dashboards, mobile-first PWAs, and high-density data interfaces."
          />
        </Section>

        <Section title="Don't See Your Role?">
          We occasionally hire exceptional individuals who don't fit a predefined box. If you are world-class at what you do and believe in what OKO Vision is building, reach out.
        </Section>

        <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.15)" }}>
          <p style={{ color: "#C9A84C", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6 }}>APPLY</p>
          <p style={{ color: "rgba(240,235,224,0.45)", fontSize: "11px", lineHeight: 1.7 }}>
            Send your portfolio, GitHub, or relevant work to:<br />
            <Gold>careers@okovision.io</Gold>
          </p>
          <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px", marginTop: 8 }}>
            We review every application. Expect a response within 5 business days if there is a fit.
          </p>
        </div>
      </div>
    ),
  },
};

// ── Shared sub-components ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" }}>
        {title}
      </p>
      <div style={{ color: "rgba(240,235,224,0.5)", fontSize: "11.5px", lineHeight: 1.8 }}>
        {children}
      </div>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ color: "rgba(240,235,224,0.45)", fontSize: "11.5px", lineHeight: 1.75, paddingLeft: 8, position: "relative" }}>
      <span style={{ position: "absolute", left: 0, color: "#C9A84C" }}>·</span>
      <span style={{ marginLeft: 6 }}>{children}</span>
    </li>
  );
}

function Em({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#F0EBE0", fontWeight: 600 }}>{children}</span>;
}

function Gold({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#C9A84C" }}>{children}</span>;
}

function FAQ({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 12 }}>
      <p style={{ color: "#F0EBE0", fontSize: "11.5px", fontWeight: 600, marginBottom: 4 }}>{q}</p>
      <p style={{ color: "rgba(240,235,224,0.4)", fontSize: "11px", lineHeight: 1.75 }}>{children}</p>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: "8px 0", padding: "10px 12px", borderRadius: 6, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <code style={{ color: "#C9A84C", fontSize: "11px", fontFamily: "monospace" }}>{children}</code>
    </div>
  );
}

function EndpointRow({ method, path, desc }: { method: string; path: string; desc: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <span style={{
          fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: 3,
          background: method === "GET" ? "rgba(0,200,100,0.12)" : "rgba(201,168,76,0.12)",
          color: method === "GET" ? "#00c864" : "#C9A84C",
          fontFamily: "monospace", letterSpacing: "0.05em",
        }}>{method}</span>
        <code style={{ color: "#F0EBE0", fontSize: "11px", fontFamily: "monospace" }}>{path}</code>
      </div>
      <p style={{ color: "rgba(240,235,224,0.35)", fontSize: "10.5px", paddingLeft: 2 }}>{desc}</p>
    </div>
  );
}

function RoleCard({ title, type, desc }: { title: string; type: string; desc: string }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 10 }}>
      <p style={{ color: "#F0EBE0", fontSize: "12px", fontWeight: 600, marginBottom: 2 }}>{title}</p>
      <p style={{ color: "#C9A84C", fontSize: "9.5px", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 6 }}>{type}</p>
      <p style={{ color: "rgba(240,235,224,0.38)", fontSize: "11px", lineHeight: 1.65 }}>{desc}</p>
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

function LegalModal({ page, onClose }: { page: string; onClose: () => void }) {
  const data = PAGES[page];
  if (!data) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(8,8,8,0.85)", backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex", alignItems: "flex-end",
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: "100%", maxWidth: 480, margin: "0 auto",
        background: "#0E0E0E",
        borderTop: "1px solid rgba(201,168,76,0.18)",
        borderRadius: "18px 18px 0 0",
        maxHeight: "88vh",
        display: "flex", flexDirection: "column",
      }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.12)" }} />
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "12px 20px 10px" }}>
          <div>
            <p style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "14px", fontWeight: 800, color: "#F0EBE0",
              letterSpacing: "0.08em",
            }}>{data.title}</p>
            <p style={{ color: "rgba(201,168,76,0.5)", fontSize: "9.5px", letterSpacing: "0.06em", marginTop: 2 }}>{data.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)",
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(201,168,76,0.08)", margin: "0 20px" }} />

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", padding: "20px 20px 40px", flex: 1 }}>
          {data.body}
        </div>

        {/* Bottom safe area */}
        <div style={{ height: "env(safe-area-inset-bottom, 16px)", background: "#0E0E0E" }} />
      </div>
    </div>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────

export default function Footer() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <footer
        className="px-4 py-8 max-w-lg mx-auto safe-bottom"
        style={{ borderTop: "1px solid rgba(201,168,76,0.07)" }}
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="12" stroke="#C9A84C" strokeWidth="1.5"/>
            <circle cx="24" cy="24" r="7" fill="rgba(201,168,76,0.1)" stroke="#C9A84C" strokeWidth="1"/>
            <circle cx="24" cy="24" r="3" fill="#C9A84C" opacity="0.9"/>
            <circle cx="24" cy="24" r="1.2" fill="#ffcc00"/>
            <line x1="24" y1="8" x2="24" y2="14" stroke="#C9A84C" strokeWidth="1.5" opacity="0.5"/>
            <line x1="24" y1="34" x2="24" y2="40" stroke="#C9A84C" strokeWidth="1.5" opacity="0.5"/>
            <line x1="8" y1="24" x2="14" y2="24" stroke="#C9A84C" strokeWidth="1.5" opacity="0.5"/>
            <line x1="34" y1="24" x2="40" y2="24" stroke="#C9A84C" strokeWidth="1.5" opacity="0.5"/>
          </svg>
          <span className="font-orbitron text-sm font-bold" style={{ color: "#C9A84C", letterSpacing: "0.1em" }}>
            OKO VISION
          </span>
        </div>

        {/* Tagline */}
        <p className="text-center mb-6" style={{ color: "rgba(255,255,255,0.25)", fontSize: "11px", lineHeight: 1.6 }}>
          Your Trusted Gateway to Infinite Gains.<br />
          <span style={{ color: "rgba(201,168,76,0.35)" }}>Built on absolute trust. Designed for every trader's success.</span>
        </p>

        {/* Links */}
        <div className="flex justify-center flex-wrap gap-4 mb-6">
          {(["Privacy", "Terms", "Support", "API", "Careers"] as const).map((link) => (
            <button
              key={link}
              onClick={() => setOpen(link)}
              className="transition-colors hover:opacity-70 active:scale-95"
              style={{
                color: "rgba(255,255,255,0.25)",
                fontSize: "10px",
                letterSpacing: "0.06em",
                fontFamily: "'Space Grotesk', sans-serif",
                textTransform: "uppercase",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 0",
              }}
            >
              {link}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px mb-4" style={{ background: "linear-gradient(90deg, transparent, rgba(201,168,76,0.1), transparent)" }} />

        {/* Bottom */}
        <div className="flex items-center justify-between">
          <span style={{ color: "rgba(255,255,255,0.15)", fontSize: "9px", fontFamily: "monospace" }}>
            © 2026 OKO Vision Terminal
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "#C9A84C", boxShadow: "0 0 6px #C9A84C" }} />
            <span style={{ color: "rgba(201,168,76,0.4)", fontSize: "9px", fontFamily: "monospace" }}>
              ALL SYSTEMS OPERATIONAL
            </span>
          </div>
        </div>
      </footer>

      {open && <LegalModal page={open} onClose={() => setOpen(null)} />}
    </>
  );
}
