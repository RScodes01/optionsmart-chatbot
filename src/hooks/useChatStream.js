/**
 * useChatStream.js — Custom hook for SSE streaming chat responses
 *
 * Usage:
 *   const { sendMessage, isStreaming } = useChatStream();
 */

import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { v4 as uuid } from 'uuid';
import {
  createSession,
  addUserMessage,
  appendStreamDelta,
  finalizeStreamMessage,
  setStreaming,
  showToast,
  selectHistory,
} from '../store/chatSlice';

export function useChatStream() {
  const dispatch = useDispatch();
  const lang = useSelector((s) => s.chat.lang);
  const currentSessionId = useSelector((s) => s.chat.currentSessionId);
  const isStreaming = useSelector((s) => s.chat.isStreaming);
  const history = useSelector(selectHistory);

  const sendMessage = useCallback(async (text) => {
    if (!text?.trim() || isStreaming) return;

    // Ensure we have a session
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = 'sess_' + uuid();
      const title = text.slice(0, 42) + (text.length > 42 ? '…' : '');
      dispatch(createSession({ id: sessionId, title }));
    }

    // Optimistically add the user message
    dispatch(addUserMessage({ text, sessionId }));
    dispatch(setStreaming(true));

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: history.slice(-14),
          lang,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let source = 'claude';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
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
          } catch (parseErr) {
            // ignore malformed SSE lines
          }
        }
      }

      dispatch(finalizeStreamMessage({ sessionId, source }));
    } catch (err) {
      dispatch(setStreaming(false));
      dispatch(showToast({ message: `Error: ${err.message}`, type: 'error' }));
    }
  }, [dispatch, currentSessionId, isStreaming, history, lang]);

  return { sendMessage, isStreaming };
}
