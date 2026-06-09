require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const { registerAuthRoutes, requireAuth } = require('./auth');
const gemini = require('./gemini');

const app = express();

const corsOrigin = process.env.CORS_ORIGIN || true;
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const expensiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);
registerAuthRoutes(app);

const URI = process.env.MONGODB_URI;
const DB = 'chatapp';
const RAG_DB = 'rag_docs';
const RAG_COLLECTION = 'sherlock_holmes';
const RAG_VECTOR_INDEX = process.env.RAG_VECTOR_INDEX || 'vector_index';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'dR1Ptm3rjBUIbHiaywdJ';
const BUILD_DIR = path.join(__dirname, '..', 'build');

let db;
let mongoClient;
let mongoAvailable = false;
let mongoError = null;

async function connect() {
  if (!URI) {
    mongoAvailable = false;
    mongoError = 'MONGODB_URI is not configured';
    console.warn('[MongoDB]', mongoError);
    return;
  }
  try {
    mongoClient = await MongoClient.connect(URI);
    db = mongoClient.db(DB);
    mongoAvailable = true;
    mongoError = null;
    console.log('MongoDB connected');
  } catch (err) {
    mongoAvailable = false;
    mongoError = 'Database connection failed';
    console.error('MongoDB connection failed:', err?.message || err);
  }
}

function requireMongo(res) {
  if (mongoAvailable) return true;
  res.status(503).json({
    error: 'MongoDB is not available at this time. Chat is running in system-prompt-only mode.',
  });
  return false;
}

async function validateGeminiKeyAtStartup() {
  const result = await gemini.validateGeminiKey();
  if (result.ok) {
    console.log('[Gemini] API key OK');
  } else {
    console.warn('[Gemini]', result.error);
  }
}

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
    throw new Error('Embedding failed');
  }
  const data = await res.json();
  return data.embedding?.values || [];
}

// ── Protected API routes ──────────────────────────────────────────────────────

app.get('/api/status', requireAuth, async (req, res) => {
  try {
    if (!mongoAvailable) {
      return res.json({
        mongoAvailable: false,
        message: 'MongoDB is not available at this time. Chat is using system prompt only.',
        usersCount: 0,
        sessionsCount: 0,
      });
    }
    const usersCount = await db.collection('users').countDocuments();
    const sessionsCount = await db.collection('sessions').countDocuments();
    res.json({ mongoAvailable: true, usersCount, sessionsCount });
  } catch (err) {
    res.status(500).json({ error: 'Status check failed' });
  }
});

app.get('/api/chat/validate', requireAuth, async (req, res) => {
  const result = await gemini.validateGeminiKey();
  res.status(result.ok ? 200 : 503).json(result);
});

app.post('/api/chat/stream', requireAuth, chatLimiter, async (req, res) => {
  try {
    const { history, newMessage, imageParts, useCodeExecution } = req.body;
    if (!newMessage || typeof newMessage !== 'string') {
      return res.status(400).json({ error: 'newMessage (string) required' });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();

    for await (const chunk of gemini.streamChat(
      BUILD_DIR,
      history || [],
      newMessage,
      imageParts || [],
      Boolean(useCodeExecution)
    )) {
      res.write(`${JSON.stringify(chunk)}\n`);
    }
    res.end();
  } catch (err) {
    console.error('[chat/stream]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Chat stream failed' });
    } else {
      res.write(`${JSON.stringify({ type: 'error', error: 'Chat stream failed' })}\n`);
      res.end();
    }
  }
});

app.post('/api/chat/csv-tools', requireAuth, chatLimiter, async (req, res) => {
  try {
    const { history, newMessage, csvHeaders, toolResponses } = req.body;
    if (!newMessage || typeof newMessage !== 'string') {
      return res.status(400).json({ error: 'newMessage (string) required' });
    }

    const result = await gemini.runCsvToolsChat(
      BUILD_DIR,
      history || [],
      newMessage,
      csvHeaders || [],
      toolResponses || []
    );
    res.json(result);
  } catch (err) {
    console.error('[chat/csv-tools]', err);
    res.status(500).json({ error: 'CSV tool chat failed' });
  }
});

app.get('/api/sessions', requireAuth, async (req, res) => {
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
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

app.post('/api/sessions', requireAuth, async (req, res) => {
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
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.delete('/api/sessions/:id', requireAuth, async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    await db.collection('sessions').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

app.patch('/api/sessions/:id/title', requireAuth, async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const { title } = req.body;
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { title } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update session' });
  }
});

app.post('/api/messages', requireAuth, async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const { session_id, role, content, imageData, charts, toolCalls, ragChunks } = req.body;
    if (!session_id || !role || content === undefined) {
      return res.status(400).json({ error: 'session_id, role, content required' });
    }
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
    res.status(500).json({ error: 'Failed to save message' });
  }
});

app.get('/api/messages', requireAuth, async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const doc = await db.collection('sessions').findOne({ _id: new ObjectId(session_id) });
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
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

app.post('/api/tts', requireAuth, expensiveLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text (string) required' });
    }
    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'TTS is not configured' });
    }

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
      return res.status(ttsRes.status).json({ error: 'ElevenLabs TTS failed' });
    }

    const audioBuffer = await ttsRes.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audioBuffer));
  } catch (err) {
    console.error('[TTS]', err);
    res.status(500).json({ error: 'TTS failed' });
  }
});

app.post('/api/rag/search', requireAuth, expensiveLimiter, async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query (string) required' });
    }

    const vector = await embedQuery(query.trim());
    if (vector.length !== 768) {
      return res.status(500).json({ error: 'Embedding dimension mismatch' });
    }

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
    res.status(500).json({ error: 'RAG search failed' });
  }
});

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

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  console.log(`Server on http://localhost:${PORT}`);
  await connect();
  await validateGeminiKeyAtStartup();
});
