const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { CSV_TOOL_DECLARATIONS } = require('./csvToolDeclarations');

const MODEL = 'gemini-2.5-flash';
const SEARCH_TOOL = { googleSearch: {} };
const CODE_EXEC_TOOL = { codeExecution: {} };

let cachedPrompt = null;

function getApiKey() {
  return process.env.GEMINI_API_KEY || '';
}

function getGenAI() {
  const key = getApiKey();
  if (!key) throw new Error('GEMINI_API_KEY is not configured');
  return new GoogleGenerativeAI(key);
}

async function loadSystemPrompt(buildDir) {
  if (cachedPrompt !== null) return cachedPrompt;
  const candidates = [
    path.join(buildDir, 'prompt_chat.txt'),
    path.join(__dirname, '..', 'public', 'prompt_chat.txt'),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        cachedPrompt = fs.readFileSync(filePath, 'utf8').trim();
        return cachedPrompt;
      }
    } catch {
      // try next candidate
    }
  }
  cachedPrompt = '';
  return cachedPrompt;
}

async function validateGeminiKey() {
  const key = getApiKey();
  if (!key || !key.trim()) {
    return { ok: false, error: 'Gemini API is not configured on the server.' };
  }
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (!res.ok) {
      if (res.status === 403) {
        return { ok: false, error: 'Gemini API key invalid or restricted.' };
      }
      const body = await res.text();
      return { ok: false, error: `Gemini API error ${res.status}: ${body.slice(0, 100)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error' };
  }
}

function buildChatHistory(history, systemInstruction) {
  const baseHistory = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content || '' }],
  }));

  if (!systemInstruction) return baseHistory;

  return [
    {
      role: 'user',
      parts: [{ text: `Follow these instructions in every response:\n\n${systemInstruction}` }],
    },
    { role: 'model', parts: [{ text: "Got it! I'll follow those instructions." }] },
    ...baseHistory,
  ];
}

async function* streamChat(buildDir, history, newMessage, imageParts = [], useCodeExecution = false) {
  const systemInstruction = await loadSystemPrompt(buildDir);
  const tools = useCodeExecution ? [CODE_EXEC_TOOL] : [SEARCH_TOOL];
  const model = getGenAI().getGenerativeModel({ model: MODEL, tools });
  const chat = model.startChat({ history: buildChatHistory(history, systemInstruction) });

  const parts = [
    { text: newMessage },
    ...imageParts.map((img) => ({
      inlineData: { mimeType: img.mimeType || 'image/png', data: img.data },
    })),
  ].filter((p) => p.text !== undefined || p.inlineData !== undefined);

  const result = await chat.sendMessageStream(parts);

  for await (const chunk of result.stream) {
    const chunkParts = chunk.candidates?.[0]?.content?.parts || [];
    for (const part of chunkParts) {
      if (part.text) yield { type: 'text', text: part.text };
    }
  }

  const response = await result.response;
  const allParts = response.candidates?.[0]?.content?.parts || [];

  const hasCodeExecution = allParts.some(
    (p) =>
      p.executableCode ||
      p.codeExecutionResult ||
      (p.inlineData && p.inlineData.mimeType?.startsWith('image/'))
  );

  if (hasCodeExecution) {
    const structuredParts = allParts
      .map((p) => {
        if (p.text) return { type: 'text', text: p.text };
        if (p.executableCode) {
          return {
            type: 'code',
            language: p.executableCode.language || 'PYTHON',
            code: p.executableCode.code,
          };
        }
        if (p.codeExecutionResult) {
          return {
            type: 'result',
            outcome: p.codeExecutionResult.outcome,
            output: p.codeExecutionResult.output,
          };
        }
        if (p.inlineData) {
          return { type: 'image', mimeType: p.inlineData.mimeType, data: p.inlineData.data };
        }
        return null;
      })
      .filter(Boolean);

    yield { type: 'fullResponse', parts: structuredParts };
  }

  const grounding = response.candidates?.[0]?.groundingMetadata;
  if (grounding) {
    yield { type: 'grounding', data: grounding };
  }
}

async function runCsvToolsChat(buildDir, history, newMessage, csvHeaders, toolResponses = []) {
  const systemInstruction = await loadSystemPrompt(buildDir);
  const model = getGenAI().getGenerativeModel({
    model: MODEL,
    tools: [{ functionDeclarations: CSV_TOOL_DECLARATIONS }],
  });
  const chat = model.startChat({ history: buildChatHistory(history, systemInstruction) });

  const msgWithContext = csvHeaders?.length
    ? `[CSV columns: ${csvHeaders.join(', ')}]\n\n${newMessage}`
    : newMessage;

  let response = (await chat.sendMessage(msgWithContext)).response;
  let idx = 0;

  while (idx < 5) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const funcCall = parts.find((p) => p.functionCall);
    if (!funcCall) {
      return { status: 'complete', text: response.text() };
    }

    const { name, args } = funcCall.functionCall;
    if (idx >= toolResponses.length) {
      return { status: 'tool_required', toolCall: { name, args } };
    }

    const tr = toolResponses[idx];
    response = (
      await chat.sendMessage([{ functionResponse: { name: tr.name, response: { result: tr.result } } }])
    ).response;
    idx += 1;
  }

  return { status: 'complete', text: response.text() };
}

module.exports = {
  validateGeminiKey,
  streamChat,
  runCsvToolsChat,
};
