/**
 * ADMIN CONTROL CENTER CONTROLLER
 * Handles admin authentication, question bank management, question lifecycle control,
 * live connected team roster, and real-time millisecond submission logging.
 */

import {
  subscribeQuizState,
  subscribeConnectionStatus,
  subscribeTeams,
  subscribeSubmissions,
  startQuestion,
  endQuestion,
  resetQuestion,
  saveQuestionBank,
  subscribeQuestionBank
} from './firebase.js';

// Pre-configured Default Question Bank
const DEFAULT_QUESTIONS = [
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
    text: 'In Firebase Realtime Database, which API ensures atomic write operations across multiple clients?',
    options: ['set()', 'update()', 'runTransaction()', 'push()'],
    durationSec: 30
  },
  {
    id: 'q5',
    number: 5,
    text: 'What is the speed of light in vacuum approximately?',
    options: ['300,000 km/s', '150,000 km/s', '1,000,000 km/s', '500,000 km/s'],
    durationSec: 30
  }
];

// DOM Elements
const adminLoginCard = document.getElementById('admin-login-card');
const adminDashboardContainer = document.getElementById('admin-dashboard-container');
const adminLoginForm = document.getElementById('admin-login-form');
const adminUserInput = document.getElementById('admin-user-input');
const adminPassInput = document.getElementById('admin-pass-input');
const adminAuthError = document.getElementById('admin-auth-error');
const adminSessionBadge = document.getElementById('admin-session-badge');
const btnAdminLogout = document.getElementById('btn-admin-logout');

const adminConnectionBadge = document.getElementById('admin-connection-badge');
const adminConnText = document.getElementById('admin-conn-text');
const adminStatusBadge = document.getElementById('admin-status-badge');
const adminStatusText = document.getElementById('admin-status-text');

const onlineTeamCount = document.getElementById('online-team-count');
const teamsCountBadge = document.getElementById('teams-count-badge');
const adminTeamsList = document.getElementById('admin-teams-list');

const questionSelect = document.getElementById('question-select');
const btnAddCustomQ = document.getElementById('btn-add-custom-q');
const modalCustomQ = document.getElementById('modal-custom-q');
const customQForm = document.getElementById('custom-q-form');
const btnCloseModal = document.getElementById('btn-close-modal');

const adminQNumber = document.getElementById('admin-q-number');
const adminQText = document.getElementById('admin-q-text');
const adminOptionsPreview = document.getElementById('admin-options-preview');
const adminTimerDisplay = document.getElementById('admin-timer-display');

const btnStartQuestion = document.getElementById('btn-start-question');
const btnEndQuestion = document.getElementById('btn-end-question');
const btnResetQuestion = document.getElementById('btn-reset-question');
const btnNextQuestion = document.getElementById('btn-next-question');

const adminWinnerBanner = document.getElementById('admin-winner-banner');
const adminWinnerTeam = document.getElementById('admin-winner-team');
const adminWinnerTime = document.getElementById('admin-winner-time');
const adminWinnerOption = document.getElementById('admin-winner-option');
const adminWinnerCallout = document.getElementById('admin-winner-callout');

const submissionsTableBody = document.getElementById('submissions-table-body');

// Admin State
let questions = [...DEFAULT_QUESTIONS];
let currentQuestionIndex = 0;
let currentQuizState = null;
let timerInterval = null;
let currentSubscribersUnsubscribe = null;
let previousWinnerId = null;

// Initialize Admin App
function init() {
  checkAdminAuth();
  setupEventListeners();
  setupConnectionMonitor();
}

// 1. Authentication Check
function checkAdminAuth() {
  const isAuth = sessionStorage.getItem('quiz_admin_auth') === 'true';
  if (isAuth) {
    renderDashboard();
  } else {
    renderLoginCard();
  }
}

function renderLoginCard() {
  adminLoginCard.style.display = 'block';
  adminDashboardContainer.style.display = 'none';
  adminSessionBadge.style.display = 'none';
}

function renderDashboard() {
  adminLoginCard.style.display = 'none';
  adminDashboardContainer.style.display = 'block';
  adminSessionBadge.style.display = 'inline-flex';

  initializeQuestionBank();
  subscribeToQuizState();
  subscribeToTeamsRoster();
}

// 2. Setup Event Listeners
function setupEventListeners() {
  // Login Submit
  adminLoginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = adminUserInput.value.trim();
    const pass = adminPassInput.value.trim();

    if (user === 'admin' && pass === 'admin123') {
      sessionStorage.setItem('quiz_admin_auth', 'true');
      adminAuthError.style.display = 'none';
      renderDashboard();
    } else {
      adminAuthError.style.display = 'block';
    }
  });

  // Logout
  btnAdminLogout.addEventListener('click', () => {
    sessionStorage.removeItem('quiz_admin_auth');
    renderLoginCard();
  });

  // Start Question
  btnStartQuestion.addEventListener('click', async () => {
    const activeQ = questions[currentQuestionIndex];
    if (activeQ) {
      await startQuestion(activeQ);
    }
  });

  // End Question
  btnEndQuestion.addEventListener('click', async () => {
    await endQuestion();
  });

  // Reset Question
  btnResetQuestion.addEventListener('click', async () => {
    const activeQ = questions[currentQuestionIndex];
    await resetQuestion(activeQ);
  });

  // Next Question
  btnNextQuestion.addEventListener('click', async () => {
    if (currentQuestionIndex < questions.length - 1) {
      currentQuestionIndex++;
    } else {
      currentQuestionIndex = 0; // Loop back or keep at end
    }
    questionSelect.value = currentQuestionIndex;
    const activeQ = questions[currentQuestionIndex];
    renderQuestionPreview(activeQ);
    await resetQuestion(activeQ);
  });

  // Select Question from Dropdown
  questionSelect.addEventListener('change', async (e) => {
    currentQuestionIndex = parseInt(e.target.value, 10);
    const activeQ = questions[currentQuestionIndex];
    renderQuestionPreview(activeQ);
    await resetQuestion(activeQ);
  });

  // Modal Custom Question
  btnAddCustomQ.addEventListener('click', () => {
    modalCustomQ.style.display = 'flex';
  });

  btnCloseModal.addEventListener('click', () => {
    modalCustomQ.style.display = 'none';
  });

  customQForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newQ = {
      id: 'q_custom_' + Date.now(),
      number: questions.length + 1,
      text: document.getElementById('custom-q-text').value.trim(),
      options: [
        document.getElementById('custom-opt-1').value.trim(),
        document.getElementById('custom-opt-2').value.trim(),
        document.getElementById('custom-opt-3').value.trim(),
        document.getElementById('custom-opt-4').value.trim()
      ],
      durationSec: 30
    };

    questions.push(newQ);
    await saveQuestionBank(questions);
    modalCustomQ.style.display = 'none';
    customQForm.reset();
  });
}

// Setup Connection Monitor
function setupConnectionMonitor() {
  subscribeConnectionStatus((isConnected) => {
    if (isConnected) {
      adminConnectionBadge.className = 'status-badge badge-live';
      adminConnText.textContent = 'ONLINE';
    } else {
      adminConnectionBadge.className = 'status-badge badge-locked';
      adminConnText.textContent = 'OFFLINE';
    }
  });
}

// Initialize & Subscribe to Question Bank
function initializeQuestionBank() {
  subscribeQuestionBank((dbQuestions) => {
    if (dbQuestions && Array.isArray(dbQuestions) && dbQuestions.length > 0) {
      questions = dbQuestions;
    } else {
      saveQuestionBank(DEFAULT_QUESTIONS);
    }
    populateQuestionDropdown();
    if (questions[currentQuestionIndex]) {
      renderQuestionPreview(questions[currentQuestionIndex]);
    }
  });
}

function populateQuestionDropdown() {
  questionSelect.innerHTML = '';
  questions.forEach((q, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `Q${q.number || idx + 1}: ${q.text.substring(0, 30)}...`;
    questionSelect.appendChild(opt);
  });
  questionSelect.value = currentQuestionIndex;
}

// Render Question Preview Card
function renderQuestionPreview(q) {
  if (!q) return;
  adminQNumber.textContent = `QUESTION #${q.number || currentQuestionIndex + 1}`;
  adminQText.textContent = q.text;

  adminOptionsPreview.innerHTML = '';
  const labels = ['A', 'B', 'C', 'D'];
  q.options.forEach((optText, idx) => {
    const div = document.createElement('div');
    div.className = 'option-btn';
    div.style.cursor = 'default';
    div.innerHTML = `
      <div class="option-badge">${labels[idx] || idx + 1}</div>
      <div style="flex: 1;">${escapeHtml(optText)}</div>
    `;
    adminOptionsPreview.appendChild(div);
  });
}

// 3. Real-Time Quiz State Listener
function subscribeToQuizState() {
  subscribeQuizState((state) => {
    if (!state) return;
    currentQuizState = state;
    updateAdminUI(state);
  });
}

// Update Admin Controls & Status
function updateAdminUI(state) {
  const { status, winner, currentQuestion: q, questionStartTime, currentQuestionId } = state;

  // Status Badge Update
  updateAdminStatusBadge(status);

  // Button States Management
  if (status === 'live') {
    btnStartQuestion.disabled = true;
    btnEndQuestion.disabled = false;
  } else {
    btnStartQuestion.disabled = false;
    btnEndQuestion.disabled = true;
  }

  // Timer Sync
  startAdminTimer(questionStartTime, q?.durationSec || 30, status);

  // Winner Announcement Display
  if (winner && (status === 'winner_selected' || status === 'locked')) {
    adminWinnerBanner.style.display = 'block';
    adminWinnerTeam.textContent = winner.teamName || 'Unknown Team';
    adminWinnerTime.textContent = `${(winner.timeTakenMs / 1000).toFixed(2)}s`;
    
    const labels = ['A', 'B', 'C', 'D'];
    const label = labels[winner.selectedOptionIndex] || `#${winner.selectedOptionIndex + 1}`;
    adminWinnerOption.textContent = `Option ${label}: ${winner.selectedOptionText || ''}`;
    adminWinnerCallout.textContent = winner.teamName;

    // Play Audio Chime if new winner
    if (previousWinnerId !== winner.teamId) {
      previousWinnerId = winner.teamId;
      playWinnerChime();
    }
  } else {
    adminWinnerBanner.style.display = 'none';
    previousWinnerId = null;
  }

  // Subscribe to Live Submissions for the Active Question
  if (currentQuestionId) {
    if (typeof currentSubscribersUnsubscribe === 'function') {
      currentSubscribersUnsubscribe();
    }
    currentSubscribersUnsubscribe = subscribeSubmissions(currentQuestionId, (submissions) => {
      renderSubmissionsTable(submissions, winner?.teamId);
    });
  }
}

// Status Badge Styling
function updateAdminStatusBadge(status) {
  adminStatusBadge.className = 'status-badge ';
  switch (status) {
    case 'waiting':
      adminStatusBadge.classList.add('badge-waiting');
      adminStatusText.textContent = 'Waiting...';
      break;
    case 'live':
      adminStatusBadge.classList.add('badge-live');
      adminStatusText.textContent = 'Question Live';
      break;
    case 'locked':
      adminStatusBadge.classList.add('badge-locked');
      adminStatusText.textContent = 'Locked';
      break;
    case 'winner_selected':
      adminStatusBadge.classList.add('badge-winner');
      adminStatusText.textContent = 'Winner Selected';
      break;
    default:
      adminStatusBadge.classList.add('badge-waiting');
      adminStatusText.textContent = 'Waiting...';
      break;
  }
}

// 4. Render Live Teams Roster
function subscribeToTeamsRoster() {
  subscribeTeams((teamsMap) => {
    adminTeamsList.innerHTML = '';
    const teams = Object.values(teamsMap || {});
    const onlineTeams = teams.filter((t) => t.online);

    onlineTeamCount.textContent = `${onlineTeams.length} Online`;
    teamsCountBadge.textContent = `${onlineTeams.length} / ${teams.length} Online`;

    if (teams.length === 0) {
      adminTeamsList.innerHTML = `<span style="font-size: 0.85rem; color: var(--text-dim);">No teams registered yet...</span>`;
      return;
    }

    teams.forEach((t) => {
      const chip = document.createElement('div');
      chip.className = `team-chip ${t.online ? 'online' : ''}`;
      chip.innerHTML = `
        <span class="online-dot"></span>
        <span>${escapeHtml(t.teamName || t.teamId)}</span>
      `;
      adminTeamsList.appendChild(chip);
    });
  });
}

// 5. Render Submissions Table Feed
function renderSubmissionsTable(submissionsMap, winnerTeamId) {
  submissionsTableBody.innerHTML = '';
  const subs = Object.values(submissionsMap || {});

  if (subs.length === 0) {
    submissionsTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-dim); padding: 1.5rem 0;">
          No submissions received yet for this question.
        </td>
      </tr>
    `;
    return;
  }

  // Sort submissions chronologically by timestamp / response time
  subs.sort((a, b) => (a.timeTakenMs || 0) - (b.timeTakenMs || 0));

  const labels = ['A', 'B', 'C', 'D'];

  subs.forEach((s, idx) => {
    const isWinner = s.teamId === winnerTeamId || idx === 0;
    const tr = document.createElement('tr');
    if (isWinner) {
      tr.className = 'winner-row';
    }

    const rankDisplay = isWinner ? '🥇 1st (WINNER)' : `#${idx + 1}`;
    const optionDisplay = `Opt ${labels[s.optionIndex] || s.optionIndex + 1}`;
    const timeDisplay = `${((s.timeTakenMs || 0) / 1000).toFixed(2)}s`;

    tr.innerHTML = `
      <td>${rankDisplay}</td>
      <td><strong>${escapeHtml(s.teamName || s.teamId)}</strong></td>
      <td>${optionDisplay}</td>
      <td><code>${timeDisplay}</code></td>
    `;

    submissionsTableBody.appendChild(tr);
  });
}

// Timer Countdown
function startAdminTimer(questionStartTime, durationSec, status) {
  clearInterval(timerInterval);

  if (status !== 'live' || !questionStartTime) {
    adminTimerDisplay.textContent = `${durationSec}s`;
    adminTimerDisplay.classList.remove('danger');
    return;
  }

  const update = () => {
    const elapsedSec = Math.floor((Date.now() - questionStartTime) / 1000);
    const remainingSec = Math.max(0, durationSec - elapsedSec);

    adminTimerDisplay.textContent = `${remainingSec}s`;
    if (remainingSec <= 5) {
      adminTimerDisplay.classList.add('danger');
    } else {
      adminTimerDisplay.classList.remove('danger');
    }

    if (remainingSec <= 0) {
      clearInterval(timerInterval);
    }
  };

  update();
  timerInterval = setInterval(update, 500);
}

// Web Audio Synth Chime for Winner Notification
function playWinnerChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.3); // C6

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {
    // Audio context may be restricted by browser policy
  }
}

// Utility HTML Escaper
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', init);
