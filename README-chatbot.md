# OptionSmart Chatbot — Integration Guide

## Overview

This folder contains the chatbot module ready to drop into your existing project:

```
chatbot/
  server/              → Copy contents into your existing Express server
    routes/chat.js     → POST /api/chat  (SSE), /coach, /insights
    routes/zerodha.js  → GET/POST /api/zerodha/*
    routes/journal.js  → CRUD /api/journal/trades
    services/ragService.js
    services/embeddingService.js
    data/faq.json
    scripts/seedFaq.js
  src/                 → Copy contents into your existing React/Vite src
    pages/ChatPage.jsx
    components/chat/   → All chat components
    store/chatSlice.js → Add reducer to your existing Redux store
    hooks/useChatStream.js
```

---

## Step 1 — Add Environment Variables

Add to your server's `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-api03-...

# Embedding provider: 'local' (free, default) or 'openai'
EMBEDDING_PROVIDER=local

# Zerodha Kite (app-level credentials — from developers.kite.trade)
ZERODHA_API_KEY=your_kite_api_key
ZERODHA_API_SECRET=your_kite_api_secret
```

---

## Step 2 — Install Dependencies

In your **server** directory:
```bash
npm install @anthropic-ai/sdk @xenova/transformers axios redis winston
```

In your **frontend** directory:
```bash
npm install uuid
```

---

## Step 3 — Mount Routes in Express

In your `server/index.js` (or `app.js`), add:

```js
const chatRoutes    = require('./routes/chat');
const zerodhaRoutes = require('./routes/zerodha');
const journalRoutes = require('./routes/journal');

// Make Redis client available to routes
app.locals.redis = redisClient;   // your existing Redis client
app.locals.db    = mongoDb;       // your existing MongoDB db instance

app.use('/api/chat',    chatRoutes);
app.use('/api/zerodha', zerodhaRoutes);
app.use('/api/journal', journalRoutes);
```

---

## Step 4 — Add Redux Reducer

In your `store/index.js` (or `store.js`):

```js
import chatReducer from './chatSlice';   // copy chatSlice.js into src/store/

const store = configureStore({
  reducer: {
    // ...your existing reducers
    chat: chatReducer,
  },
});
```

---

## Step 5 — Add the /chat Route

In your React Router config:

```jsx
import ChatPage from './pages/ChatPage';

// Inside your <Routes>
<Route path="/chat" element={<ChatPage />} />
```

---

## Step 6 — Seed the FAQ Knowledge Base

Run once after setup:

```bash
cd chatbot
node server/scripts/seedFaq.js
```

This embeds all 18 FAQ documents into Redis. Common questions (capital tiers, kill switch, SEBI compliance, etc.) will be answered directly from the cache — **zero Claude API tokens used**.

---

## Step 7 — Zerodha Auth (Optional)

1. Go to [developers.kite.trade](https://developers.kite.trade)
2. Create an app, set Redirect URL to your domain
3. Copy **API Key** and **API Secret** → add to `.env`
4. Each trading day: click "Zerodha" in the chatbot header → "Login with Zerodha"
5. After login, paste the `request_token` → the chatbot exchanges it **server-side** (no CORS issue)

The access token is stored in Redis with an 8h TTL. Live Nifty/VIX data is injected into every Claude prompt automatically.

---

## Redis Key Schema

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `faq:doc:{id}` | Hash | ∞ | RAG embeddings |
| `chat:cache:{sha256}` | String | 1h | Repeated question cache |
| `zerodha:quote:NIFTY` | String | 30s | Live Nifty tick |
| `zerodha:quote:INDIAVIX` | String | 30s | Live VIX tick |
| `zerodha:token:{uid}` | String | 8h | Per-user Kite access token |

---

## WhatsApp Number

Lead capture modal → **+91 8779328028**  
(Configured in `src/components/chat/LeadModal.jsx`, `WHATSAPP_NUMBER` constant)

---

## How RAG Works

```
User: "What is minimum investment?"
  ↓
1. Embed question (local model, free)
  ↓
2. Cosine similarity vs all FAQ vectors in Redis
  ↓
sim ≥ 0.82 → Return FAQ answer directly  ←── 0 Claude tokens!
  ↓
sim < 0.82 → Call Claude with top-3 FAQ snippets as context
           → Cache result for 1h
```

---

## Notes

- The **Anthropic API key lives on the server** — never exposed to the browser
- Zerodha token exchange is **server-side** — fixes the CORS bug in the original HTML file
- Trade Journal is stored in **MongoDB** — persists across devices (was localStorage before)
- All CSS classes are **`os-` prefixed** — no collisions with your Tailwind classes
