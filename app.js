// TERMOGRAM - Main App v2.0

// Временно отключаем Service Worker чтобы не ломал localhost
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  });
}

// Auth elements
const authSection = document.getElementById('authSection');
const messengerSection = document.getElementById('messengerSection');
const nameInput = document.getElementById('nameInput');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const registerBtn = document.getElementById('registerBtn');
const loginBtn = document.getElementById('loginBtn');
const authStatus = document.getElementById('authStatus');

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');

// Profile elements
const profileView = document.getElementById('profileView');
const profileAvatar = document.getElementById('profileAvatar');
const profileNameInput = document.getElementById('profileNameInput');
const profileUsernameInput = document.getElementById('profileUsernameInput');
const profileBioInput = document.getElementById('profileBioInput');
const profilePhoneInput = document.getElementById('profilePhoneInput');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const saveUsernameBtn = document.getElementById('saveUsernameBtn');
const changeAvatarBtn = document.getElementById('changeAvatarBtn');
const avatarInput = document.getElementById('avatarInput');
const profileStatus = document.getElementById('profileStatus');

// Search & Lists
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const chatList = document.getElementById('chatList');
const channelList = document.getElementById('channelList');
const createChannelBtn = document.getElementById('createChannelBtn');

// Chat elements
const chatHeader = document.getElementById('chatHeader');
const emptyState = document.getElementById('emptyState');
const composer = document.getElementById('composer');
const activeChatAvatar = document.getElementById('activeChatAvatar');
const activeChatName = document.getElementById('activeChatName');
const activeChatUsername = document.getElementById('activeChatUsername');
const activeChatLastSeen = document.getElementById('activeChatLastSeen');
const messagesEl = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const voiceRecordBtn = document.getElementById('voiceRecordBtn');

// Channel settings
const channelSettingsView = document.getElementById('channelSettingsView');
const channelSettingsName = document.getElementById('channelSettingsName');
const channelSettingsNameInput = document.getElementById('channelSettingsNameInput');
const channelSettingsDescInput = document.getElementById('channelSettingsDescInput');
const saveChannelSettingsBtn = document.getElementById('saveChannelSettingsBtn');
const deleteChannelBtn = document.getElementById('deleteChannelBtn');
const closeChannelSettingsBtn = document.getElementById('closeChannelSettingsBtn');
const channelSettingsBtn = document.getElementById('channelSettingsBtn');
const channelSettingsStatus = document.getElementById('channelSettingsStatus');

// Call elements
const callBtn = document.getElementById('callBtn');
const callPanel = document.getElementById('callPanel');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const endCallBtn = document.getElementById('endCallBtn');
const callStatus = document.getElementById('callStatus');
const remoteAudio = document.getElementById('remoteAudio');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

// State
let token = localStorage.getItem('token') || '';
let me = null;
let socket = null;
let onlineIds = [];

let chats = [];
let channels = [];
let activePeer = null;
let activeChannel = null;
let activeMessages = [];

// Call state
let localStream = null;
let remoteStream = null;
let pc = null;
let callPeerId = null;
let micEnabled = true;
let camEnabled = false;

// Voice recording
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordStartTime = 0;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Utilities
function setStatus(el, text, isError = false) {
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? '#ff8f8f' : '#7ee787';
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function formatLastSeen(value) {
  if (!value) return 'давно не был(а)';
  const d = new Date(value);
  return `был(а) в сети ${d.toLocaleString('ru-RU')}`;
}

function avatarSrc(user) {
  if (user?.avatar) return user.avatar;
  const letter = (user?.name || user?.username || 'U').charAt(0).toUpperCase();
  return `https://dummyimage.com/80x80/2a3a4a/e6ebf5&text=${encodeURIComponent(letter)}`;
}

async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request error');
  return data;
}

// Tabs
function switchTab(tabName) {
  tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  if (tabName === 'profile') {
    profileView.classList.remove('hidden');
    channelSettingsView.classList.add('hidden');
    chatHeader.classList.add('hidden');
    emptyState.classList.add('hidden');
    messagesEl.classList.add('hidden');
    composer.classList.add('hidden');
    renderProfile();
  } else {
    profileView.classList.add('hidden');
    channelSettingsView.classList.add('hidden');
    renderChatsAndChannels();
  }
}

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Search
function renderSearch(users) {
  searchResults.innerHTML = '';
  if (!users || users.length === 0) {
    searchResults.innerHTML = '<div class="muted" style="padding:10px">Никого не найдено</div>';
    return;
  }
  users.forEach((u) => {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;cursor:pointer">
        <img src="${avatarSrc(u)}" style="width:36px;height:36px;border-radius:50%" alt="avatar" />
        <div style="flex:1">
          <strong>${esc(u.name)}</strong>
          <div class="muted">@${esc(u.username)}</div>
        </div>
        <button class="small" style="padding:6px 10px">💬</button>
      </div>
    `;
    div.onclick = async () => {
      console.log('Opening chat with user:', u);
      await openChat(u);
      switchTab('chats');
      searchResults.innerHTML = '';
      searchInput.value = '';
    };
    searchResults.appendChild(div);
  });
}

// Chats & Channels
function renderChatsAndChannels() {
  renderChats();
  renderChannels();
}

function renderChats() {
  chatList.innerHTML = '';
  if (chats.length === 0) {
    chatList.innerHTML = '<div class="muted" style="padding:10px;text-align:center">Нет чатов</div>';
    return;
  }
  chats.forEach((chat) => {
    const isActive = activePeer && activePeer.id === chat.peer.id && !activeChannel;
    const onlineMark = onlineIds.includes(chat.peer.id) ? '🟢' : '';
    const lastSeenText = onlineIds.includes(chat.peer.id) ? 'online' : formatLastSeen(chat.peer.lastSeen);
    const lastMsg = chat.lastMessage?.text || chat.lastMessage?.voiceDataUrl ? '🎤 Голосовое' : '';

    const div = document.createElement('div');
    div.className = `item ${isActive ? 'active' : ''}`;
    div.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center">
        <img src="${avatarSrc(chat.peer)}" style="width:44px;height:44px;border-radius:50%" alt="avatar" />
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong>${esc(chat.peer.name)}</strong>
            <span style="font-size:11px">${onlineMark}</span>
          </div>
          <div class="muted">@${esc(chat.peer.username)}</div>
          <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(lastMsg) || lastSeenText}</div>
        </div>
      </div>
    `;
    div.onclick = () => openChat(chat.peer);
    chatList.appendChild(div);
  });
}

function renderChannels() {
  channelList.innerHTML = '';
  if (channels.length === 0) {
    channelList.innerHTML = '<div class="muted" style="padding:10px;text-align:center">Нет каналов</div>';
    return;
  }
  channels.forEach((ch) => {
    const isActive = activeChannel && activeChannel.id === ch.id;
    const div = document.createElement('div');
    div.className = `item ${isActive ? 'active' : ''}`;
    div.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center">
        <div style="width:44px;height:44px;border-radius:50%;background:#2f7cf6;display:flex;align-items:center;justify-content:center;font-size:20px">📢</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong>${esc(ch.name)}</strong>
            <span style="font-size:11px">${ch.memberCount || 0} 👥</span>
          </div>
          <div class="muted">@${esc(ch.ownerUsername)}</div>
          <div class="muted">${ch.myRole === 'admin' ? '👑 Админ' : '📖 Читатель'}</div>
        </div>
      </div>
    `;
    div.onclick = () => openChannel(ch);
    channelList.appendChild(div);
  });
}

// Messages
function renderMessages() {
  messagesEl.innerHTML = '';

  activeMessages.forEach((m) => {
    const isOut = m.fromUserId === me.id;
    const div = document.createElement('div');
    div.className = `msg ${isOut ? 'out' : 'in'}`;
    
    if (m.voiceDataUrl) {
      const playedClass = m.played ? 'played' : '';
      div.innerHTML = `
        <div class="msg-meta">${isOut ? 'Вы' : esc(m.fromName)} • ${new Date(m.createdAt).toLocaleTimeString('ru-RU')}</div>
        <div class="voice-message ${playedClass}">
          <button class="play-btn" title="Воспроизвести">▶</button>
          <span class="duration">${formatDuration(m.voiceDuration)}</span>
          ${isOut ? '<span class="voice-status">👁️</span>' : ''}
        </div>
      `;
      div.querySelector('.play-btn').onclick = () => playVoice(m.voiceDataUrl, div);
    } else {
      div.innerHTML = `
        <div class="msg-meta">${isOut ? 'Вы' : esc(m.fromName)} • ${new Date(m.createdAt).toLocaleTimeString('ru-RU')}</div>
        <div>${esc(m.text)}</div>
      `;
    }
    messagesEl.appendChild(div);
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function playVoice(dataUrl, msgDiv) {
  const audio = new Audio(dataUrl);
  audio.play();
  
  // Пометить как прослушанное
  if (msgDiv) {
    msgDiv.querySelector('.voice-message').classList.add('played');
  }
  
  audio.onended = () => {
    if (msgDiv) {
      msgDiv.querySelector('.voice-message').classList.add('played');
    }
  };
}

// Profile
function renderProfile() {
  if (!me) return;
  profileAvatar.src = avatarSrc(me);
  profileNameInput.value = me.name || '';
  profileUsernameInput.value = '@' + me.username;
  profileBioInput.value = me.bio || '';
  profilePhoneInput.value = me.phone || '';
}

function showChatUI(show) {
  profileView.classList.add('hidden');
  channelSettingsView.classList.add('hidden');
  chatHeader.classList.toggle('hidden', !show);
  composer.classList.toggle('hidden', !show);
  messagesEl.classList.toggle('hidden', !show);
  emptyState.classList.toggle('hidden', show);
}

async function loadChats() {
  try {
    const data = await api('/api/chats');
    chats = data.chats || [];
  } catch (e) {
    console.error('Load chats error:', e);
  }
}

async function loadChannels() {
  try {
    const data = await api('/api/channels');
    channels = data.channels || [];
  } catch (e) {
    console.error('Load channels error:', e);
  }
}

async function openChat(peer) {
  activePeer = peer;
  activeChannel = null;
  activeChatName.textContent = peer.name;
  activeChatUsername.textContent = peer.username;
  activeChatLastSeen.textContent = onlineIds.includes(peer.id) ? 'online' : formatLastSeen(peer.lastSeen);
  activeChatAvatar.src = avatarSrc(peer);
  channelSettingsBtn.classList.add('hidden');
  callBtn.classList.remove('hidden');

  try {
    const data = await api(`/api/chats/${peer.id}/messages`);
    activeMessages = data.messages || [];
  } catch (e) {
    activeMessages = [];
  }

  showChatUI(true);
  renderChats();
  renderMessages();
}

async function openChannel(channel) {
  activeChannel = channel;
  activePeer = null;
  activeChatName.textContent = channel.name;
  activeChatUsername.textContent = '@' + channel.ownerUsername;
  activeChatLastSeen.textContent = `${channel.memberCount || 0} подписчиков`;
  activeChatAvatar.src = avatarSrc(channel);
  
  // Show settings button for admin, hide call button
  channelSettingsBtn.classList.toggle('hidden', channel.myRole !== 'admin');
  callBtn.classList.add('hidden');

  try {
    const data = await api(`/api/channels/${channel.id}/messages`);
    activeMessages = data.messages || [];
  } catch (e) {
    activeMessages = [];
  }

  showChatUI(true);
  renderChannels();
  renderMessages();
}

function showChannelSettings() {
  if (!activeChannel) return;
  channelSettingsName.textContent = activeChannel.name;
  channelSettingsNameInput.value = activeChannel.name;
  channelSettingsDescInput.value = activeChannel.description || '';
  channelSettingsView.classList.remove('hidden');
  profileView.classList.add('hidden');
  chatHeader.classList.add('hidden');
  emptyState.classList.add('hidden');
  messagesEl.classList.add('hidden');
  composer.classList.add('hidden');
}

async function createChannel() {
  const name = prompt('Название канала:');
  if (!name) return;
  const description = prompt('Описание (необязательно):') || '';
  
  try {
    const data = await api('/api/channels', 'POST', { name, description });
    await loadChannels();
    openChannel(data.channel);
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
}

// Auth
async function register() {
  try {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const name = nameInput.value.trim();

    const data = await api('/api/register', 'POST', { username, password, name });
    token = data.token;
    localStorage.setItem('token', token);
    await afterAuth();
    setStatus(authStatus, 'Регистрация успешна');
  } catch (e) {
    setStatus(authStatus, e.message, true);
  }
}

async function login() {
  try {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    const data = await api('/api/login', 'POST', { username, password });
    token = data.token;
    localStorage.setItem('token', token);
    await afterAuth();
    setStatus(authStatus, 'Вход выполнен');
  } catch (e) {
    setStatus(authStatus, e.message, true);
  }
}

async function updateProfile({ name, bio, phone, username, avatar }) {
  const data = await api('/api/profile', 'PATCH', { name, bio, phone, username, avatar });
  me = data.user;
  renderProfile();
  await loadChats();
}

async function afterAuth() {
  try {
    const meData = await api('/api/me');
    me = meData.user;
  } catch (e) {
    localStorage.removeItem('token');
    token = '';
    return;
  }

  authSection.classList.add('hidden');
  messengerSection.classList.remove('hidden');
  showChatUI(false);

  renderProfile();
  await loadChats();
  await loadChannels();
  connectSocket();
}

// Socket
function connectSocket() {
  if (socket) socket.disconnect();

  socket = io({ auth: { token } });

  socket.on('users:online', (ids) => {
    onlineIds = ids || [];
    renderChats();

    if (activePeer) {
      activeChatLastSeen.textContent = onlineIds.includes(activePeer.id) ? 'online' : formatLastSeen(activePeer.lastSeen);
    }
  });

  socket.on('dm:new', (msg) => {
    const peerId = msg.fromUserId === me.id ? msg.toUserId : msg.fromUserId;
    const peerName = msg.fromUserId === me.id ? msg.toName : msg.fromName;
    const peerUsername = msg.fromUserId === me.id ? msg.toUsername : msg.fromUsername;
    const peerAvatar = msg.fromUserId === me.id ? msg.toAvatar : msg.fromAvatar;

    const idx = chats.findIndex((c) => c.peer.id === peerId);
    const prev = idx >= 0 ? chats[idx] : null;
    const chatModel = {
      peer: { id: peerId, name: peerName, username: peerUsername, avatar: peerAvatar, lastSeen: prev?.peer?.lastSeen || null },
      lastMessage: msg
    };

    if (idx >= 0) chats[idx] = chatModel;
    else chats.unshift(chatModel);
    chats.sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));
    renderChats();

    if (activePeer && activePeer.id === peerId && !activeChannel) {
      activeMessages.push(msg);
      renderMessages();
    }
  });

  socket.on('channel:new', (msg) => {
    if (activeChannel && activeChannel.id === msg.channelId) {
      activeMessages.push(msg);
      renderMessages();
    }
  });

  socket.on('call:offer', async ({ fromUserId, fromName, fromUsername, offer }) => {
    callPeerId = fromUserId;
    if (!activePeer || activePeer.id !== fromUserId) {
      await openChat({ id: fromUserId, name: fromName, username: fromUsername });
    }
    await startCallUi(`📞 Входящий звонок от ${fromName}`, false);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('call:answer', { toUserId: fromUserId, answer: pc.localDescription });
    } catch (e) {
      console.error('Answer error:', e);
    }
  });

  socket.on('call:answer', async ({ answer }) => {
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  });

  socket.on('call:ice-candidate', async ({ candidate }) => {
    if (!pc || !candidate) return;
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.warn(e); }
  });

  socket.on('call:end', () => {
    stopCallLocal(false);
    callStatus.textContent = 'Собеседник завершил звонок';
  });
}

// Voice Recording
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onload = async () => {
        const voiceDataUrl = reader.result;
        const duration = Math.floor((Date.now() - recordStartTime) / 1000);
        
        if (activeChannel) {
          socket.emit('channel:send', { channelId: activeChannel.id, voiceDataUrl, voiceDuration: duration });
        } else if (activePeer) {
          socket.emit('dm:send', { toUserId: activePeer.id, voiceDataUrl, voiceDuration: duration });
        }
      };
      reader.readAsDataURL(audioBlob);
      stream.getTracks().forEach(t => t.stop());
    };

    mediaRecorder.start();
    isRecording = true;
    recordStartTime = Date.now();
    voiceRecordBtn.classList.add('recording');
  } catch (e) {
    alert('Нет доступа к микрофону! Разрешите в браузере.');
    console.error('Voice record error:', e);
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    voiceRecordBtn.classList.remove('recording');
  }
}

// Calls
async function ensureMediaStream() {
  if (localStream) return localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: camEnabled });
    if (localVideo) {
      localVideo.srcObject = localStream;
      localVideo.classList.remove('hidden');
    }
    return localStream;
  } catch (e) {
    callStatus.textContent = 'Нет доступа к камере/микрофону';
    throw e;
  }
}

function createPeerConnection() {
  if (pc) return pc;
  pc = new RTCPeerConnection(rtcConfig);
  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }
  pc.ontrack = (e) => {
    remoteStream = e.streams[0];
    if (remoteVideo) {
      remoteVideo.srcObject = remoteStream;
      remoteVideo.classList.remove('hidden');
    }
    if (remoteAudio) remoteAudio.srcObject = remoteStream;
  };
  pc.onicecandidate = (e) => {
    if (e.candidate && callPeerId) socket.emit('call:ice-candidate', { toUserId: callPeerId, candidate: e.candidate });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') stopCallLocal(false);
  };
  return pc;
}

function updateCallButtons() {
  toggleMicBtn.textContent = `🎙️ Микро: ${micEnabled ? 'ВКЛ' : 'ВЫКЛ'}`;
  toggleCamBtn.textContent = `📷 Камера: ${camEnabled ? 'ВКЛ' : 'ВЫКЛ'}`;
}

async function startCallUi(text) {
  callPanel.classList.remove('hidden');
  callStatus.textContent = text;
  updateCallButtons();
}

async function startCall() {
  if (!activePeer) return;
  callPeerId = activePeer.id;
  await startCallUi(`📞 Звоним ${activePeer.name}...`);
  try {
    await ensureMediaStream();
    createPeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('call:offer', { toUserId: callPeerId, offer: pc.localDescription });
  } catch (e) {
    callStatus.textContent = 'Ошибка звонка';
  }
}

async function toggleMic() {
  if (!localStream) return;
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
  updateCallButtons();
}

async function toggleCam() {
  if (!localStream) return;
  const videoTracks = localStream.getVideoTracks();
  if (videoTracks.length === 0) {
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const track = camStream.getVideoTracks()[0];
      localStream.addTrack(track);
      if (pc) pc.addTrack(track, localStream);
      if (localVideo) {
        localVideo.srcObject = localStream;
        localVideo.classList.remove('hidden');
      }
      camEnabled = true;
    } catch (e) { camEnabled = false; }
  } else {
    camEnabled = !camEnabled;
    videoTracks.forEach(t => t.enabled = camEnabled);
  }
  updateCallButtons();
}

function stopCallLocal(notifyPeer = true) {
  if (notifyPeer && callPeerId) socket.emit('call:end', { toUserId: callPeerId });
  if (pc) { pc.close(); pc = null; }
  if (localStream) {
    localStream.getTracks().forEach(t => { if (t.kind === 'video') t.stop(); });
  }
  if (remoteStream) { remoteStream.getTracks().forEach(t => t.stop()); remoteStream = null; }
  if (localVideo) localVideo.srcObject = null;
  if (remoteVideo) remoteVideo.srcObject = null;
  if (remoteAudio) remoteAudio.srcObject = null;
  callPeerId = null;
  micEnabled = true;
  camEnabled = false;
  callPanel.classList.add('hidden');
  localVideo?.classList.add('hidden');
  remoteVideo?.classList.add('hidden');
  updateCallButtons();
}

// Init
async function init() {
  token = localStorage.getItem('token') || '';
  
  if (!token) {
    console.log('No token - showing auth');
    authSection.classList.remove('hidden');
    messengerSection.classList.add('hidden');
    return;
  }
  
  console.log('Token found, loading user...');
  
  try {
    const meData = await api('/api/me');
    me = meData.user;
    
    console.log('User loaded:', me.username);
    
    authSection.classList.add('hidden');
    messengerSection.classList.remove('hidden');
    showChatUI(false);
    
    renderProfile();
    await loadChats();
    await loadChannels();
    connectSocket();
  } catch (e) {
    console.error('Init error:', e);
    localStorage.removeItem('token');
    token = '';
    authSection.classList.remove('hidden');
    messengerSection.classList.add('hidden');
  }
}

// Event listeners
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

registerBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  const username = usernameInput.value.trim().replace('@', '');
  const password = passwordInput.value;
  
  if (!name) {
    setStatus(authStatus, 'Введи имя', true);
    return;
  }
  if (!username || username.length < 4) {
    setStatus(authStatus, 'Username: мин. 4 символа', true);
    return;
  }
  if (!password || password.length < 4) {
    setStatus(authStatus, 'Пароль: мин. 4 символа', true);
    return;
  }
  
  try {
    const data = await api('/api/register', 'POST', { username, password, name });
    token = data.token;
    localStorage.setItem('token', token);
    console.log('Registered successfully');
    await afterAuth();
    setStatus(authStatus, '✅ Регистрация успешна!');
  } catch (e) {
    console.error('Register error:', e);
    setStatus(authStatus, '❌ ' + e.message, true);
  }
});

loginBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim().replace('@', '');
  const password = passwordInput.value;
  
  if (!username || !password) {
    setStatus(authStatus, 'Введи username и пароль', true);
    return;
  }
  
  try {
    const data = await api('/api/login', 'POST', { username, password });
    token = data.token;
    localStorage.setItem('token', token);
    console.log('Logged in successfully');
    await afterAuth();
    setStatus(authStatus, '✅ Вход выполнен!');
  } catch (e) {
    console.error('Login error:', e);
    setStatus(authStatus, '❌ ' + e.message, true);
  }
});

saveProfileBtn.addEventListener('click', async () => {
  try {
    await updateProfile({
      name: profileNameInput.value.trim(),
      bio: profileBioInput.value.trim(),
      phone: profilePhoneInput.value.trim()
    });
    setStatus(profileStatus, '✅ Сохранено');
    setTimeout(() => setStatus(profileStatus, ''), 3000);
  } catch (e) {
    setStatus(profileStatus, '❌ ' + e.message, true);
  }
});

saveUsernameBtn.addEventListener('click', async () => {
  const newUsername = profileUsernameInput.value.trim().replace('@', '');
  try {
    await updateProfile({ username: newUsername });
    setStatus(profileStatus, '✅ Username изменён');
    setTimeout(() => setStatus(profileStatus, ''), 3000);
  } catch (e) {
    setStatus(profileStatus, '❌ ' + e.message, true);
  }
});

changeAvatarBtn.addEventListener('click', () => avatarInput.click());
avatarInput.addEventListener('change', async () => {
  const file = avatarInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await updateProfile({ avatar: String(reader.result || '') });
      setStatus(profileStatus, '✅ Фото обновлено');
    } catch (e) {
      setStatus(profileStatus, '❌ ' + e.message, true);
    }
  };
  reader.readAsDataURL(file);
});

searchInput.addEventListener('input', async () => {
  const q = searchInput.value.trim();
  if (!q) { searchResults.innerHTML = ''; return; }
  try {
    const data = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
    renderSearch(data.users || []);
  } catch { searchResults.innerHTML = ''; }
});

sendBtn.addEventListener('click', () => {
  const text = messageInput.value.trim();
  if (!text || !socket) return;

  if (activeChannel) {
    socket.emit('channel:send', { channelId: activeChannel.id, text });
  } else if (activePeer) {
    socket.emit('dm:send', { toUserId: activePeer.id, text });
  }
  messageInput.value = '';
});

messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendBtn.click(); });

voiceRecordBtn.addEventListener('mousedown', (e) => { e.preventDefault(); startRecording(); });
voiceRecordBtn.addEventListener('mouseup', (e) => { e.preventDefault(); stopRecording(); });
voiceRecordBtn.addEventListener('mouseleave', () => { if (isRecording) stopRecording(); });
voiceRecordBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); });
voiceRecordBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecording(); });

callBtn.addEventListener('click', () => startCall().catch(e => callStatus.textContent = e.message));
toggleMicBtn.addEventListener('click', () => toggleMic().catch(() => {}));
toggleCamBtn.addEventListener('click', () => toggleCam().catch(() => {}));
endCallBtn.addEventListener('click', () => stopCallLocal(true));

createChannelBtn.addEventListener('click', createChannel);
channelSettingsBtn.addEventListener('click', showChannelSettings);
closeChannelSettingsBtn.addEventListener('click', () => {
  channelSettingsView.classList.add('hidden');
  switchTab('chats');
});

saveChannelSettingsBtn.addEventListener('click', async () => {
  if (!activeChannel) return;
  try {
    await api(`/api/channels/${activeChannel.id}`, 'PATCH', {
      name: channelSettingsNameInput.value.trim(),
      description: channelSettingsDescInput.value.trim()
    });
    setStatus(channelSettingsStatus, '✅ Сохранено');
    await loadChannels();
  } catch (e) {
    setStatus(channelSettingsStatus, '❌ ' + e.message, true);
  }
});

deleteChannelBtn.addEventListener('click', async () => {
  if (!activeChannel) return;
  if (!confirm('Удалить канал?')) return;
  try {
    await api(`/api/channels/${activeChannel.id}`, 'DELETE');
    channels = channels.filter(c => c.id !== activeChannel.id);
    activeChannel = null;
    showChatUI(false);
    renderChannels();
  } catch (e) {
    setStatus(channelSettingsStatus, '❌ ' + e.message, true);
  }
});

// Enter key for auth
nameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') registerBtn.click(); });
usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') registerBtn.click(); });
passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') registerBtn.click(); });

// Service Worker - временно отключён для разработки
// if ('serviceWorker' in navigator) {
//   navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW error:', err));
// }

init();
