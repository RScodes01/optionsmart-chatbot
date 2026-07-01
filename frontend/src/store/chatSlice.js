/**
 * chatSlice.js — Redux Toolkit slice for the OptionSmart chatbot
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

// ─────────────────────────────────────────
// Async thunks
// ─────────────────────────────────────────

export const fetchTrades = createAsyncThunk('chat/fetchTrades', async (_, { rejectWithValue }) => {
  try {
    const res = await axios.get('/api/journal/trades');
    return res.data.trades;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || err.message);
  }
});

export const saveTrade = createAsyncThunk('chat/saveTrade', async (trade, { rejectWithValue }) => {
  try {
    const res = await axios.post('/api/journal/trades', trade);
    return { ...trade, _id: res.data.id };
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || err.message);
  }
});

export const deleteTrade = createAsyncThunk('chat/deleteTrade', async (id, { rejectWithValue }) => {
  try {
    await axios.delete(`/api/journal/trades/${id}`);
    return id;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || err.message);
  }
});

export const fetchZerodhaStatus = createAsyncThunk('chat/fetchZerodhaStatus', async (_, { rejectWithValue }) => {
  try {
    const res = await axios.get('/api/zerodha/status');
    return res.data;
  } catch {
    return { connected: false, apiKeyConfigured: false };
  }
});

export const exchangeZerodhaToken = createAsyncThunk(
  'chat/exchangeZerodhaToken',
  async (requestToken, { rejectWithValue }) => {
    try {
      const res = await axios.post('/api/zerodha/token', { requestToken });
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

export const fetchMarketData = createAsyncThunk('chat/fetchMarketData', async () => {
  const res = await axios.get('/api/zerodha/market-data');
  return res.data.quotes;
});

// ─────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────
const initialState = {
  // Chat
  sessions: [],           // [{ id, title, messages[], updatedAt }]
  currentSessionId: null,
  isStreaming: false,
  lang: localStorage.getItem('os_lang') || 'en',

  // Trade Journal
  trades: [],
  tradesLoading: false,

  // Zerodha
  zerodha: {
    connected: false,
    apiKeyConfigured: false,
    expiresInSeconds: 0,
  },
  marketData: {},

  // UI
  toast: null,
};

// ─────────────────────────────────────────
// Slice
// ─────────────────────────────────────────
const chatSlice = createSlice({
  name: 'chat',
  initialState,

  reducers: {
    setLang(state, { payload }) {
      state.lang = payload;
      localStorage.setItem('os_lang', payload);
    },

    startNewSession(state) {
      state.currentSessionId = null;
    },

    loadSession(state, { payload: sessionId }) {
      state.currentSessionId = sessionId;
    },

    addUserMessage(state, { payload: { text, sessionId } }) {
      const session = state.sessions.find(s => s.id === sessionId);
      if (!session) return;
      session.messages.push({
        role: 'user',
        content: text,
        ts: new Date().toISOString(),
      });
      session.updatedAt = Date.now();
    },

    addBotMessage(state, { payload: { text, sessionId, source } }) {
      const session = state.sessions.find(s => s.id === sessionId);
      if (!session) return;
      session.messages.push({
        role: 'assistant',
        content: text,
        ts: new Date().toISOString(),
        source, // 'cache' | 'claude' | 'rag'
      });
      session.updatedAt = Date.now();
    },

    appendStreamDelta(state, { payload: { delta, sessionId } }) {
      const session = state.sessions.find(s => s.id === sessionId);
      if (!session) return;
      const last = session.messages[session.messages.length - 1];
      if (last && last.role === 'assistant' && last.streaming) {
        last.content += delta;
      } else {
        session.messages.push({
          role: 'assistant',
          content: delta,
          ts: new Date().toISOString(),
          streaming: true,
        });
      }
    },

    finalizeStreamMessage(state, { payload: { sessionId, source } }) {
      const session = state.sessions.find(s => s.id === sessionId);
      if (!session) return;
      const last = session.messages[session.messages.length - 1];
      if (last && last.streaming) {
        last.streaming = false;
        last.source = source;
      }
      state.isStreaming = false;
    },

    setStreaming(state, { payload }) {
      state.isStreaming = payload;
    },

    createSession(state, { payload: { id, title } }) {
      state.sessions.unshift({ id, title, messages: [], updatedAt: Date.now() });
      state.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      state.currentSessionId = id;
    },

    deleteSession(state, { payload: sessionId }) {
      state.sessions = state.sessions.filter(s => s.id !== sessionId);
      if (state.currentSessionId === sessionId) {
        state.currentSessionId = state.sessions[0]?.id || null;
      }
    },

    showToast(state, { payload: { message, type = 'info' } }) {
      state.toast = { message, type, id: Date.now() };
    },

    clearToast(state) {
      state.toast = null;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchTrades.pending, (state) => { state.tradesLoading = true; })
      .addCase(fetchTrades.fulfilled, (state, { payload }) => {
        state.trades = payload;
        state.tradesLoading = false;
      })
      .addCase(fetchTrades.rejected, (state) => { state.tradesLoading = false; })

      .addCase(saveTrade.fulfilled, (state, { payload }) => {
        state.trades.unshift(payload);
      })

      .addCase(deleteTrade.fulfilled, (state, { payload: id }) => {
        state.trades = state.trades.filter(t => (t._id || t.id) !== id);
      })

      .addCase(fetchZerodhaStatus.fulfilled, (state, { payload }) => {
        state.zerodha = { ...state.zerodha, ...payload };
      })

      .addCase(exchangeZerodhaToken.fulfilled, (state) => {
        state.zerodha.connected = true;
      })

      .addCase(fetchMarketData.fulfilled, (state, { payload }) => {
        state.marketData = payload;
      });
  },
});

export const {
  setLang, startNewSession, loadSession,
  addUserMessage, addBotMessage, appendStreamDelta,
  finalizeStreamMessage, setStreaming,
  createSession, deleteSession,
  showToast, clearToast,
} = chatSlice.actions;

// ─────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────
export const selectCurrentSession = (state) =>
  state.chat.sessions.find(s => s.id === state.chat.currentSessionId);

export const selectCurrentMessages = (state) =>
  selectCurrentSession(state)?.messages || [];

export const selectHistory = (state) =>
  (selectCurrentMessages(state))
    .filter(m => !m.streaming)
    .reduce((acc, m, i, arr) => {
      if (m.role === 'user') {
        const next = arr[i + 1];
        if (next?.role === 'assistant') {
          acc.push({ user: m.content, bot: next.content });
        }
      }
      return acc;
    }, []);

export default chatSlice.reducer;
