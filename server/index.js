require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const URI = process.env.REACT_APP_MONGODB_URI || process.env.MONGODB_URI || process.env.REACT_APP_MONGO_URI;
const DB = 'chatapp';
const RAG_DB = 'rag_docs';
const RAG_COLLECTION = 'harry_potter';
const RAG_VECTOR_INDEX = process.env.RAG_VECTOR_INDEX || 'vector_index';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'dR1Ptm3rjBUIbHiaywdJ';

let db;
let mongoClient;

async function connect() {
  mongoClient = await MongoClient.connect(URI);
  db = mongoClient.db(DB);
  console.log('MongoDB connected');
}

// ── Validate Gemini API key at startup ───────────────────────────────────────
async function validateGeminiKey() {
  if (!GEMINI_API_KEY || !GEMINI_API_KEY.trim()) {
    console.warn('[RAG] GEMINI_API_KEY missing — RAG embeddings will fail. Add to .env');
    return;
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`
    );
    if (!res.ok) {
      console.warn('[RAG] Gemini API key invalid or restricted (', res.status, '). RAG will fail.');
      return;
    }
    console.log('[RAG] Gemini API key OK');
  } catch (err) {
    console.warn('[RAG] Could not validate Gemini key:', err.message);
  }
}

// ── Embed query using Google Gemini API ───────────────────────────────────────
async function embedQuery(query) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY required for RAG');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: query }] },
        taskType: 'RETRIEVAL_QUERY',
        output_dimensionality: 768,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding failed: ${err}`);
  }
  const data = await res.json();
  return data.embedding?.values || [];
}

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:sans-serif;padding:2rem;background:#00356b;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0">
        <div style="text-align:center">
          <h1>Chat API Server</h1>
          <p>Backend is running. Use the React app at <a href="http://localhost:3000" style="color:#ffd700">localhost:3000</a></p>
          <p><a href="/api/status" style="color:#ffd700">Check DB status</a></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/status', async (req, res) => {
  try {
    const usersCount = await db.collection('users').countDocuments();
    const sessionsCount = await db.collection('sessions').countDocuments();
    res.json({ usersCount, sessionsCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Users ────────────────────────────────────────────────────────────────────

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, firstName, lastName, email } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    if (!firstName || !lastName || !email)
      return res.status(400).json({ error: 'First name, last name, and email required' });
    const name = String(username).trim().toLowerCase();
    const existing = await db.collection('users').findOne({ username: name });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    const hashed = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({
      username: name,
      password: hashed,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: String(email).trim().toLowerCase(),
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = username.trim().toLowerCase();
    const user = await db.collection('users').findOne({ username: name });
    if (!user) return res.status(401).json({ error: 'User not found' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });
    res.json({ ok: true, username: name, firstName: user.firstName || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ─────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username required' });
    const sessions = await db
      .collection('sessions')
      .find({ username })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(
      sessions.map((s) => ({
        id: s._id.toString(),
        agent: s.agent || null,
        title: s.title || null,
        createdAt: s.createdAt,
        messageCount: (s.messages || []).length,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { username, agent } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    const { title } = req.body;
    const result = await db.collection('sessions').insertOne({
      username,
      agent: agent || null,
      title: title || null,
      createdAt: new Date().toISOString(),
      messages: [],
    });
    res.json({ id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await db.collection('sessions').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/sessions/:id/title', async (req, res) => {
  try {
    const { title } = req.body;
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { title } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Messages ─────────────────────────────────────────────────────────────────

app.post('/api/messages', async (req, res) => {
  try {
    const { session_id, role, content, imageData, charts, toolCalls, ragChunks } = req.body;
    if (!session_id || !role || content === undefined)
      return res.status(400).json({ error: 'session_id, role, content required' });
    const msg = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...(imageData && {
        imageData: Array.isArray(imageData) ? imageData : [imageData],
      }),
      ...(charts?.length && { charts }),
      ...(toolCalls?.length && { toolCalls }),
      ...(ragChunks?.length && { ragChunks }),
    };
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(session_id) },
      { $push: { messages: msg } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const doc = await db
      .collection('sessions')
      .findOne({ _id: new ObjectId(session_id) });
    const raw = doc?.messages || [];
    const msgs = raw.map((m, i) => {
      const arr = m.imageData
        ? Array.isArray(m.imageData)
          ? m.imageData
          : [m.imageData]
        : [];
      return {
        id: `${doc._id}-${i}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        images: arr.length
          ? arr.map((img) => ({ data: img.data, mimeType: img.mimeType }))
          : undefined,
        charts: m.charts?.length ? m.charts : undefined,
        toolCalls: m.toolCalls?.length ? m.toolCalls : undefined,
        ragChunks: m.ragChunks?.length ? m.ragChunks : undefined,
      };
    });
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TTS: ElevenLabs text-to-speech ───────────────────────────────────────────

app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string')
      return res.status(400).json({ error: 'text (string) required' });
    if (!ELEVENLABS_API_KEY)
      return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });

    const voiceId = ELEVENLABS_VOICE_ID;
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.slice(0, 5000),
        model_id: 'eleven_flash_v2_5',
      }),
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      return res.status(ttsRes.status).json({ error: errText || 'ElevenLabs TTS failed' });
    }

    const audioBuffer = await ttsRes.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audioBuffer));
  } catch (err) {
    console.error('[TTS]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── RAG: Vector search on Harry Potter collection ────────────────────────────

app.post('/api/rag/search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string')
      return res.status(400).json({ error: 'query (string) required' });

    const vector = await embedQuery(query.trim());
    if (vector.length !== 768)
      return res.status(500).json({ error: `Expected 768-dim embedding, got ${vector.length}` });

    const ragDb = mongoClient.db(RAG_DB);
    const pipeline = [
      {
        $vectorSearch: {
          index: RAG_VECTOR_INDEX,
          path: 'embedding',
          queryVector: vector,
          numCandidates: 100,
          limit: 5,
        },
      },
      {
        $project: {
          text: 1,
          chunk_id: 1,
          page_number: 1,
          _id: 0,
        },
      },
    ];

    const chunks = await ragDb.collection(RAG_COLLECTION).aggregate(pipeline).toArray();

    res.json({
      chunks: chunks.map((c) => ({
        text: c.text,
        chunk_id: c.chunk_id,
        page_number: c.page_number,
      })),
    });
  } catch (err) {
    console.error('[RAG search]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

connect()
  .then(() => validateGeminiKey())
  .then(() => {
    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
