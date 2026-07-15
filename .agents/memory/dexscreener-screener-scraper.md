---
name: DexScreener Screener Scraper
description: How the /api/screener endpoint bypasses Cloudflare to fetch DexScreener screener data for Ultra Safe strategy
---

## Architecture

- DexScreener screener page (`dexscreener.com/?rankBy=...`) delivers data via **WebSocket** (protobuf binary), NOT HTTP JSON
- `io.dexscreener.com` is Cloudflare-protected — direct HTTP/WS from Node.js returns 403
- Direct WebSocket connection also fails (403 from CF)

## Solution

`puppeteer-extra` + `puppeteer-extra-plugin-stealth` on **nix-installed system Chromium** (not playwright's bundled binary which lacks `libgbm.so.1`):

1. Load the screener URL in stealth headless browser (bypasses Cloudflare JS challenge)
2. Wait 18s for challenge + WebSocket data to render in DOM
3. Extract pair addresses from `<a href="/solana/ADDR">` links
4. Fetch full data via public DexScreener API: `/latest/dex/pairs/solana/{addr}` (no Cloudflare)

## System Chromium Path

`/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium`

**Why:** playwright's bundled `chromium-headless-shell` crashes with `libgbm.so.1: cannot open shared object file` in Replit's NixOS. The nix-packaged `chromium` has all deps properly linked.

**System deps needed:** `glib nss nspr atk at-spi2-atk cups libdrm pango cairo xorg.libX11 xorg.libXcomposite xorg.libXdamage xorg.libXext xorg.libXfixes xorg.libXrandr xorg.libxcb mesa libxkbcommon expat alsa-lib dbus chromium`

## Caching Strategy

- `_cache` (Map): 60s TTL for live results
- `_lastGood` (Map): no expiry — last known-good result returned when CF blocks
- **Never cache empty results** — if 0 addresses extracted, return lastGood or empty without caching (so next call retries the browser)

## esbuild externals

Must add to `external` array in `build.mjs`: `"puppeteer-extra"`, `"puppeteer-extra-plugin-stealth"`

## Frontend Integration

Ultra Safe strategy in `Signals.tsx` uses a separate `fetchScreenerTokens()` that calls `/api/screener?url=...` instead of the regular scan endpoint. Refresh interval: 90s (browser launch takes ~18-20s, so 90s prevents overlap). Shows purple "DexScreener Screener · прямой источник" info bar with own Refresh button.

**Why:** The screener URL is the user's primary data source for Ultra Safe. Direct public API would miss tokens that only appear in the screener's trending ranking.

## Cloudflare Notes

- stealth plugin works ~80% of the time; sometimes CF still blocks (shows "Just a moment...")
- Detection: check `page.title()` for "moment"/"security"/"checking" — skip extraction if blocked
- Fallback: return `_lastGood` so UI shows stale but valid data rather than empty
