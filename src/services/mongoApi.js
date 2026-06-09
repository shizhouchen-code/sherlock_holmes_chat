const API = process.env.REACT_APP_API_URL || '';

const api = async (path, options = {}) => {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text || res.statusText;
    try {
      const parsed = JSON.parse(text);
      message = parsed.error || message;
    } catch {
      // keep raw text
    }
    throw new Error(message);
  }
  return text ? JSON.parse(text) : {};
};

export const getAuthStatus = async () => api('/api/auth/status');

export const unlockGate = async (password) =>
  api('/api/auth/unlock', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });

export const logoutGate = async () =>
  api('/api/auth/logout', {
    method: 'POST',
  });

// ── Sessions ─────────────────────────────────────────────────────────────────

export const getSessions = async () => api('/api/sessions');

export const getBackendStatus = async () => api('/api/status');

export const createSession = async (agent = null, title = null) =>
  api('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ agent, title }),
  });

export const deleteSession = async (sessionId) =>
  api(`/api/sessions/${sessionId}`, { method: 'DELETE' });

export const updateSessionTitle = async (sessionId, title) =>
  api(`/api/sessions/${sessionId}/title`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });

// ── Messages ─────────────────────────────────────────────────────────────────

export const saveMessage = async (
  sessionId,
  role,
  content,
  imageData = null,
  charts = null,
  toolCalls = null,
  ragChunks = null
) =>
  api('/api/messages', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      role,
      content,
      imageData,
      charts,
      toolCalls,
      ragChunks,
    }),
  });

export const loadMessages = async (sessionId) =>
  api(`/api/messages?session_id=${encodeURIComponent(sessionId)}`);

// ── RAG ─────────────────────────────────────────────────────────────────────

export const searchRag = async (query) => {
  const data = await api('/api/rag/search', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
  return data.chunks || [];
};

// ── TTS ─────────────────────────────────────────────────────────────────────

export const speakText = async (text) => {
  const res = await fetch(`${API}/api/tts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.blob();
};
