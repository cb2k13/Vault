require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3002;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('FATAL: JWT_SECRET not set'); process.exit(1); }

const ALLOWED_ORIGINS = [
  'http://localhost:5174',
  'http://localhost:4173',
  process.env.CLIENT_URL,
].filter(Boolean);

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '64kb' }));

// ── Supabase ──────────────────────────────────────────────────────────────────
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ── Rate limiters ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const apiLimiter  = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });

// ── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ── Register ──────────────────────────────────────────────────────────────────
app.post('/api/register', authLimiter, async (req, res) => {
  const { username, password, public_key, encrypted_private_key, key_iv, key_salt } = req.body || {};

  if (!username || !password || !public_key || !encrypted_private_key || !key_iv || !key_salt) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Username must be 3–20 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const { data, error } = await supabase
      .from('users')
      .insert({ username, password: hash, public_key, encrypted_private_key, key_iv, key_salt })
      .select('id, username')
      .single();

    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Username already taken' });
      throw error;
    }

    const token = jwt.sign({ id: data.id, username: data.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, id: data.id, username: data.username });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
app.post('/api/login', authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Invalid credentials' });

  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, username, password, encrypted_private_key, key_iv, key_salt')
      .eq('username', username)
      .single();

    const hash = user?.password || '$2a$12$invalidhashpaddingtomakeitconstanttime';
    const valid = user && await bcrypt.compare(password, hash);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token, id: user.id, username: user.username,
      encrypted_private_key: user.encrypted_private_key,
      key_iv: user.key_iv,
      key_salt: user.key_salt,
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── Search users ──────────────────────────────────────────────────────────────
app.get('/api/users/search', auth, apiLimiter, async (req, res) => {
  const q = String(req.query.q || '').slice(0, 30);
  if (q.length < 2) return res.json([]);
  try {
    const { data } = await supabase
      .from('users')
      .select('id, username')
      .ilike('username', `%${q}%`)
      .limit(10);
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── Get public key ────────────────────────────────────────────────────────────
app.get('/api/users/:id/pubkey', auth, apiLimiter, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('public_key')
      .eq('id', req.params.id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'User not found' });
    res.json({ public_key: data.public_key });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Conversations ─────────────────────────────────────────────────────────────
app.get('/api/conversations', auth, apiLimiter, async (req, res) => {
  try {
    const uid = req.user.id;
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        id, created_at,
        participant_a, participant_b,
        user_a:users!conversations_participant_a_fkey(id, username),
        user_b:users!conversations_participant_b_fkey(id, username)
      `)
      .or(`participant_a.eq.${uid},participant_b.eq.${uid}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = (data || []).map(c => ({
      id: c.id,
      created_at: c.created_at,
      other_user: c.participant_a === uid ? c.user_b : c.user_a,
    }));

    res.json(formatted);
  } catch (err) {
    console.error('Conversations error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/conversations', auth, apiLimiter, async (req, res) => {
  const { participant_b } = req.body || {};
  if (!participant_b) return res.status(400).json({ error: 'Missing participant' });

  const uid = req.user.id;
  if (uid === participant_b) return res.status(400).json({ error: 'Cannot message yourself' });

  // Normalize: smaller id is always participant_a
  const [a, b] = [uid, participant_b].sort();

  try {
    // Check if conversation already exists
    const { data: existing } = await supabase
      .from('conversations')
      .select('id, participant_a, participant_b')
      .eq('participant_a', a)
      .eq('participant_b', b)
      .single();

    if (existing) {
      const { data: users } = await supabase
        .from('users').select('id, username').in('id', [a, b]);
      const other = users.find(u => u.id !== uid);
      return res.json({ id: existing.id, other_user: other });
    }

    const { data, error } = await supabase
      .from('conversations')
      .insert({ participant_a: a, participant_b: b })
      .select('id, participant_a, participant_b')
      .single();
    if (error) throw error;

    const { data: users } = await supabase
      .from('users').select('id, username').in('id', [a, b]);
    const other = users.find(u => u.id !== uid);

    res.json({ id: data.id, other_user: other });
  } catch (err) {
    console.error('Create conversation error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Messages ──────────────────────────────────────────────────────────────────
app.get('/api/conversations/:id/messages', auth, apiLimiter, async (req, res) => {
  const uid = req.user.id;
  try {
    // Verify user is a participant
    const { data: conv } = await supabase
      .from('conversations').select('participant_a, participant_b').eq('id', req.params.id).single();
    if (!conv || (conv.participant_a !== uid && conv.participant_b !== uid)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, ciphertext, iv, enc_key_recipient, enc_key_sender, created_at')
      .eq('conversation_id', req.params.id)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Messages error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
});

// Auth middleware for sockets
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

// userId -> Set of socketIds (handles multiple tabs)
const onlineUsers = new Map();

io.on('connection', (socket) => {
  const uid = socket.user.id;
  socket.join(`user:${uid}`);

  // Presence: register this socket
  if (!onlineUsers.has(uid)) onlineUsers.set(uid, new Set());
  onlineUsers.get(uid).add(socket.id);
  socket.emit('online_users', [...onlineUsers.keys()]);
  socket.broadcast.emit('user_online', uid);

  // Typing: forward to recipient
  socket.on('typing_start', ({ conversation_id, recipient_id }) => {
    if (!conversation_id || !recipient_id) return;
    io.to(`user:${recipient_id}`).emit('typing_start', { user_id: uid, conversation_id });
  });

  socket.on('typing_stop', ({ conversation_id, recipient_id }) => {
    if (!conversation_id || !recipient_id) return;
    io.to(`user:${recipient_id}`).emit('typing_stop', { user_id: uid, conversation_id });
  });

  socket.on('mark_read', ({ conversation_id, recipient_id }) => {
    if (!conversation_id || !recipient_id) return;
    io.to(`user:${recipient_id}`).emit('read_receipt', { conversation_id, reader_id: uid });
  });

  socket.on('react', ({ message_id, emoji, conversation_id, recipient_id }) => {
    if (!message_id || !emoji || !conversation_id || !recipient_id) return;
    const payload = { message_id, emoji, user_id: uid, conversation_id };
    io.to(`user:${recipient_id}`).emit('reaction_update', payload);
  });

  socket.on('send_message', async (payload) => {
    const { conversation_id, recipient_id, ciphertext, iv, enc_key_recipient, enc_key_sender } = payload;
    if (!conversation_id || !recipient_id || !ciphertext || !iv || !enc_key_recipient || !enc_key_sender) return;

    try {
      // Verify sender is a participant
      const { data: conv } = await supabase
        .from('conversations')
        .select('participant_a, participant_b')
        .eq('id', conversation_id)
        .single();

      if (!conv || (conv.participant_a !== uid && conv.participant_b !== uid)) return;

      // Save encrypted message — server only stores ciphertext
      const { data: msg, error } = await supabase
        .from('messages')
        .insert({
          conversation_id,
          sender_id: uid,
          ciphertext,
          iv,
          enc_key_recipient,
          enc_key_sender,
        })
        .select('id, sender_id, conversation_id, ciphertext, iv, enc_key_recipient, enc_key_sender, created_at')
        .single();

      if (error) { console.error('Save message error:', error.message); return; }

      // Echo to sender
      socket.emit('message_sent', msg);
      // Deliver to recipient
      io.to(`user:${recipient_id}`).emit('new_message', msg);
    } catch (err) {
      console.error('Socket send_message error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    const sockets = onlineUsers.get(uid);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        onlineUsers.delete(uid);
        socket.broadcast.emit('user_offline', uid);
      }
    }
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled:', err.message);
  res.status(500).json({ error: 'Server error' });
});

server.listen(PORT, () => console.log(`Vault server → http://localhost:${PORT}`));
