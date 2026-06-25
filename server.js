const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_super_secret_change_me';
const DB_PATH = path.join(__dirname, 'termogram.db');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (path.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    if (path.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
    if (path.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
  }
}));

const socketsByUserId = new Map();
const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_data_url TEXT,
      bio TEXT,
      phone TEXT,
      last_seen TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER,
      to_user_id INTEGER,
      channel_id INTEGER,
      text TEXT,
      voice_data_url TEXT,
      voice_duration INTEGER,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      owner_id INTEGER NOT NULL,
      avatar_data_url TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS channel_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'subscriber',
      created_at TEXT NOT NULL,
      UNIQUE(channel_id, user_id),
      FOREIGN KEY (channel_id) REFERENCES channels(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_messages_pair_created ON messages(from_user_id, to_user_id, created_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_channel_members ON channel_members(channel_id, user_id)');
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidUsername(value) {
  return /^[a-z0-9_]{4,24}$/i.test(value);
}

function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    avatar: user.avatar_data_url || null,
    bio: user.bio || null,
    phone: user.phone || null,
    lastSeen: user.last_seen || null
  };
}

function getUserSockets(userId) {
  return socketsByUserId.get(Number(userId)) || new Set();
}

function emitToUser(userId, event, payload) {
  getUserSockets(userId).forEach((socketId) => io.to(socketId).emit(event, payload));
}

function emitOnlineUsers() {
  io.emit('users:online', Array.from(socketsByUserId.keys()));
}

function formatMessageRow(row) {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    fromUsername: row.from_username,
    fromName: row.from_name,
    fromAvatar: row.from_avatar || null,
    toUserId: row.to_user_id,
    toUsername: row.to_username,
    toName: row.to_name,
    toAvatar: row.to_avatar || null,
    text: row.text,
    voiceDataUrl: row.voice_data_url,
    voiceDuration: row.voice_duration,
    createdAt: row.created_at
  };
}

async function getUserById(id) {
  return get('SELECT * FROM users WHERE id = ?', [id]);
}

function getLanIps() {
  const nets = os.networkInterfaces();
  const ips = [];

  Object.values(nets).forEach((ifaces) => {
    (ifaces || []).forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    });
  });

  return ips;
}

app.post('/api/register', async (req, res) => {
  try {
    console.log('Register attempt:', req.body);
    const { username, password, name } = req.body || {};
    const normalizedUsername = normalizeUsername(username);
    const safeName = String(name || normalizedUsername).trim().slice(0, 32) || normalizedUsername;

    console.log('Normalized username:', normalizedUsername);
    console.log('Is valid:', isValidUsername(normalizedUsername));

    if (!isValidUsername(normalizedUsername)) {
      return res.status(400).json({ error: 'Username: 4-24 chars, letters/numbers/_' });
    }

    if (!password || String(password).length < 4) {
      return res.status(400).json({ error: 'Password min 4 chars' });
    }

    const exists = await get('SELECT id FROM users WHERE username = ?', [normalizedUsername]);
    if (exists) {
      console.log('Username already exists');
      return res.status(409).json({ error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const createdAt = new Date().toISOString();

    console.log('Creating user...');
    const result = await run(
      'INSERT INTO users (username, name, password_hash, created_at, last_seen) VALUES (?, ?, ?, ?, ?)',
      [normalizedUsername, safeName, passwordHash, createdAt, createdAt]
    );

    console.log('User created with ID:', result.lastID);
    const user = await getUserById(result.lastID);
    const token = createToken(user);

    console.log('Registration successful');
    return res.json({ token, user: publicUser(user) });
  } catch (e) {
    console.error('Register error:', e);
    return res.status(500).json({ error: 'Register failed: ' + e.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const normalizedUsername = normalizeUsername(username);
    const user = await get('SELECT * FROM users WHERE username = ?', [normalizedUsername]);

    if (!user) return res.status(401).json({ error: 'Wrong credentials' });

    const ok = await bcrypt.compare(String(password || ''), user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Wrong credentials' });

    const now = new Date().toISOString();
    await run('UPDATE users SET last_seen = ? WHERE id = ?', [now, user.id]);
    user.last_seen = now;

    const token = createToken(user);
    return res.json({ token, user: publicUser(user) });
  } catch (e) {
    return res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/me', authMiddleware, async (req, res) => {
  const user = await getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user: publicUser(user) });
});

app.patch('/api/profile', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const nextName = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 32) : user.name;
    const nextBio = req.body?.bio !== undefined ? String(req.body.bio).trim().slice(0, 140) : user.bio;
    const nextPhone = req.body?.phone !== undefined ? String(req.body.phone).trim().slice(0, 20) : user.phone;
    const nextUsername = req.body?.username !== undefined ? normalizeUsername(req.body.username) : user.username;
    const avatar = req.body?.avatar;

    // Validate username change
    if (nextUsername !== user.username) {
      if (!isValidUsername(nextUsername)) {
        return res.status(400).json({ error: 'Username: 4-24 chars, letters/numbers/_' });
      }
      const exists = await get('SELECT id FROM users WHERE username = ? AND id != ?', [nextUsername, user.id]);
      if (exists) return res.status(409).json({ error: 'Username already taken' });
    }

    let avatarData = user.avatar_data_url;
    if (typeof avatar === 'string') {
      if (avatar.length > 300000) return res.status(400).json({ error: 'Avatar too large' });
      avatarData = avatar || null;
    }

    await run('UPDATE users SET name = ?, bio = ?, phone = ?, username = ?, avatar_data_url = ? WHERE id = ?', [nextName, nextBio, nextPhone, nextUsername, avatarData, user.id]);

    const updated = await getUserById(user.id);
    return res.json({ user: publicUser(updated) });
  } catch (e) {
    return res.status(500).json({ error: 'Profile update failed' });
  }
});

app.get('/api/users/search', authMiddleware, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ users: [] });

  console.log('Search query:', q);

  const users = await all(
    `SELECT id, username, name, avatar_data_url, bio, last_seen
     FROM users
     WHERE id != ? AND (username LIKE ? OR name LIKE ?)
     ORDER BY username ASC
     LIMIT 20`,
    [req.user.id, `%${q}%`, `%${q}%`]
  );

  console.log('Found users:', users.length);
  return res.json({ users: users.map(publicUser) });
});

// Channels API
app.get('/api/channels', authMiddleware, async (req, res) => {
  const channels = await all(
    `SELECT c.*, u.username as owner_username,
            (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count,
            (SELECT role FROM channel_members WHERE channel_id = c.id AND user_id = ?) as my_role
     FROM channels c
     JOIN users u ON u.id = c.owner_id
     JOIN channel_members cm ON cm.channel_id = c.id
     WHERE cm.user_id = ?
     ORDER BY c.created_at DESC`,
    [req.user.id, req.user.id]
  );

  return res.json({ channels: channels.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    ownerId: c.owner_id,
    ownerUsername: c.owner_username,
    avatar: c.avatar_data_url,
    memberCount: c.member_count,
    myRole: c.my_role,
    createdAt: c.created_at
  })) });
});

app.post('/api/channels', authMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body || {};
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Channel name min 2 chars' });
    }

    const createdAt = new Date().toISOString();
    const result = await run(
      'INSERT INTO channels (name, description, owner_id, created_at) VALUES (?, ?, ?, ?)',
      [String(name).trim().slice(0, 50), String(description || '').slice(0, 200), req.user.id, createdAt]
    );

    // Add owner as admin
    await run(
      'INSERT INTO channel_members (channel_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
      [result.lastID, req.user.id, 'admin', createdAt]
    );

    const channel = await get('SELECT * FROM channels WHERE id = ?', [result.lastID]);
    return res.json({ channel: {
      id: channel.id,
      name: channel.name,
      description: channel.description,
      ownerId: channel.owner_id,
      avatar: channel.avatar_data_url,
      createdAt: channel.created_at
    }});
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create channel' });
  }
});

app.get('/api/channels/:channelId', authMiddleware, async (req, res) => {
  const channelId = Number(req.params.channelId);
  const channel = await get('SELECT * FROM channels WHERE id = ?', [channelId]);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  const member = await get('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?', [channelId, req.user.id]);
  if (!member) return res.status(403).json({ error: 'Not a member' });

  const owner = await get('SELECT username FROM users WHERE id = ?', [channel.owner_id]);

  return res.json({ channel: {
    id: channel.id,
    name: channel.name,
    description: channel.description,
    ownerId: channel.owner_id,
    ownerUsername: owner?.username,
    avatar: channel.avatar_data_url,
    createdAt: channel.created_at
  }});
});

app.patch('/api/channels/:channelId', authMiddleware, async (req, res) => {
  const channelId = Number(req.params.channelId);
  const channel = await get('SELECT * FROM channels WHERE id = ? AND owner_id = ?', [channelId, req.user.id]);
  if (!channel) return res.status(403).json({ error: 'Not the owner' });

  const { name, description } = req.body || {};
  if (name && String(name).trim().length < 2) {
    return res.status(400).json({ error: 'Channel name min 2 chars' });
  }

  await run(
    'UPDATE channels SET name = ?, description = ? WHERE id = ?',
    [name ? String(name).trim().slice(0, 50) : channel.name, description !== undefined ? String(description).slice(0, 200) : channel.description, channelId]
  );

  const updated = await get('SELECT * FROM channels WHERE id = ?', [channelId]);
  return res.json({ channel: {
    id: updated.id,
    name: updated.name,
    description: updated.description,
    ownerId: updated.owner_id,
    avatar: updated.avatar_data_url
  }});
});

app.delete('/api/channels/:channelId', authMiddleware, async (req, res) => {
  const channelId = Number(req.params.channelId);
  const channel = await get('SELECT * FROM channels WHERE id = ? AND owner_id = ?', [channelId, req.user.id]);
  if (!channel) return res.status(403).json({ error: 'Not the owner' });

  await run('DELETE FROM channel_members WHERE channel_id = ?', [channelId]);
  await run('DELETE FROM messages WHERE channel_id = ?', [channelId]);
  await run('DELETE FROM channels WHERE id = ?', [channelId]);

  return res.json({ success: true });
});

app.get('/api/channels/:channelId/members', authMiddleware, async (req, res) => {
  const channelId = Number(req.params.channelId);
  const members = await all(
    `SELECT cm.*, u.username, u.name, u.avatar_data_url
     FROM channel_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.channel_id = ?
     ORDER BY cm.role DESC, u.username ASC`,
    [channelId]
  );

  return res.json({ members: members.map(m => ({
    id: m.user_id,
    username: m.username,
    name: m.name,
    avatar: m.avatar_data_url,
    role: m.role
  })) });
});

app.post('/api/channels/:channelId/leave', authMiddleware, async (req, res) => {
  const channelId = Number(req.params.channelId);
  await run('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?', [channelId, req.user.id]);
  return res.json({ success: true });
});

app.get('/api/chats', authMiddleware, async (req, res) => {
  const userId = Number(req.user.id);

  const chats = await all(
    `WITH chat_pairs AS (
      SELECT
        CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END AS peer_id,
        MAX(created_at) AS last_created_at
      FROM messages
      WHERE from_user_id = ? OR to_user_id = ?
      GROUP BY peer_id
    )
    SELECT
      cp.peer_id,
      u.username,
      u.name,
      u.avatar_data_url,
      u.last_seen,
      m.id AS msg_id,
      m.from_user_id,
      m.to_user_id,
      m.text,
      m.created_at
    FROM chat_pairs cp
    JOIN users u ON u.id = cp.peer_id
    JOIN messages m ON (
      ((m.from_user_id = ? AND m.to_user_id = cp.peer_id) OR (m.from_user_id = cp.peer_id AND m.to_user_id = ?))
      AND m.created_at = cp.last_created_at
    )
    ORDER BY m.created_at DESC`,
    [userId, userId, userId, userId, userId]
  );

  const response = chats.map((row) => ({
    peer: {
      id: row.peer_id,
      username: row.username,
      name: row.name,
      avatar: row.avatar_data_url || null,
      lastSeen: row.last_seen || null
    },
    lastMessage: {
      id: row.msg_id,
      fromUserId: row.from_user_id,
      toUserId: row.to_user_id,
      text: row.text,
      createdAt: row.created_at
    }
  }));

  return res.json({ chats: response });
});

app.get('/api/chats/:peerUserId/messages', authMiddleware, async (req, res) => {
  const peerUserId = Number(req.params.peerUserId);
  const meUserId = Number(req.user.id);

  const peer = await getUserById(peerUserId);
  if (!peer) return res.status(404).json({ error: 'User not found' });

  const rows = await all(
    `SELECT
      m.id,
      m.from_user_id,
      fu.username AS from_username,
      fu.name AS from_name,
      fu.avatar_data_url AS from_avatar,
      m.to_user_id,
      tu.username AS to_username,
      tu.name AS to_name,
      tu.avatar_data_url AS to_avatar,
      m.text,
      m.voice_data_url,
      m.voice_duration,
      m.created_at
    FROM messages m
    JOIN users fu ON fu.id = m.from_user_id
    JOIN users tu ON tu.id = m.to_user_id
    WHERE (m.from_user_id = ? AND m.to_user_id = ?) OR (m.from_user_id = ? AND m.to_user_id = ?)
    ORDER BY m.created_at ASC`,
    [meUserId, peerUserId, peerUserId, meUserId]
  );

  return res.json({ messages: rows.map(formatMessageRow) });
});

app.get('/api/channels/:channelId/messages', authMiddleware, async (req, res) => {
  const channelId = Number(req.params.channelId);
  
  const member = await get('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?', [channelId, req.user.id]);
  if (!member) return res.status(403).json({ error: 'Not a member' });

  const rows = await all(
    `SELECT
      m.id,
      m.from_user_id,
      fu.username AS from_username,
      fu.name AS from_name,
      fu.avatar_data_url AS from_avatar,
      m.text,
      m.voice_data_url,
      m.voice_duration,
      m.created_at
    FROM messages m
    JOIN users fu ON fu.id = m.from_user_id
    WHERE m.channel_id = ?
    ORDER BY m.created_at ASC`,
    [channelId]
  );

  return res.json({ messages: rows.map(m => ({
    id: m.id,
    fromUserId: m.from_user_id,
    fromUsername: m.from_username,
    fromName: m.from_name,
    fromAvatar: m.from_avatar,
    text: m.text,
    voiceDataUrl: m.voice_data_url,
    voiceDuration: m.voice_duration,
    createdAt: m.created_at
  })) });
});

// Friend requests API
app.get('/api/friends/requests', authMiddleware, async (req, res) => {
  const requests = await all(
    `SELECT fr.*, u.username, u.name, u.avatar_data_url
     FROM friend_requests fr
     JOIN users u ON u.id = fr.from_user_id
     WHERE fr.to_user_id = ? AND fr.status = 'pending'`,
    [req.user.id]
  );
  return res.json({ requests: requests.map(r => ({
    id: r.id,
    fromUserId: r.from_user_id,
    username: r.username,
    name: r.name,
    avatar: r.avatar_data_url,
    createdAt: r.created_at
  })) });
});

app.post('/api/friends/request', authMiddleware, async (req, res) => {
  const { toUserId } = req.body || {};
  if (!toUserId || toUserId === req.user.id) {
    return res.status(400).json({ error: 'Invalid user' });
  }

  const peer = await getUserById(toUserId);
  if (!peer) return res.status(404).json({ error: 'User not found' });

  try {
    await run(
      `INSERT OR IGNORE INTO friend_requests (from_user_id, to_user_id, status, created_at)
       VALUES (?, ?, 'pending', ?)`,
      [req.user.id, toUserId, new Date().toISOString()]
    );
    emitToUser(toUserId, 'friend:request', {
      fromUserId: req.user.id,
      username: req.user.username,
      name: req.user.name
    });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to send request' });
  }
});

app.post('/api/friends/accept', authMiddleware, async (req, res) => {
  const { requestId, fromUserId } = req.body || {};
  if (!requestId && !fromUserId) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const targetUserId = fromUserId || (await get('SELECT from_user_id FROM friend_requests WHERE id = ?', [requestId]))?.from_user_id;
    if (!targetUserId) return res.status(404).json({ error: 'Request not found' });

    await run('UPDATE friend_requests SET status = ? WHERE id = ?', ['accepted', requestId]);
    await run('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)', [req.user.id, targetUserId, new Date().toISOString()]);
    await run('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)', [targetUserId, req.user.id, new Date().toISOString()]);

    emitToUser(targetUserId, 'friend:accepted', { acceptedBy: req.user.id });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to accept' });
  }
});

app.post('/api/friends/decline', authMiddleware, async (req, res) => {
  const { requestId } = req.body || {};
  if (!requestId) return res.status(400).json({ error: 'Invalid request' });

  try {
    const reqData = await get('SELECT from_user_id FROM friend_requests WHERE id = ?', [requestId]);
    if (!reqData) return res.status(404).json({ error: 'Request not found' });

    await run('UPDATE friend_requests SET status = ? WHERE id = ?', ['declined', requestId]);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to decline' });
  }
});

app.get('/api/friends/list', authMiddleware, async (req, res) => {
  const friends = await all(
    `SELECT u.id, u.username, u.name, u.avatar_data_url, u.last_seen
     FROM friends f
     JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = ?
     ORDER BY u.username ASC`,
    [req.user.id]
  );
  return res.json({ friends: friends.map(publicUser) });
});

io.use((socket, next) => {
  try {
    const { token } = socket.handshake.auth || {};
    if (!token) return next(new Error('No token'));

    const payload = jwt.verify(token, JWT_SECRET);
    socket.user = payload;
    next();
  } catch (e) {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', async (socket) => {
  const userId = Number(socket.user.id);
  const existing = getUserSockets(userId);
  existing.add(socket.id);
  socketsByUserId.set(userId, existing);

  await run('UPDATE users SET last_seen = ? WHERE id = ?', [new Date().toISOString(), userId]);
  emitOnlineUsers();

  socket.on('dm:send', async ({ toUserId, text, voiceDataUrl, voiceDuration }) => {
    const safeToUserId = Number(toUserId);
    const trimmed = String(text || '').trim();

    if ((!trimmed && !voiceDataUrl) || !safeToUserId || safeToUserId === userId) return;

    const peer = await getUserById(safeToUserId);
    const me = await getUserById(userId);
    if (!peer || !me) return;

    const createdAt = new Date().toISOString();
    const result = await run(
      'INSERT INTO messages (from_user_id, to_user_id, text, voice_data_url, voice_duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, safeToUserId, trimmed || null, voiceDataUrl || null, voiceDuration || null, createdAt]
    );

    const payload = {
      id: result.lastID,
      fromUserId: userId,
      fromUsername: me.username,
      fromName: me.name,
      fromAvatar: me.avatar_data_url || null,
      toUserId: safeToUserId,
      toUsername: peer.username,
      toName: peer.name,
      toAvatar: peer.avatar_data_url || null,
      text: trimmed,
      voiceDataUrl: voiceDataUrl || null,
      voiceDuration: voiceDuration || null,
      createdAt
    };

    emitToUser(userId, 'dm:new', payload);
    emitToUser(safeToUserId, 'dm:new', payload);
  });

  socket.on('channel:send', async ({ channelId, text, voiceDataUrl, voiceDuration }) => {
    const safeChannelId = Number(channelId);
    const trimmed = String(text || '').trim();

    if ((!trimmed && !voiceDataUrl) || !safeChannelId) return;

    const channel = await get('SELECT * FROM channels WHERE id = ?', [safeChannelId]);
    const me = await getUserById(userId);
    if (!channel || !me) return;

    // Check if user can write (only owner/admin)
    const member = await get('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?', [safeChannelId, userId]);
    if (!member || member.role === 'subscriber') return;

    const createdAt = new Date().toISOString();
    const result = await run(
      'INSERT INTO messages (channel_id, from_user_id, text, voice_data_url, voice_duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [safeChannelId, userId, trimmed || null, voiceDataUrl || null, voiceDuration || null, createdAt]
    );

    const payload = {
      id: result.lastID,
      channelId: safeChannelId,
      fromUserId: userId,
      fromUsername: me.username,
      fromName: me.name,
      fromAvatar: me.avatar_data_url || null,
      text: trimmed,
      voiceDataUrl: voiceDataUrl || null,
      voiceDuration: voiceDuration || null,
      createdAt
    };

    // Emit to all channel members
    const members = await all('SELECT user_id FROM channel_members WHERE channel_id = ?', [safeChannelId]);
    members.forEach(m => emitToUser(m.user_id, 'channel:new', payload));
  });

  socket.on('call:offer', ({ toUserId, offer }) => {
    const safeToUserId = Number(toUserId);
    if (!safeToUserId) return;

    emitToUser(safeToUserId, 'call:offer', {
      fromUserId: userId,
      fromUsername: socket.user.username,
      fromName: socket.user.name,
      offer
    });
  });

  socket.on('call:answer', ({ toUserId, answer }) => {
    const safeToUserId = Number(toUserId);
    if (!safeToUserId) return;

    emitToUser(safeToUserId, 'call:answer', { fromUserId: userId, answer });
  });

  socket.on('call:ice-candidate', ({ toUserId, candidate }) => {
    const safeToUserId = Number(toUserId);
    if (!safeToUserId) return;

    emitToUser(safeToUserId, 'call:ice-candidate', { fromUserId: userId, candidate });
  });

  socket.on('call:end', ({ toUserId }) => {
    const safeToUserId = Number(toUserId);
    if (!safeToUserId) return;

    emitToUser(safeToUserId, 'call:end', { fromUserId: userId });
  });

  socket.on('friend:request', async ({ toUserId }) => {
    const safeToUserId = Number(toUserId);
    if (!safeToUserId || safeToUserId === userId) return;

    const peer = await getUserById(safeToUserId);
    const me = await getUserById(userId);
    if (!peer || !me) return;

    try {
      await run(
        `INSERT OR IGNORE INTO friend_requests (from_user_id, to_user_id, status, created_at)
         VALUES (?, ?, 'pending', ?)`,
        [userId, safeToUserId, new Date().toISOString()]
      );
      emitToUser(safeToUserId, 'friend:request', {
        fromUserId: userId,
        fromUsername: me.username,
        fromName: me.name
      });
    } catch (e) {
      console.error('Friend request error:', e);
    }
  });

  socket.on('friend:accept', async ({ requestId, fromUserId }) => {
    const targetUserId = fromUserId;
    if (!targetUserId) return;

    try {
      await run('UPDATE friend_requests SET status = ? WHERE from_user_id = ? AND to_user_id = ?', ['accepted', targetUserId, userId]);
      await run('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)', [userId, targetUserId, new Date().toISOString()]);
      await run('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)', [targetUserId, userId, new Date().toISOString()]);
      emitToUser(targetUserId, 'friend:accepted', { acceptedBy: userId });
    } catch (e) {
      console.error('Friend accept error:', e);
    }
  });

  socket.on('disconnect', async () => {
    const userSockets = getUserSockets(userId);
    userSockets.delete(socket.id);

    if (userSockets.size === 0) {
      socketsByUserId.delete(userId);
      await run('UPDATE users SET last_seen = ? WHERE id = ?', [new Date().toISOString(), userId]);
    } else {
      socketsByUserId.set(userId, userSockets);
    }

    emitOnlineUsers();
  });
});

initDb().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    const ips = getLanIps();
    console.log(`TEROGRAM running on:`);
    console.log(`- http://localhost:${PORT}`);
    ips.forEach((ip) => console.log(`- http://${ip}:${PORT}`));
  });
});
