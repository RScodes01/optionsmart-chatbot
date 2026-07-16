/**
 * useFaqLookup.js
 * Custom hook for Quick Question dropdown answers.
 *
 * Calls POST /api/chat/faq -> gets answer directly from MongoDB (no Claude API).
 * If MongoDB has no answer, the regular useChatStream handles it as a normal message.
 *
 * Usage:
 *   const { sendFaqMessage, isFaqLoading } = useFaqLookup();
 */

import { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { v4 as uuid } from 'uuid';
import {
  createSession,
  addUserMessage,
  addBotMessage,
  setStreaming,
  appendStreamDelta,
  finalizeStreamMessage,
  showToast,
} from '../store/chatSlice';

export function useFaqLookup() {
  const dispatch         = useDispatch();
  const currentSessionId = useSelector((s) => s.chat.currentSessionId);
  const isStreaming      = useSelector((s) => s.chat.isStreaming);
  const lang             = useSelector((s) => s.chat.lang);
  const [isFaqLoading, setIsFaqLoading] = useState(false);

  const sendFaqMessage = useCallback(async (input) => {
    // Accept either a plain string or { q, faqId } object from the sidebar
    const question = typeof input === 'string' ? input : input?.q;
    const faqId    = typeof input === 'object'  ? input?.faqId : null;
    if (!question?.trim() || isStreaming || isFaqLoading) return;

    // Ensure a session exists
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = 'sess_' + uuid();
      const title = question.slice(0, 42) + (question.length > 42 ? '...' : '');
      dispatch(createSession({ id: sessionId, title }));
    }

    // Show the user question immediately
    dispatch(addUserMessage({ text: question, sessionId }));
    setIsFaqLoading(true);
    dispatch(setStreaming(true));

    try {
      // -- Try MongoDB first via /api/chat/faq ----------------------------
      const faqRes  = await fetch('/api/chat/faq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const faqData = await faqRes.json();

      if (faqData.ok && faqData.answer) {
        // Answer from MongoDB — no Claude used
        dispatch(addBotMessage({
          text: faqData.answer,
          sessionId,
          source: faqData.source || 'mongodb',
        }));
        dispatch(setStreaming(false));
        setIsFaqLoading(false);
        return;
      }

      // -- Fallback: call /api/chat with streaming (Claude) --------------
      // User message already shown; proceed to stream Claude response
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          history: [],
          lang,
        }),
      });

      if (!chatRes.ok) throw new Error(`Server error: ${chatRes.status}`);

      const reader  = chatRes.body.getReader();
      const decoder = new TextDecoder();
      let source    = 'claude';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'delta') {
              dispatch(appendStreamDelta({ delta: event.text, sessionId }));
            } else if (event.type === 'done') {
              source = event.source || 'claude';
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch { /* ignore malformed SSE */ }
        }
      }

      dispatch(finalizeStreamMessage({ sessionId, source }));

    } catch (err) {
      dispatch(setStreaming(false));
      dispatch(showToast({ message: `Error: ${err.message}`, type: 'error' }));
    } finally {
      setIsFaqLoading(false);
    }
  }, [dispatch, currentSessionId, isStreaming, isFaqLoading, lang]);

  return { sendFaqMessage, isFaqLoading };
}
