/**
 * CLIENT WEBSOCKET WRAPPER
 * Connects directly to the zero-dependency Node.js server (`server.js`).
 * Provides sub-millisecond real-time synchronization across all local Wi-Fi devices.
 */

let socket = null;
let isConnected = false;
let reconnectTimer = null;

// Callbacks Subscriptions
const listeners = {
  connection: new Set(),
  quizState: new Set(),
  teams: new Set(),
  questions: new Set(),
  submissions: new Map() // questionId -> Set(callback)
};

// Cached State
let currentQuizState = null;
let currentTeams = {};
let currentQuestions = [];
let currentSubmissionsMap = {}; // questionId -> submissionsObj

function getWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:3000';
  return `${protocol}//${host}`;
}

export function initWebSocket() {
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    return;
  }

  const wsUrl = getWebSocketUrl();
  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      isConnected = true;
      notifyConnection(true);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    socket.onclose = () => {
      isConnected = false;
      notifyConnection(false);
      scheduleReconnect();
    };

    socket.onerror = () => {
      isConnected = false;
      notifyConnection(false);
    };
  } catch (err) {
    console.warn('WebSocket connection failed, will retry...', err);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    initWebSocket();
  }, 2000);
}

function notifyConnection(status) {
  listeners.connection.forEach((cb) => cb(status));
}

function handleServerMessage(msg) {
  const { type, payload } = msg;

  switch (type) {
    case 'INIT_SNAPSHOT': {
      currentQuizState = msg.quizState;
      currentTeams = msg.teams;
      currentQuestions = msg.questions;
      if (msg.quizState?.currentQuestionId && msg.submissions) {
        currentSubmissionsMap[msg.quizState.currentQuestionId] = msg.submissions;
      }
      notifyAll();
      break;
    }

    case 'QUIZ_STATE_UPDATE': {
      currentQuizState = msg.quizState;
      listeners.quizState.forEach((cb) => cb(currentQuizState));
      break;
    }

    case 'TEAMS_UPDATE': {
      currentTeams = msg.teams;
      listeners.teams.forEach((cb) => cb(currentTeams));
      break;
    }

    case 'QUESTIONS_UPDATE': {
      currentQuestions = msg.questions;
      listeners.questions.forEach((cb) => cb(currentQuestions));
      break;
    }

    case 'SUBMISSIONS_UPDATE': {
      const { questionId, submissions } = msg;
      currentSubmissionsMap[questionId] = submissions;
      const set = listeners.submissions.get(questionId);
      if (set) {
        set.forEach((cb) => cb(submissions));
      }
      break;
    }
  }
}

function notifyAll() {
  listeners.quizState.forEach((cb) => cb(currentQuizState));
  listeners.teams.forEach((cb) => cb(currentTeams));
  listeners.questions.forEach((cb) => cb(currentQuestions));
}

function send(payload) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  } else {
    initWebSocket();
    setTimeout(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    }, 300);
  }
}

// ==========================================
// PUBLIC SUBSCRIPTION APIS
// ==========================================

export function subscribeWsConnection(callback) {
  listeners.connection.add(callback);
  callback(isConnected);
  initWebSocket();
  return () => listeners.connection.delete(callback);
}

export function subscribeWsQuizState(callback) {
  listeners.quizState.add(callback);
  if (currentQuizState) callback(currentQuizState);
  initWebSocket();
  return () => listeners.quizState.delete(callback);
}

export function subscribeWsTeams(callback) {
  listeners.teams.add(callback);
  if (currentTeams) callback(currentTeams);
  initWebSocket();
  return () => listeners.teams.delete(callback);
}

export function subscribeWsSubmissions(questionId, callback) {
  if (!listeners.submissions.has(questionId)) {
    listeners.submissions.set(questionId, new Set());
  }
  listeners.submissions.get(questionId).add(callback);

  if (currentSubmissionsMap[questionId]) {
    callback(currentSubmissionsMap[questionId]);
  }
  initWebSocket();

  return () => {
    const set = listeners.submissions.get(questionId);
    if (set) set.delete(callback);
  };
}

export function subscribeWsQuestionBank(callback) {
  listeners.questions.add(callback);
  if (currentQuestions.length > 0) callback(currentQuestions);
  initWebSocket();
  return () => listeners.questions.delete(callback);
}

// ==========================================
// PUBLIC ACTION APIS
// ==========================================

export function registerWsTeamPresence(teamId, teamName) {
  send({
    type: 'REGISTER_TEAM',
    payload: { teamId, teamName }
  });
}

export async function submitWsTeamAnswer(questionId, teamId, teamName, optionIndex, optionText, timeTakenMs) {
  send({
    type: 'SUBMIT_ANSWER',
    payload: { questionId, teamId, teamName, optionIndex, optionText, timeTakenMs }
  });
  return { success: true };
}

export async function startWsQuestion(questionData) {
  send({
    type: 'START_QUESTION',
    payload: { question: questionData }
  });
}

export async function endWsQuestion() {
  send({ type: 'END_QUESTION' });
}

export async function resetWsQuestion(questionData) {
  send({
    type: 'RESET_QUESTION',
    payload: { question: questionData }
  });
}

export async function saveWsQuestionBank(questionsList) {
  send({
    type: 'SAVE_QUESTIONS',
    payload: { questions: questionsList }
  });
}
