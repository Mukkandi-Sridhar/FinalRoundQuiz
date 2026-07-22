/**
 * STANDALONE LIVE QUIZ SERVER (NO FIREBASE REQUIRED)
 * 100% Zero-Dependency Node.js HTTP & Real-Time WebSocket Server.
 * Serves static web pages and handles atomic sub-millisecond winner locking in memory.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

let PORT = process.env.PORT || 3001;
const PUBLIC_DIR = __dirname;

// ==========================================
// IN-MEMORY QUIZ STATE ENGINE
// ==========================================
let quizState = {
  status: 'waiting', // waiting | live | locked | winner_selected | closed
  currentQuestionId: 'q1',
  currentQuestion: {
    id: 'q1',
    number: 1,
    text: 'Which programming language runs natively inside web browsers?',
    options: ['Java', 'JavaScript', 'Python', 'C++'],
    durationSec: 30
  },
  questionStartTime: null,
  winner: null
};

let questionsBank = [
  {
    id: 'q1',
    number: 1,
    text: 'Which programming language runs natively inside web browsers?',
    options: ['Java', 'JavaScript', 'Python', 'C++'],
    durationSec: 30
  },
  {
    id: 'q2',
    number: 2,
    text: 'What protocol operates at layer 7 of the OSI model and powers the Web?',
    options: ['TCP', 'IP', 'HTTP', 'UDP'],
    durationSec: 30
  },
  {
    id: 'q3',
    number: 3,
    text: 'Which data structure follows the Last-In-First-Out (LIFO) principle?',
    options: ['Queue', 'Stack', 'Array', 'Linked List'],
    durationSec: 30
  },
  {
    id: 'q4',
    number: 4,
    text: 'What is the speed of light in vacuum approximately?',
    options: ['300,000 km/s', '150,000 km/s', '1,000,000 km/s', '500,000 km/s'],
    durationSec: 30
  }
];

let connectedTeams = {}; // { teamId: { teamId, teamName, socket, online, lastSeen } }
let submissions = {};    // { questionId: { teamId: { teamId, teamName, optionIndex, timestamp, timeTakenMs } } }
let clientSockets = new Set();

// ==========================================
// HTTP STATIC FILE SERVER
// ==========================================
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  filePath = path.normalize(filePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end('<h1>404 Not Found</h1>');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

// ==========================================
// NATIVE WEBSOCKET PROTOCOL ENGINE
// ==========================================
server.on('upgrade', (req, socket, head) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`
  ];

  socket.write(headers.join('\r\n') + '\r\n\r\n');
  clientSockets.add(socket);

  // Send Initial Snapshot
  sendToSocket(socket, {
    type: 'INIT_SNAPSHOT',
    quizState,
    teams: getTeamsPublicData(),
    questions: questionsBank,
    submissions: submissions[quizState.currentQuestionId] || {}
  });

  socket.on('data', (buffer) => {
    parseWebSocketFrame(buffer, (messageStr) => {
      try {
        const msg = JSON.parse(messageStr);
        handleClientMessage(socket, msg);
      } catch (err) {
        console.error('Invalid WS message payload:', err);
      }
    });
  });

  socket.on('close', () => {
    clientSockets.delete(socket);
    for (const tId in connectedTeams) {
      if (connectedTeams[tId].socket === socket) {
        connectedTeams[tId].online = false;
        connectedTeams[tId].lastSeen = Date.now();
        broadcastTeams();
        break;
      }
    }
  });

  socket.on('error', () => {
    clientSockets.delete(socket);
  });
});

// Broadcast state to all clients
function broadcast(payload) {
  const message = encodeWebSocketFrame(JSON.stringify(payload));
  clientSockets.forEach((sock) => {
    try {
      sock.write(message);
    } catch (e) {
      clientSockets.delete(sock);
    }
  });
}

function sendToSocket(sock, payload) {
  try {
    sock.write(encodeWebSocketFrame(JSON.stringify(payload)));
  } catch (e) {
    clientSockets.delete(sock);
  }
}

function broadcastQuizState() {
  broadcast({ type: 'QUIZ_STATE_UPDATE', quizState });
}

function broadcastTeams() {
  broadcast({ type: 'TEAMS_UPDATE', teams: getTeamsPublicData() });
}

function broadcastSubmissions(questionId) {
  broadcast({
    type: 'SUBMISSIONS_UPDATE',
    questionId,
    submissions: submissions[questionId] || {}
  });
}

function getTeamsPublicData() {
  const result = {};
  for (const id in connectedTeams) {
    result[id] = {
      teamId: connectedTeams[id].teamId,
      teamName: connectedTeams[id].teamName,
      online: connectedTeams[id].online,
      lastSeen: connectedTeams[id].lastSeen
    };
  }
  return result;
}

// ==========================================
// CLIENT MESSAGE DISPATCHER & ATOMIC LOCK
// ==========================================
function handleClientMessage(socket, msg) {
  const { type, payload } = msg;

  switch (type) {
    case 'REGISTER_TEAM': {
      const { teamId, teamName } = payload;
      if (teamId && teamName) {
        connectedTeams[teamId] = {
          teamId,
          teamName,
          socket,
          online: true,
          lastSeen: Date.now()
        };
        broadcastTeams();
      }
      break;
    }

    case 'SUBMIT_ANSWER': {
      const { questionId, teamId, teamName, optionIndex, optionText, timeTakenMs } = payload;
      if (!questionId || !teamId) return;

      if (!submissions[questionId]) {
        submissions[questionId] = {};
      }

      const subRecord = {
        teamId,
        teamName,
        optionIndex,
        optionText,
        timestamp: Date.now(),
        timeTakenMs
      };

      // 1. Record Submission
      submissions[questionId][teamId] = subRecord;
      broadcastSubmissions(questionId);

      // 2. ATOMIC WINNER DETERMINATION IN SERVER MEMORY
      if (!quizState.winner && quizState.status === 'live') {
        quizState.winner = {
          teamId,
          teamName,
          selectedOptionIndex: optionIndex,
          selectedOptionText: optionText,
          timestamp: Date.now(),
          timeTakenMs
        };
        quizState.status = 'winner_selected';
        broadcastQuizState();
        sendToSocket(socket, { type: 'SUBMIT_RESULT', isWinner: true });
      } else {
        sendToSocket(socket, { type: 'SUBMIT_RESULT', isWinner: false });
      }
      break;
    }

    case 'START_QUESTION': {
      const { question } = payload;
      quizState = {
        status: 'live',
        currentQuestionId: question.id,
        currentQuestion: question,
        questionStartTime: Date.now(),
        winner: null
      };
      broadcastQuizState();
      break;
    }

    case 'END_QUESTION': {
      quizState.status = 'locked';
      broadcastQuizState();
      break;
    }

    case 'RESET_QUESTION': {
      const { question } = payload;
      const targetQ = question || quizState.currentQuestion;
      if (targetQ && targetQ.id) {
        submissions[targetQ.id] = {};
        broadcastSubmissions(targetQ.id);
      }
      quizState = {
        status: 'waiting',
        currentQuestionId: targetQ.id,
        currentQuestion: targetQ,
        questionStartTime: null,
        winner: null
      };
      broadcastQuizState();
      break;
    }

    case 'SAVE_QUESTIONS': {
      if (Array.isArray(payload.questions)) {
        questionsBank = payload.questions;
        broadcast({ type: 'QUESTIONS_UPDATE', questions: questionsBank });
      }
      break;
    }
  }
}

// ==========================================
// WEBSOCKET FRAME ENCODING & PARSING UTILS
// ==========================================
function parseWebSocketFrame(buffer, onMessage) {
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer.length - offset < 2) return;

    const secondByte = buffer[offset + 1];
    const isMasked = (secondByte & 0x80) === 0x80;
    let payloadLen = secondByte & 0x7f;

    let headerLen = 2;
    if (payloadLen === 126) {
      if (buffer.length - offset < 4) return;
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (buffer.length - offset < 10) return;
      payloadLen = Number(buffer.readBigUInt64BE(offset + 2));
      headerLen = 10;
    }

    if (isMasked) {
      const maskKeyOffset = offset + headerLen;
      const payloadOffset = maskKeyOffset + 4;

      if (buffer.length < payloadOffset + payloadLen) return;

      const maskKey = buffer.slice(maskKeyOffset, payloadOffset);
      const payload = buffer.slice(payloadOffset, payloadOffset + payloadLen);

      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i % 4];
      }

      onMessage(payload.toString('utf8'));
      offset = payloadOffset + payloadLen;
    } else {
      const payloadOffset = offset + headerLen;
      if (buffer.length < payloadOffset + payloadLen) return;
      const payload = buffer.slice(payloadOffset, payloadOffset + payloadLen);
      onMessage(payload.toString('utf8'));
      offset = payloadOffset + payloadLen;
    }
  }
}

function encodeWebSocketFrame(payloadStr) {
  const payloadBuf = Buffer.from(payloadStr);
  const len = payloadBuf.length;

  let headerBuf;
  if (len < 126) {
    headerBuf = Buffer.alloc(2);
    headerBuf[0] = 0x81;
    headerBuf[1] = len;
  } else if (len <= 65535) {
    headerBuf = Buffer.alloc(4);
    headerBuf[0] = 0x81;
    headerBuf[1] = 126;
    headerBuf.writeUInt16BE(len, 2);
  } else {
    headerBuf = Buffer.alloc(10);
    headerBuf[0] = 0x81;
    headerBuf[1] = 127;
    headerBuf.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([headerBuf, payloadBuf]);
}

// Get Local IPv4 Address for Wi-Fi devices
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

function startServer(portToTry) {
  server.listen(portToTry, () => {
    const ips = getLocalIpAddresses();
    console.log('\n=============================================================');
    console.log('⚡ QUIZ ARENA REALTIME SERVER IS ONLINE! (NO FIREBASE NEEDED)');
    console.log('=============================================================');
    console.log(`🏠 Local Host Access: http://localhost:${portToTry}`);
    console.log('📱 Wi-Fi / Mobile Device Access Links:');
    ips.forEach((ip) => {
      console.log(`   👉 Admin Panel: http://${ip}:${portToTry}/admin.html`);
      console.log(`   👉 Team Arena:  http://${ip}:${portToTry}/team.html`);
    });
    console.log('=============================================================\n');
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${portToTry} in use, trying ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(PORT);
