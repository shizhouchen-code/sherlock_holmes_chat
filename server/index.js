require('dotenv').config();
const express = require('express');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const URI = process.env.REACT_APP_MONGODB_URI || process.env.MONGODB_URI || process.env.REACT_APP_MONGO_URI;
const DB = 'chatapp';
const RAG_DB = 'rag_docs';
const RAG_COLLECTION = 'sherlock_holmes';
const RAG_VECTOR_INDEX = process.env.RAG_VECTOR_INDEX || 'vector_index';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'dR1Ptm3rjBUIbHiaywdJ';

let db;
let mongoClient;
let mongoAvailable = false;
let mongoError = null;

async function connect() {
  try {
    mongoClient = await MongoClient.connect(URI);
    db = mongoClient.db(DB);
    mongoAvailable = true;
    mongoError = null;
    console.log('MongoDB connected');
  } catch (err) {
    mongoAvailable = false;
    mongoError = err?.message || 'Unknown MongoDB connection error';
    console.error('MongoDB connection failed:', mongoError);
  }
}

function requireMongo(res) {
  if (mongoAvailable) return true;
  res.status(503).json({
    error: 'MongoDB is not available at this time. Chat is running in system-prompt-only mode.',
  });
  return false;
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

app.get('/api/status', async (req, res) => {
  try {
    if (!mongoAvailable) {
      return res.json({
        mongoAvailable: false,
        message: 'MongoDB is not available at this time. Chat is using system prompt only.',
        usersCount: 0,
        sessionsCount: 0,
        error: mongoError,
      });
    }
    const usersCount = await db.collection('users').countDocuments();
    const sessionsCount = await db.collection('sessions').countDocuments();
    res.json({ mongoAvailable: true, usersCount, sessionsCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ─────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const sessions = await db
      .collection('sessions')
      .find({})
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
    if (!requireMongo(res)) return;
    const { agent } = req.body;
    const { title } = req.body;
    const result = await db.collection('sessions').insertOne({
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
    if (!requireMongo(res)) return;
    await db.collection('sessions').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/sessions/:id/title', async (req, res) => {
  try {
    if (!requireMongo(res)) return;
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
    if (!requireMongo(res)) return;
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
    if (!requireMongo(res)) return;
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
    if (!requireMongo(res)) return;
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

const BUILD_DIR = path.join(__dirname, '..', 'build');
app.use(express.static(BUILD_DIR));

app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(BUILD_DIR, 'index.html'), (err) => {
    if (err) {
      res.status(404).send(
        'React build not found. Run "npm run build" for production or "npm run dev" for local development.'
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  console.log(`Server on http://localhost:${PORT}`);
  await connect();
  await validateGeminiKey();
});
