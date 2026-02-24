# Chat App — Harry Potter RAG + Lisa AI

A React chatbot for MBA students featuring **Lisa** (Blackpink) as a Harry Potter–loving AI assistant. Uses **Retrieval Augmented Generation (RAG)** to answer questions from the Harry Potter books, plus CSV analysis, text-to-speech, and streaming chat with Gemini.

---

## What This App Does

- **Chat with Lisa** — AI assistant with a casual, expressive personality (modeled after Lisa from Blackpink)
- **RAG over Harry Potter** — Vector search on a book corpus; Lisa answers from retrieved excerpts and shows chunk metadata (chunk_id, page_number)
- **User accounts** — Create account (username, first name, last name, email, password) and log in
- **Chat sessions** — Multiple conversations, each saved in MongoDB; Lisa greets you by first name in new chats
- **CSV analysis** — Upload CSV files; Lisa can run stats, value counts, and top-N queries via client-side tools, or Python for plots
- **Text-to-speech** — ElevenLabs voice playback for AI responses (speaker button on each message)
- **Streaming responses** — Real-time text, Google Search grounding, and code execution

---

## API Keys & Environment Variables

Create a `.env` file in the project root. Copy from `.env.example` and fill in your values.

| Variable | Required | Where used | Description |
|----------|----------|------------|-------------|
| `REACT_APP_GEMINI_API_KEY` | **Yes** | Frontend | Gemini API key for chat. [Get one](https://aistudio.google.com/apikey). |
| `GEMINI_API_KEY` | **Yes** | Backend | Same key for RAG embeddings. Can reuse the value above. |
| `MONGODB_URI` or `REACT_APP_MONGODB_URI` | **Yes** | Backend | MongoDB Atlas connection string. Format: `mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/` |
| `ELEVENLABS_API_KEY` | Optional | Backend | ElevenLabs TTS. Without it, the app runs but the speaker button will fail. |
| `REACT_APP_API_URL` | Production only | Frontend | Backend URL when deployed (e.g. `https://your-backend.onrender.com`). Leave blank for local dev. |
| `RAG_VECTOR_INDEX` | Optional | Backend | Name of your Atlas vector index on `harry_potter`. Default: `vector_index`. |

### Example `.env` (local development)

```
REACT_APP_GEMINI_API_KEY=AIzaSy...
GEMINI_API_KEY=AIzaSy...
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/
ELEVENLABS_API_KEY=sk_...
# REACT_APP_API_URL not needed locally — proxy handles it
```

---

## How to Run the App

### 1. Install dependencies

```bash
npm install
```

### 2. Run backend and frontend

**Option A — Single terminal (both together):**

```bash
npm start
```

**Option B — Separate terminals (recommended for development):**

**Terminal 1 — Backend:**
```bash
npm run server
```

**Terminal 2 — Frontend:**
```bash
npm run client
```

- **Backend:** http://localhost:3001  
- **Frontend:** http://localhost:3000  

Open **http://localhost:3000** in your browser. The React dev server proxies `/api` requests to the backend.

### Verify backend

- http://localhost:3001 — Server status page  
- http://localhost:3001/api/status — JSON with `usersCount` and `sessionsCount`

---

## MongoDB Setup

### 1. Create a cluster

1. Sign up at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a cluster (free tier is fine)
3. Database Access → Add user (username + password)
4. Network Access → Add IP (or `0.0.0.0/0` for development)
5. Database → Connect → Drivers → copy connection string
6. Put it in `.env` as `MONGODB_URI` or `REACT_APP_MONGODB_URI`

### 2. Databases and collections

The app uses two databases:

#### Database: `chatapp`

| Collection | Purpose |
|------------|---------|
| `users` | User accounts (username, password hash, firstName, lastName, email) |
| `sessions` | Chat conversations (title, messages, charts, tool calls, RAG chunks) |

Collections are created automatically on first use.

#### Database: `rag_docs`

| Collection | Purpose |
|------------|---------|
| `harry_potter` | Vector store for RAG. Each document has `text`, `chunk_id`, `page_number`, and `embedding` (768-dim vector). |

### 3. Vector search index (for RAG)

To enable RAG, create a **Vector Search Index** on `rag_docs.harry_potter`:

1. In Atlas: **Search** → **Create Index**
2. Choose **JSON Editor**
3. Index name: `vector_index` (or set `RAG_VECTOR_INDEX` in `.env`)
4. Collection: `rag_docs.harry_potter`
5. Field: `embedding` — type **vector**, dimensions **768**

Your documents must have an `embedding` field with 768-dimensional vectors (e.g. from `gemini-embedding-001` with `output_dimensionality: 768`). If you have a different embedding model, re-index with matching dimensions.

---

## Hosting on Render

Deploy the backend as a **Web Service** and the frontend as a **Static Site**.

### Step 1: Deploy the backend (Web Service)

1. [Render](https://render.com) → **New** → **Web Service**
2. Connect your GitHub repo
3. Settings:

| Setting | Value |
|---------|-------|
| Environment | Node |
| Build Command | `npm install` |
| Start Command | `node server/index.js` |

4. **Environment variables** (add in Render dashboard):

| Variable | Value |
|----------|-------|
| `MONGODB_URI` | Your MongoDB Atlas connection string |
| `GEMINI_API_KEY` | Your Gemini API key |
| `ELEVENLABS_API_KEY` | (Optional) ElevenLabs API key |

5. Deploy. Copy the backend URL (e.g. `https://your-app.onrender.com`).

### Step 2: Deploy the frontend (Static Site)

1. **New** → **Static Site** → same repo
2. Settings:

| Setting | Value |
|---------|-------|
| Build Command | `npm install && npm run build` |
| Publish Directory | `build` |

3. **Environment variables**:

| Variable | Value |
|----------|-------|
| `REACT_APP_GEMINI_API_KEY` | Your Gemini API key |
| `REACT_APP_API_URL` | Backend URL from Step 1 (e.g. `https://your-app.onrender.com`) |

> **Important:** `REACT_APP_*` variables are baked in at build time. If you change them, trigger a new deploy.

4. Deploy. Use the static site URL as your app.

### Free tier note

Render’s free plan spins down after ~15 minutes of inactivity. The first request after sleep can take ~30 seconds. Paid plans avoid this.

---

## Project Structure

```
├── server/
│   └── index.js          # Express API (users, sessions, RAG, TTS)
├── src/
│   ├── components/
│   │   ├── Auth.js       # Login / create account
│   │   ├── Chat.js       # Main chat UI
│   │   └── ...
│   └── services/
│       ├── gemini.js     # Gemini chat, streaming, tools
│       ├── mongoApi.js   # API client (users, sessions, RAG, TTS)
│       └── csvTools.js   # CSV parsing, tools, engagement
├── public/
│   └── prompt_chat.txt   # Lisa's system prompt (edit to change persona)
├── .env                  # Your secrets (not in git)
└── package.json
```

---

## Customizing the AI Persona

Edit **`public/prompt_chat.txt`** to change Lisa’s personality, tone, or role. The file is loaded at runtime; no rebuild needed.

---

## License

For course use. See your instructor for terms.
