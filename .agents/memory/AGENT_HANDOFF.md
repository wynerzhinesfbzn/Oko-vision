# 🤖 ПАМЯТКА ДЛЯ СЛЕДУЮЩЕГО АГЕНТА — OKO VISION

> Дата: 15 июля 2026. Репо: `https://github.com/wynerzhinesfbzn/Oko-vision.git` (ветка `main`)

---

## 📁 СТРУКТУРА ПРОЕКТА

```
/home/runner/workspace/
├── artifacts/
│   ├── api-server/          ← Express API сервер (порт 8080)
│   │   └── src/routes/
│   │       ├── scan.ts      ← Основной маршрут /api/scan + /api/screener
│   │       └── screener.ts  ← Puppeteer scraper для DexScreener
│   └── oko-vision/          ← React/Vite фронтенд (основное приложение)
│       └── src/
│           ├── pages/
│           │   ├── Signals.tsx      ← Страница сигналов (9 стратегий)
│           │   └── Trading.tsx      ← Торговая страница
│           └── lib/
│               └── tradingEngine.ts ← Стратегии + фильтры токенов
├── .agents/memory/           ← Память агента (ЧИТАЙ ВСЕГДА СНАЧАЛА)
│   ├── MEMORY.md             ← Индекс всей памяти
│   ├── AGENT_HANDOFF.md      ← ЭТА ПАМЯТКА
│   ├── dexscreener-screener-scraper.md
│   ├── autotrader-arch.md
│   └── trading-context-multi-strategy.md
└── pnpm-workspace (монорепо)
```

---

## 🔑 КРИТИЧЕСКИЕ КЛЮЧИ И СЕКРЕТЫ

| Ключ | Где взять | Для чего |
|------|-----------|----------|
| `SESSION_SECRET` | Replit Secrets (уже добавлен) | Express сессии |
| GitHub PAT | Пользователь предоставляет в скриншоте | `git push https://TOKEN@github.com/wynerzhinesfbzn/Oko-vision.git main` |

> ⚠️ PAT из скриншота (ghp_jubsX5C...) — использовался для пуша 15 июля. Пользователь должен его отозвать и создать новый.

---

## 🚀 КАК ЗАПУСКАТЬ

```bash
# API сервер (порт 8080)
pnpm --filter @workspace/api-server run dev

# Frontend (React/Vite)
pnpm --filter @workspace/oko-vision run dev

# Workflows уже настроены в Replit — просто рестарт через WorkflowsRestart
```

---

## 📡 API ЭНДПОИНТЫ

| Маршрут | Описание |
|---------|----------|
| `GET /api/scan?chain=solana&type=all` | Сканирование Solana (только pumpswap миграции, 55 поисковых терминов) |
| `GET /api/scan?chain=robinhood&type=all` | Сканирование Robinhood Chain (chainId=robinhood) |
| `GET /api/screener?url=<encoded_dex_url>` | Headless-браузер скрапер DexScreener (для Ultra Safe) |
| `GET /api/price/:mint` | Цена токена |
| `POST /api/rpc` | Прокси к Solana RPC |
| `GET /api/jupiter/quote` | Jupiter V6 котировки |

---

## 🛡️ ULTRA SAFE СТРАТЕГИЯ — КАК РАБОТАЕТ

### Проблема
DexScreener screener URL (`https://dexscreener.com/?rankBy=trendingScoreH6&...`) защищён Cloudflare и не доступен через обычный HTTP.

### Решение (файл `artifacts/api-server/src/routes/screener.ts`)
1. **puppeteer-extra + stealth plugin** — обходит Cloudflare bot detection
2. **Nix-chromium** (НЕ playwright bundled!) — путь: `/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium`
3. Ждём 18 секунд → данные приходят через WebSocket и рендерятся в DOM
4. Извлекаем адреса пар из `<a href="/solana/ADDR">` ссылок
5. Запрашиваем полные данные через **публичный** DexScreener API: `/latest/dex/pairs/solana/{addr}`

### Важные детали
- Системные либы (glib, nss, mesa, chromium и др.) установлены через Nix
- `puppeteer-extra` и `puppeteer-extra-plugin-stealth` в externals esbuild (в `build.mjs`)
- Кеш: 60с живой + `_lastGood` без expiry (возвращается при CF-блокировке)
- **НИКОГДА не кешировать пустые результаты!**

### Screener URL для Ultra Safe
```
https://dexscreener.com/?rankBy=trendingScoreH6&order=desc&chainIds=solana&dexIds=pumpswap&minLiq=50000&minMarketCap=800000&minAge=20&profile=1
```

---

## 🎯 9 СТРАТЕГИЙ (`tradingEngine.ts`)

| ID | Название | MCAP | LIQ | AI Score |
|----|----------|------|-----|----------|
| `ultra-safe` | Ultra Safe Post-Migration | 800K–5M | ≥50K | ≥65 + BUY |
| `safe-migration` | Safe Migration Hold | 450K–1.8M | ≥55K | ≥65 + BUY |
| `balanced` | Balanced Alpha Filter | 150K–500K | ≥20K | ≥56 + BUY |
| `early-migration` | Early Migration Alpha v6 | 100K–350K | ≥15K | ≥56 + BUY |
| `vol-spike` | Volume Spike Sniper | 50K–200K | ≥10K | ≥50 |
| `degen-launch` | Degen Launch Hunter | 20K–120K | ≥5K | ≥45 |
| `smart-money` | Smart Money Flow | 500K–3M | ≥40K | ≥60 |
| `hype-cycle` | Hype Cycle Surfer | 80K–600K | ≥8K | ≥48 |
| `dip-recovery` | Dip Recovery | 200K–2M | ≥25K | ≥55 |

---

## 🔄 СКАНИРОВАНИЕ SOLANA (`scan.ts` → `scanSolana()`)

- **Только pumpswap** — хард-фильтр `dexId === "pumpswap"` (PumpFun→PumpSwap миграции)
- 55 тематических поисковых терминов через DexScreener search API
- Chain-native источники: token-profiles, top/latest boosts
- Лик. порог для сканирования: $2K
- `pairCreatedAt` уже в ms (не умножать на 1000!)

## 🔴 СКАНИРОВАНИЕ ROBINHOOD (`scan.ts` → `scanRobinhood()`)

- Chain-native подход: token-profiles + boosts с `chainId === "robinhood"`
- 28 generic meme-термина (НЕ "robin"/"robinhood" ключевые слова!)
- Activity filter: `change24h` как fallback (vol1h ненадёжен на Robinhood chain)
- Результат: ~120 токенов, ~54 совпадения со стратегиями

---

## 🐛 КАК ИСПРАВЛЯТЬ ОШИБКИ

### Chromium не запускается
```
error while loading shared libraries: libgbm.so.1
```
→ Установить через nix: `installSystemDependencies({ packages: ["chromium"] })`
→ НЕ использовать playwright bundled binary для запуска

### Cloudflare блокирует screener
→ Проверить: `page.title()` содержит "moment"/"security" → это блок
→ Вернуть `_lastGood` (последний удачный результат)
→ НЕ кешировать пустые результаты

### esbuild не может resolve "puppeteer-extra"
→ Добавить в `external` массив в `artifacts/api-server/build.mjs`:
```js
"puppeteer-extra", "puppeteer-extra-plugin-stealth"
```

### API сервер не собирается
```bash
cd artifacts/api-server && pnpm run build
# Смотреть ошибки, чаще всего TypeScript типы или missing externals
```

### Push на GitHub отклонён
```bash
git pull https://TOKEN@github.com/wynerzhinesfbzn/Oko-vision.git main --rebase
git push https://TOKEN@github.com/wynerzhinesfbzn/Oko-vision.git main
```

### Screener возвращает 0 пар
1. Проверить что `_cache` в screener.ts не содержит пустой закешированный результат
2. Перезапустить API сервер
3. Проверить что nix chromium путь актуален (может меняться при обновлении пакета)

---

## 📊 FRONTEND (`Signals.tsx`) — КАК УСТРОЕНО

```
Signals.tsx
├── fetchTokens(chain)          → /api/scan?chain=X  (Solana: 111 токенов, Robinhood: ~120)
├── fetchScreenerTokens()       → /api/screener?url=ULTRA_SAFE_URL  (100 токенов)
│
├── solTokens[]    — для стратегий 1-9 на Solana
├── screenerTokens[]  — только для Ultra Safe (стратегия #0)
└── rhTokens[]     — для всех стратегий на Robinhood Chain

Intervals:
├── loadSolana():    каждые 45с
├── loadScreener():  каждые 90с (браузер загружается ~18-20с)
└── loadRobinhood(): lazy (только при первом открытии вкладки)
```

### UI компоненты
- `SignalCard` — карточка токена с AI score, метриками, бейджем PumpFun→PumpSwap
- `StrategyPanel` — список карточек для одной стратегии
- Purple info bar — показывается только для Ultra Safe, содержит кол-во токенов и кнопку Refresh

---

## 💾 ПАМЯТЬ АГЕНТА

Всегда читай перед работой:
```
.agents/memory/MEMORY.md  ← индекс
.agents/memory/dexscreener-screener-scraper.md  ← детали screener
.agents/memory/autotrader-arch.md  ← AutoTrader/PositionMonitor
.agents/memory/trading-context-multi-strategy.md  ← multi-strategy localStorage
```

После работы обновляй `.agents/memory/MEMORY.md` и добавляй topic-файлы.

---

## 🗂️ КЛЮЧЕВЫЕ ФАЙЛЫ И ЧТО ОНИ ДЕЛАЮТ

| Файл | Назначение |
|------|-----------|
| `artifacts/api-server/src/routes/scan.ts` | Все API маршруты: /api/scan, /api/screener, /api/price, /api/rpc прокси |
| `artifacts/api-server/src/routes/screener.ts` | Puppeteer scraper: Cloudflare bypass + DOM extraction + public API fetch |
| `artifacts/api-server/build.mjs` | esbuild конфиг — externals список критичен |
| `artifacts/oko-vision/src/pages/Signals.tsx` | Главная страница сигналов: 9 стратегий, 2 сети |
| `artifacts/oko-vision/src/lib/tradingEngine.ts` | Все 9 стратегий, `tokenMatchesStrategy()`, `scoreTokenForStrategy()` |
| `artifacts/oko-vision/src/pages/Trading.tsx` | Торговая страница с Jupiter V6 |
| `replit.nix` | Системные зависимости (glib, chromium, alsa-lib и др.) |
| `artifacts/api-server/build.mjs` | esbuild externals (playwright, puppeteer-extra и др.) |

---

## ✅ ЧТО БЫЛО СДЕЛАНО В ЭТОЙ СЕССИИ

1. **Solana scan** — только pumpswap миграции, 55 поисковых терминов, хард-фильтр dexId==="pumpswap"
2. **Robinhood scan** — chain-native подход, 28 meme-терминов, фильтр chainId==="robinhood"
3. **Ultra Safe thresholds** — liquidityMin: 50K (было 120K), mcapMin: 800K, mcapMax: 5M
4. **DexScreener screener** — полный pipeline: puppeteer-extra+stealth → DOM extraction → public API → 100 пар
5. **Cloudflare bypass** — system chromium из nixpkgs вместо playwright bundled (решает libgbm проблему)
6. **Кеш архитектура** — _lastGood fallback, не кешируем пустые результаты, убрали двойное кеширование
7. **Signals.tsx** — Ultra Safe использует screener endpoint, purple info bar, 90s refresh
8. **GitHub push** — репо `wynerzhinesfbzn/Oko-vision`, ветка `main`

---

## 🔮 ЧТО МОЖЕТ ПОТРЕБОВАТЬСЯ ДАЛЬШЕ

- Обновить путь к nix chromium если изменится версия (найти через `find /nix/store -name chromium -type f | grep bin`)
- Добавить retry-логику в screener (сейчас 1 попытка, CF блокирует ~20% запросов)
- Улучшить WebSocket parsing вместо DOM extraction (чище, но нужен protobuf декодер)
- Добавить новые стратегии в tradingEngine.ts и обновить matchCounts логику в Signals.tsx
