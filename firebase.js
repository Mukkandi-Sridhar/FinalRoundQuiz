/**
 * HYBRID REALTIME ENGINE WRAPPER (FIREBASE + WEBRTC + WEBSOCKET + LOCAL SYNC)
 * Provides 100% Zero-Refresh Live Realtime Synchronization across all devices globally!
 */

import {
  initPeerEngine,
  subscribePeerConn,
  subscribePeerState,
  subscribePeerTeams,
  subscribePeerSubmissions,
  registerPeerTeam,
  submitPeerAnswer,
  startPeerQuestion,
  resetPeerQuestion
} from './peer-engine.js';

import {
  subscribeWsConnection,
  subscribeWsQuizState,
  subscribeWsTeams,
  subscribeWsSubmissions,
  registerWsTeamPresence,
  submitWsTeamAnswer,
  startWsQuestion,
  resetWsQuestion
} from './websocket.js';

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  onValue,
  runTransaction,
  onDisconnect,
  serverTimestamp,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// FIREBASE CONFIGURATION
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.databaseURL && 
  !firebaseConfig.databaseURL.includes("YOUR_PROJECT_ID")
);

const isGitHubPages = window.location.hostname.includes('github.io');
const isHostPage = window.location.pathname.includes('admin.html');

let app = null;
let db = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getDatabase(app);
  } catch (err) {
    console.warn("Firebase warning:", err);
  }
}

// Auto-initialize PeerJS WebRTC Engine if Firebase not set
if (!isFirebaseConfigured) {
  initPeerEngine(isHostPage);
}

const isWsServerMode = !isFirebaseConfigured && !isGitHubPages && window.location.protocol.startsWith('http');

// Local Fallback
class LocalMockDatabase {
  constructor() {
    this.channel = new BroadcastChannel("live_quiz_sync_channel");
    this.data = JSON.parse(localStorage.getItem("mock_quiz_rtdb") || "{}");
    if (!this.data.quizState) {
      this.data = {
        quizState: {
          status: "waiting",
          currentQuestionId: "round_1",
          questionStartTime: Date.now(),
          winner: null
        },
        teams: {},
        submissions: {},
        questions: []
      };
      this.save();
    }

    this.listeners = new Map();
    this.channel.onmessage = (event) => {
      if (event.data?.type === "SYNC") {
        this.data = event.data.payload;
        this.notifyAll();
      }
    };
  }

  save() {
    localStorage.setItem("mock_quiz_rtdb", JSON.stringify(this.data));
    this.channel.postMessage({ type: "SYNC", payload: this.data });
    this.notifyAll();
  }

  notifyAll() {
    this.listeners.forEach((callbacks, path) => {
      callbacks.forEach((cb) => cb(this.getValueAtPath(path)));
    });
  }

  getValueAtPath(path) {
    const parts = path.split("/").filter(Boolean);
    let curr = this.data;
    for (const p of parts) {
      if (curr && typeof curr === "object") curr = curr[p];
      else return null;
    }
    return curr;
  }

  setValueAtPath(path, val) {
    const parts = path.split("/").filter(Boolean);
    let curr = this.data;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!curr[parts[i]]) curr[parts[i]] = {};
      curr = curr[parts[i]];
    }
    curr[parts[parts.length - 1]] = val;
    this.save();
  }

  subscribe(path, callback) {
    if (!this.listeners.has(path)) this.listeners.set(path, new Set());
    this.listeners.get(path).add(callback);
    callback(this.getValueAtPath(path));
    return () => this.listeners.get(path)?.delete(callback);
  }
}

const mockDb = (!isFirebaseConfigured && !isWsServerMode) ? new LocalMockDatabase() : null;

// ==========================================
// UNIFIED ENGINE SUBSCRIPTIONS
// ==========================================

export function subscribeConnectionStatus(callback) {
  if (isFirebaseConfigured && db) {
    onValue(ref(db, ".info/connected"), (snap) => callback(snap.val() === true));
  } else if (isWsServerMode) {
    return subscribeWsConnection(callback);
  } else {
    return subscribePeerConn(callback);
  }
}

export function registerTeamPresence(teamId, teamName) {
  if (!teamId) return;

  registerPeerTeam(teamId, teamName);

  if (isFirebaseConfigured && db) {
    const teamRef = ref(db, `teams/${teamId}`);
    set(teamRef, { teamId, teamName, online: true, lastSeen: serverTimestamp() });
    onDisconnect(teamRef).update({ online: false, lastSeen: serverTimestamp() });
  } else if (isWsServerMode) {
    registerWsTeamPresence(teamId, teamName);
  } else if (mockDb) {
    const current = mockDb.getValueAtPath("teams") || {};
    current[teamId] = { teamId, teamName, online: true, lastSeen: Date.now() };
    mockDb.setValueAtPath("teams", current);
  }
}

export function subscribeQuizState(callback) {
  if (isFirebaseConfigured && db) {
    onValue(ref(db, "quizState"), (snap) => callback(snap.val() || {}));
  } else if (isWsServerMode) {
    return subscribeWsQuizState(callback);
  } else {
    return subscribePeerState(callback);
  }
}

export function subscribeTeams(callback) {
  if (isFirebaseConfigured && db) {
    onValue(ref(db, "teams"), (snap) => callback(snap.val() || {}));
  } else if (isWsServerMode) {
    return subscribeWsTeams(callback);
  } else {
    return subscribePeerTeams(callback);
  }
}

export function subscribeSubmissions(questionId, callback) {
  if (!questionId) return () => {};

  if (isFirebaseConfigured && db) {
    onValue(ref(db, `submissions/${questionId}`), (snap) => callback(snap.val() || {}));
  } else if (isWsServerMode) {
    return subscribeWsSubmissions(questionId, callback);
  } else {
    return subscribePeerSubmissions(questionId, callback);
  }
}

export async function submitTeamAnswer(questionId, teamId, teamName, optionIndex, optionText, timeTakenMs) {
  submitPeerAnswer(questionId, teamId, teamName, optionIndex, optionText, timeTakenMs);

  if (isFirebaseConfigured && db) {
    const record = { teamId, teamName, optionIndex, optionText, timestamp: serverTimestamp(), timeTakenMs };
    await set(ref(db, `submissions/${questionId}/${teamId}`), record);

    const winnerRef = ref(db, "quizState/winner");
    const result = await runTransaction(winnerRef, (currentWinner) => {
      if (currentWinner !== null && currentWinner !== undefined) return undefined;
      return { teamId, teamName, selectedOptionIndex: optionIndex, selectedOptionText: optionText, timestamp: serverTimestamp(), timeTakenMs };
    });

    if (result.committed && result.snapshot.exists()) {
      await set(ref(db, "quizState/status"), "winner_selected");
      return { success: true, isWinner: true };
    }
    return { success: true, isWinner: false };
  } else if (isWsServerMode) {
    return submitWsTeamAnswer(questionId, teamId, teamName, optionIndex, optionText, timeTakenMs);
  } else if (mockDb) {
    const state = mockDb.getValueAtPath("quizState") || {};
    const subs = mockDb.getValueAtPath(`submissions/${questionId}`) || {};
    subs[teamId] = { teamId, teamName, optionIndex, optionText, timestamp: Date.now(), timeTakenMs };
    mockDb.setValueAtPath(`submissions/${questionId}`, subs);

    if (!state.winner && state.status === "live") {
      state.winner = { teamId, teamName, selectedOptionIndex: optionIndex, selectedOptionText: optionText, timestamp: Date.now(), timeTakenMs };
      state.status = "winner_selected";
      mockDb.setValueAtPath("quizState", state);
      return { success: true, isWinner: true };
    }
    return { success: true, isWinner: false };
  }
}

export async function startQuestion(questionData) {
  startPeerQuestion(questionData);

  if (isFirebaseConfigured && db) {
    await set(ref(db, "quizState"), {
      status: "live",
      currentQuestionId: questionData.id,
      currentQuestion: questionData,
      questionStartTime: serverTimestamp(),
      winner: null
    });
  } else if (isWsServerMode) {
    return startWsQuestion(questionData);
  } else if (mockDb) {
    mockDb.setValueAtPath("quizState", {
      status: "live",
      currentQuestionId: questionData.id,
      currentQuestion: questionData,
      questionStartTime: Date.now(),
      winner: null
    });
  }
}

export async function endQuestion() {
  if (isFirebaseConfigured && db) {
    await update(ref(db, "quizState"), { status: "locked" });
  } else if (isWsServerMode) {
    return endWsQuestion();
  } else if (mockDb) {
    const state = mockDb.getValueAtPath("quizState") || {};
    state.status = "locked";
    mockDb.setValueAtPath("quizState", state);
  }
}

export async function resetQuestion(questionData = null) {
  resetPeerQuestion(questionData);

  if (isFirebaseConfigured && db) {
    const quizStateRef = ref(db, "quizState");
    const snapshot = await get(quizStateRef);
    const current = snapshot.val() || {};
    const target = questionData || current.currentQuestion;

    if (target?.id) await remove(ref(db, `submissions/${target.id}`));
    await set(quizStateRef, {
      status: "waiting",
      currentQuestionId: target?.id || "round_1",
      currentQuestion: target,
      questionStartTime: null,
      winner: null
    });
  } else if (isWsServerMode) {
    return resetWsQuestion(questionData);
  } else if (mockDb) {
    const current = mockDb.getValueAtPath("quizState") || {};
    const target = questionData || current.currentQuestion;
    if (target?.id) mockDb.setValueAtPath(`submissions/${target.id}`, {});
    mockDb.setValueAtPath("quizState", {
      status: "waiting",
      currentQuestionId: target?.id || "round_1",
      currentQuestion: target,
      questionStartTime: null,
      winner: null
    });
  }
}

export async function saveQuestionBank(questionsList) {
  if (isFirebaseConfigured && db) {
    await set(ref(db, "questions"), questionsList);
  }
}

export function subscribeQuestionBank(callback) {
  if (isFirebaseConfigured && db) {
    onValue(ref(db, "questions"), (snap) => callback(snap.val() || []));
  } else {
    callback([]);
  }
}
