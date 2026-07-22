/**
 * ZERO-REFRESH WEBRTC REALTIME ENGINE (PEERJS CLOUD MESH)
 * Supports team removal, roster clearing, and lock end state.
 */

const HOST_PEER_ID = 'quiz_arena_stage_master_v1';

let peer = null;
let hostConnMap = new Map();
let clientConn = null;
let isHostMode = false;
let isConnected = false;

const stateListeners = new Set();
const teamListeners = new Set();
const submissionListeners = new Map();
const connListeners = new Set();

let localQuizState = {
  status: 'waiting',
  currentQuestionId: 'round_1',
  currentQuestion: { number: 1 },
  questionStartTime: null,
  winner: null
};

let registeredTeams = {};
let roundSubmissions = {};

export function initPeerEngine(isHost = false) {
  isHostMode = isHost;

  if (typeof Peer === 'undefined') return;

  try {
    if (isHost) {
      peer = new Peer(HOST_PEER_ID, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      peer.on('open', () => {
        isConnected = true;
        notifyConn(true);
      });

      peer.on('connection', (conn) => {
        setupHostConnection(conn);
      });
    } else {
      const randomTeamPeerId = 'team_peer_' + Math.random().toString(36).substring(2, 9);
      peer = new Peer(randomTeamPeerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      peer.on('open', () => {
        connectToHost();
      });
    }
  } catch (err) {
    console.warn('Failed to init PeerJS:', err);
  }
}

function connectToHost() {
  if (!peer || peer.destroyed) return;

  clientConn = peer.connect(HOST_PEER_ID, { reliable: true });

  clientConn.on('open', () => {
    isConnected = true;
    notifyConn(true);

    const savedName = localStorage.getItem('quiz_team_name');
    const savedId = localStorage.getItem('quiz_team_id');
    if (savedName && savedId) {
      clientConn.send({
        type: 'REGISTER_TEAM',
        payload: { teamId: savedId, teamName: savedName }
      });
    }
  });

  clientConn.on('data', (data) => {
    handleClientIncomingData(data);
  });

  clientConn.on('close', () => {
    isConnected = false;
    notifyConn(false);
    setTimeout(connectToHost, 2000);
  });
}

function setupHostConnection(conn) {
  conn.on('open', () => {
    conn.send({
      type: 'SYNC_STATE',
      payload: {
        quizState: localQuizState,
        teams: registeredTeams,
        submissions: roundSubmissions[localQuizState.currentQuestionId] || {}
      }
    });
  });

  conn.on('data', (data) => {
    handleHostIncomingData(conn, data);
  });

  conn.on('close', () => {
    for (const [tId, c] of hostConnMap.entries()) {
      if (c === conn) {
        if (registeredTeams[tId]) {
          registeredTeams[tId].online = false;
          registeredTeams[tId].lastSeen = Date.now();
          broadcastHostTeams();
        }
        hostConnMap.delete(tId);
        break;
      }
    }
  });
}

function handleHostIncomingData(conn, msg) {
  const { type, payload } = msg;

  switch (type) {
    case 'REGISTER_TEAM': {
      const { teamId, teamName } = payload;
      if (teamId && teamName) {
        hostConnMap.set(teamId, conn);
        registeredTeams[teamId] = {
          teamId,
          teamName,
          online: true,
          lastSeen: Date.now()
        };
        broadcastHostTeams();
      }
      break;
    }

    case 'SUBMIT_ANSWER': {
      const { questionId, teamId, teamName, optionIndex, optionText, timeTakenMs } = payload;
      if (!questionId || !teamId) return;

      if (!roundSubmissions[questionId]) {
        roundSubmissions[questionId] = {};
      }

      const subRecord = {
        teamId,
        teamName,
        optionIndex,
        optionText,
        timestamp: Date.now(),
        timeTakenMs
      };

      roundSubmissions[questionId][teamId] = subRecord;
      broadcastHostSubmissions(questionId);

      if (!localQuizState.winner && localQuizState.status === 'live') {
        localQuizState.winner = {
          teamId,
          teamName,
          selectedOptionIndex: optionIndex,
          selectedOptionText: optionText,
          timestamp: Date.now(),
          timeTakenMs
        };
        localQuizState.status = 'winner_selected';
        broadcastHostState();
      }
      break;
    }
  }
}

function handleClientIncomingData(data) {
  const { type, payload } = data;

  switch (type) {
    case 'SYNC_STATE': {
      localQuizState = payload.quizState;
      registeredTeams = payload.teams;
      notifyAll();
      break;
    }

    case 'STATE_UPDATE': {
      localQuizState = payload;
      stateListeners.forEach((cb) => cb(localQuizState));
      break;
    }

    case 'TEAMS_UPDATE': {
      registeredTeams = payload;
      teamListeners.forEach((cb) => cb(registeredTeams));
      break;
    }

    case 'SUBMISSIONS_UPDATE': {
      const { questionId, submissions } = payload;
      roundSubmissions[questionId] = submissions;
      const set = submissionListeners.get(questionId);
      if (set) set.forEach((cb) => cb(submissions));
      break;
    }
  }
}

function broadcastHostState() {
  stateListeners.forEach((cb) => cb(localQuizState));
  hostConnMap.forEach((conn) => {
    try { conn.send({ type: 'STATE_UPDATE', payload: localQuizState }); } catch (e) {}
  });
}

function broadcastHostTeams() {
  teamListeners.forEach((cb) => cb(registeredTeams));
  hostConnMap.forEach((conn) => {
    try { conn.send({ type: 'TEAMS_UPDATE', payload: registeredTeams }); } catch (e) {}
  });
}

function broadcastHostSubmissions(questionId) {
  const subs = roundSubmissions[questionId] || {};
  const set = submissionListeners.get(questionId);
  if (set) set.forEach((cb) => cb(subs));

  hostConnMap.forEach((conn) => {
    try {
      conn.send({
        type: 'SUBMISSIONS_UPDATE',
        payload: { questionId, submissions: subs }
      });
    } catch (e) {}
  });
}

function notifyConn(status) {
  connListeners.forEach((cb) => cb(status));
}

function notifyAll() {
  stateListeners.forEach((cb) => cb(localQuizState));
  teamListeners.forEach((cb) => cb(registeredTeams));
}

export function subscribePeerConn(cb) {
  connListeners.add(cb);
  cb(isConnected);
  return () => connListeners.delete(cb);
}

export function subscribePeerState(cb) {
  stateListeners.add(cb);
  if (localQuizState) cb(localQuizState);
  return () => stateListeners.delete(cb);
}

export function subscribePeerTeams(cb) {
  teamListeners.add(cb);
  if (registeredTeams) cb(registeredTeams);
  return () => teamListeners.delete(cb);
}

export function subscribePeerSubmissions(qId, cb) {
  if (!submissionListeners.has(qId)) {
    submissionListeners.set(qId, new Set());
  }
  submissionListeners.get(qId).add(cb);
  if (roundSubmissions[qId]) cb(roundSubmissions[qId]);
  return () => submissionListeners.get(qId)?.delete(cb);
}

export function registerPeerTeam(teamId, teamName) {
  if (isHostMode) {
    registeredTeams[teamId] = { teamId, teamName, online: true, lastSeen: Date.now() };
    broadcastHostTeams();
  } else if (clientConn && clientConn.open) {
    clientConn.send({
      type: 'REGISTER_TEAM',
      payload: { teamId, teamName }
    });
  }
}

export function removePeerTeam(teamId) {
  if (isHostMode) {
    delete registeredTeams[teamId];
    if (hostConnMap.has(teamId)) {
      try { hostConnMap.get(teamId).close(); } catch (e) {}
      hostConnMap.delete(teamId);
    }
    broadcastHostTeams();
  }
}

export function clearAllPeerTeams() {
  if (isHostMode) {
    registeredTeams = {};
    hostConnMap.forEach((conn) => {
      try { conn.close(); } catch (e) {}
    });
    hostConnMap.clear();
    broadcastHostTeams();
  }
}

export async function submitPeerAnswer(questionId, teamId, teamName, optionIndex, optionText, timeTakenMs) {
  const payload = { questionId, teamId, teamName, optionIndex, optionText, timeTakenMs };
  if (isHostMode) {
    handleHostIncomingData(null, { type: 'SUBMIT_ANSWER', payload });
  } else if (clientConn && clientConn.open) {
    clientConn.send({ type: 'SUBMIT_ANSWER', payload });
  }
  return { success: true };
}

export async function startPeerQuestion(qData) {
  localQuizState = {
    status: 'live',
    currentQuestionId: qData.id,
    currentQuestion: qData,
    questionStartTime: Date.now(),
    winner: null
  };
  broadcastHostState();
}

export async function endPeerQuestion() {
  localQuizState.status = 'locked';
  broadcastHostState();
}

export async function resetPeerQuestion(qData) {
  const qId = qData?.id || localQuizState.currentQuestionId;
  if (qId) {
    roundSubmissions[qId] = {};
    broadcastHostSubmissions(qId);
  }
  localQuizState = {
    status: 'waiting',
    currentQuestionId: qId,
    currentQuestion: qData || { number: 1 },
    questionStartTime: null,
    winner: null
  };
  broadcastHostState();
}
