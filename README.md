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

- `REACT_APP_GEMINI_API_KEY` (required): Gemini key used by frontend chat.
- `GEMINI_API_KEY` (required for backend RAG embeddings): Gemini key used by server embedding endpoint.
- `MONGODB_URI` or `REACT_APP_MONGODB_URI` (recommended): MongoDB connection string.
- `RAG_VECTOR_INDEX` (optional): Atlas vector index name, default `vector_index`.
- `ELEVENLABS_API_KEY` (optional): enables TTS endpoint.
- `ELEVENLABS_VOICE_ID` (optional): voice override for TTS endpoint.
- `PORT` (optional): backend port, default `3001`.
- `REACT_APP_API_URL` (optional): frontend API base URL for split deployments; leave empty for local proxy or same-origin single service.
- `REACT_APP_GATE_PASSWORD` (optional): password for the drag-to-unlock gate on the landing screen; defaults to `sherlock`.

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

- `REACT_APP_GEMINI_API_KEY`
- `GEMINI_API_KEY`
- `MONGODB_URI` (or `REACT_APP_MONGODB_URI`)
- `RAG_VECTOR_INDEX` (optional)
- `ELEVENLABS_API_KEY` (optional)
- `ELEVENLABS_VOICE_ID` (optional)

Important: `REACT_APP_*` vars are baked into the frontend at build time, so redeploy after changing them.

## Data Requirements For RAG

RAG expects MongoDB data in:

- database: `rag_docs`
- collection: `sherlock_holmes`
- embedding field: `embedding` with 768 dimensions
- vector index name: `vector_index` (or value of `RAG_VECTOR_INDEX`)

## Key Endpoints

- `GET /api/status` - health + Mongo availability
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
- `src/services/gemini.js` - Gemini streaming/tool integration
- `src/services/csvTools.js` - CSV parsing and local tool execution
- `src/services/mongoApi.js` - frontend API client
- `server/index.js` - Express API + static frontend hosting
- `public/prompt_chat.txt` - system prompt/persona instructions
