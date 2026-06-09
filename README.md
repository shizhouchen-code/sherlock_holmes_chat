# Sherlock Holmes Chat App

Single-page React + Express app where users chat with a Sherlock Holmes style assistant, with optional RAG, CSV analytics, image input, and text-to-speech.

## What The App Actually Does

- Chats as **Sherlock Holmes** in a multi-session chat UI.
- Stores chat sessions/messages in MongoDB when database access is available.
- Falls back to **system-prompt-only mode** when MongoDB is down (chat still works, persistence disabled).
- Uses Gemini with:
  - streamed responses,
  - Google Search grounding (shows sources in UI),
  - code execution responses (can render code/output/images).
- Supports RAG lookup via `/api/rag/search` against MongoDB vector data.
- Supports CSV attachments and analysis:
  - auto-parses CSVs,
  - computes dataset summaries,
  - runs client-side analysis tools (stats, value counts, top rows),
  - can route to Gemini code execution for more advanced analysis.
- Supports image attachments (upload, drag/drop, paste).
- Supports ElevenLabs TTS playback for assistant messages.

## Environment Variables

Create `.env` from `.env.example` and set values:

- `GEMINI_API_KEY` (required): Gemini key used by the server for chat, RAG embeddings, and streaming.
- `MONGODB_URI` (recommended): MongoDB connection string.
- `GATE_PASSWORD` (optional): password for the drag-to-unlock gate; validated server-side.
- `AUTH_SECRET` (required when `GATE_PASSWORD` is set): random string used to sign auth cookies.
- `RAG_VECTOR_INDEX` (optional): Atlas vector index name, default `vector_index`.
- `ELEVENLABS_API_KEY` (optional): enables TTS endpoint.
- `ELEVENLABS_VOICE_ID` (optional): voice override for TTS endpoint.
- `PORT` (optional): backend port, default `3001`.
- `REACT_APP_API_URL` (optional): frontend API base URL for split deployments; leave empty for local proxy or same-origin single service.

**Security note:** Do not use `REACT_APP_` prefixes for secrets. API keys and the gate password are server-only. All `/api/*` routes (except auth) require a valid session cookie when the gate is enabled.

## Running Locally

1. Install dependencies:

```bash
npm install
```

2. Development mode (frontend + backend together):

```bash
npm run dev
```

This starts:
- frontend at `http://localhost:3000`
- backend at `http://localhost:3001`

3. Production-style single service:

```bash
npm run build
npm start
```

This serves both API and React app from the Express server (`http://localhost:3001` by default).

## Render Deployment (Single Web Service)

Use one Render Web Service (not split frontend/backend):

- Build command: `npm install && npm run build`
- Start command: `npm start`

Set environment variables in Render:

- `GEMINI_API_KEY`
- `MONGODB_URI`
- `GATE_PASSWORD`
- `AUTH_SECRET`
- `RAG_VECTOR_INDEX` (optional)
- `ELEVENLABS_API_KEY` (optional)
- `ELEVENLABS_VOICE_ID` (optional)

Production builds disable source maps automatically via `.env.production`.

## Data Requirements For RAG

RAG expects MongoDB data in:

- database: `rag_docs`
- collection: `sherlock_holmes`
- embedding field: `embedding` with 768 dimensions
- vector index name: `vector_index` (or value of `RAG_VECTOR_INDEX`)

## Key Endpoints

- `GET /api/auth/status` - check gate session (public)
- `POST /api/auth/unlock` - validate gate password (public)
- `POST /api/auth/logout` - clear gate session (public)
- `GET /api/status` - health + Mongo availability (authenticated)
- `GET /api/chat/validate` - Gemini availability (authenticated)
- `POST /api/chat/stream` - streamed chat (authenticated)
- `POST /api/chat/csv-tools` - CSV tool-calling chat (authenticated)
- `GET /api/sessions` - list chat sessions
- `POST /api/sessions` - create chat session
- `DELETE /api/sessions/:id` - delete session
- `PATCH /api/sessions/:id/title` - rename session
- `GET /api/messages?session_id=...` - load messages
- `POST /api/messages` - save message
- `POST /api/rag/search` - vector search for context chunks
- `POST /api/tts` - generate TTS audio

## Project Structure

- `src/components/Chat.js` - main chat UI and routing logic
- `src/services/gemini.js` - frontend client for server-proxied Gemini chat
- `src/services/csvTools.js` - CSV parsing and local tool execution
- `src/services/mongoApi.js` - frontend API client
- `server/index.js` - Express API + static frontend hosting
- `server/gemini.js` - server-side Gemini integration
- `server/auth.js` - cookie-based gate authentication
- `public/prompt_chat.txt` - system prompt/persona instructions
