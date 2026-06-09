const API = process.env.REACT_APP_API_URL || '';

export const CODE_KEYWORDS =
  /\b(plot|chart|graph|analyz|statistic|regression|correlat|histogram|visualiz|calculat|compute|run code|write code|execute|pandas|numpy|matplotlib|csv|data)\b/i;

async function apiFetch(path, options = {}) {
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
}

/** Test that the Gemini API is available via the server proxy. */
export async function validateGeminiKey() {
  try {
    return await apiFetch('/api/chat/validate');
  } catch (err) {
    return { ok: false, error: err.message || 'Could not reach chat API' };
  }
}

export const streamChat = async function* (history, newMessage, imageParts = [], useCodeExecution = false) {
  const res = await fetch(`${API}/api/chat/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history, newMessage, imageParts, useCodeExecution }),
  });

  if (!res.ok) {
    const text = await res.text();
    let message = text || res.statusText;
    try {
      const parsed = JSON.parse(text);
      message = parsed.error || message;
    } catch {
      // keep raw text
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line);
    }
  }

  if (buffer.trim()) yield JSON.parse(buffer);
};

export const chatWithCsvTools = async (history, newMessage, csvHeaders, executeFn) => {
  const charts = [];
  const toolCalls = [];
  const toolResponses = [];

  for (let round = 0; round < 5; round++) {
    const data = await apiFetch('/api/chat/csv-tools', {
      method: 'POST',
      body: JSON.stringify({ history, newMessage, csvHeaders, toolResponses }),
    });

    if (data.status === 'complete') {
      return { text: data.text, charts, toolCalls };
    }

    if (data.status === 'tool_required') {
      const { name, args } = data.toolCall;
      const toolResult = executeFn(name, args);
      toolCalls.push({ name, args, result: toolResult });
      if (toolResult?._chartType) charts.push(toolResult);
      toolResponses.push({ name, result: toolResult });
      continue;
    }

    throw new Error('Unexpected CSV tool response');
  }

  throw new Error('CSV tool loop exceeded maximum rounds');
};
