/**
 * TEAM INTERFACE CONTROLLER
 * Handles team identity, instant-touch response buzzer, lock-out mechanics,
 * double-click & refresh protection, and atomic winner feedback.
 */

import {
  subscribeQuizState,
  subscribeConnectionStatus,
  registerTeamPresence,
  submitTeamAnswer
} from './firebase.js';

// DOM Elements
const teamLoginContainer = document.getElementById('team-login-container');
const quizArenaContainer = document.getElementById('quiz-arena-container');
const teamLoginForm = document.getElementById('team-login-form');
const teamNameInput = document.getElementById('team-name-input');

const teamInfoBadge = document.getElementById('team-info-badge');
const currentTeamNameDisplay = document.getElementById('current-team-name-display');
const btnChangeTeam = document.getElementById('btn-change-team');
const teamConnectionBadge = document.getElementById('team-connection-badge');
const teamConnText = document.getElementById('team-conn-text');

const questionNumTag = document.getElementById('question-num-tag');
const liveQuizStatusBadge = document.getElementById('live-quiz-status-badge');
const liveStatusText = document.getElementById('live-status-text');

const viewWaiting = document.getElementById('view-waiting');
const viewLiveQuestion = document.getElementById('view-live-question');
const viewWinnerHero = document.getElementById('view-winner-hero');

const qHeaderTitle = document.getElementById('q-header-title');
const qTextDisplay = document.getElementById('q-text-display');
const optionsContainer = document.getElementById('options-container');
const teamCountdownTimer = document.getElementById('team-countdown-timer');
const submissionFeedbackBar = document.getElementById('submission-feedback-bar');

const winnerNameDisplay = document.getElementById('winner-name-display');
const winnerTimeDisplay = document.getElementById('winner-time-display');
const winnerOptionDisplay = document.getElementById('winner-option-display');
const yourTeamVictoryTag = document.getElementById('your-team-victory-tag');

// Application State
let currentTeam = {
  id: '',
  name: ''
};

let currentQuestion = null;
let quizState = null;
let timerInterval = null;
let isSubmitting = false;

// Initialize Team App
function init() {
  loadStoredTeamIdentity();
  setupEventListeners();
  setupConnectionMonitor();
  subscribeToQuizUpdates();
}

// 1. Load Team Identity from LocalStorage
function loadStoredTeamIdentity() {
  const savedName = localStorage.getItem('quiz_team_name');
  const savedId = localStorage.getItem('quiz_team_id');

  if (savedName && savedId) {
    currentTeam.name = savedName;
    currentTeam.id = savedId;
    renderTeamLoggedInUI();
    registerTeamPresence(currentTeam.id, currentTeam.name);
  } else {
    renderTeamLoginUI();
  }
}

// Render UI for Logged-In Team
function renderTeamLoggedInUI() {
  teamLoginContainer.style.display = 'none';
  quizArenaContainer.style.display = 'block';
  teamInfoBadge.style.display = 'inline-flex';
  currentTeamNameDisplay.textContent = currentTeam.name;
}

// Render UI for Team Login
function renderTeamLoginUI() {
  teamLoginContainer.style.display = 'block';
  quizArenaContainer.style.display = 'none';
  teamInfoBadge.style.display = 'none';
}

// Setup Form & Event Listeners
function setupEventListeners() {
  // Login Form Submission
  teamLoginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = teamNameInput.value.trim();
    if (!name) return;

    const id = 'team_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    currentTeam.name = name;
    currentTeam.id = id;

    localStorage.setItem('quiz_team_name', name);
    localStorage.setItem('quiz_team_id', id);

    renderTeamLoggedInUI();
    registerTeamPresence(currentTeam.id, currentTeam.name);
  });

  // Switch Team Identity
  btnChangeTeam.addEventListener('click', () => {
    if (confirm('Are you sure you want to switch your team name?')) {
      localStorage.removeItem('quiz_team_name');
      localStorage.removeItem('quiz_team_id');
      currentTeam = { id: '', name: '' };
      renderTeamLoginUI();
    }
  });

  // Anti-Refresh & Back Button Protections
  window.addEventListener('beforeunload', (e) => {
    if (isSubmitting) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// Setup Network Connection Monitor
function setupConnectionMonitor() {
  subscribeConnectionStatus((isConnected) => {
    if (isConnected) {
      teamConnectionBadge.className = 'status-badge badge-live';
      teamConnText.textContent = 'ONLINE';
    } else {
      teamConnectionBadge.className = 'status-badge badge-locked';
      teamConnText.textContent = 'OFFLINE';
    }
  });
}

// Real-Time Listener to Quiz Engine State
function subscribeToQuizUpdates() {
  subscribeQuizState((state) => {
    if (!state) return;
    quizState = state;
    currentQuestion = state.currentQuestion || null;
    updateQuizUI(state);
  });
}

// Dynamic UI State Machine Renderer
function updateQuizUI(state) {
  const { status, winner, currentQuestion: q, questionStartTime } = state;

  // Update Status Badges
  updateStatusBadge(status);

  // Update Question Counter Tag
  if (q && q.number) {
    questionNumTag.textContent = `Question ${q.number}`;
  }

  // Handle Views based on Quiz Status
  switch (status) {
    case 'waiting':
      renderWaitingView();
      break;

    case 'live':
      renderLiveQuestionView(q, questionStartTime);
      break;

    case 'locked':
    case 'closed':
      renderLockedView();
      break;

    case 'winner_selected':
      renderWinnerView(winner, q);
      break;

    default:
      renderWaitingView();
      break;
  }
}

// Render Status Badge
function updateStatusBadge(status) {
  liveQuizStatusBadge.className = 'status-badge ';
  switch (status) {
    case 'waiting':
      liveQuizStatusBadge.classList.add('badge-waiting');
      liveStatusText.textContent = 'Waiting...';
      break;
    case 'live':
      liveQuizStatusBadge.classList.add('badge-live');
      liveStatusText.textContent = 'Question Live';
      break;
    case 'locked':
      liveQuizStatusBadge.classList.add('badge-locked');
      liveStatusText.textContent = 'Question Locked';
      break;
    case 'winner_selected':
      liveQuizStatusBadge.classList.add('badge-winner');
      liveStatusText.textContent = 'Winner Selected';
      break;
    case 'closed':
      liveQuizStatusBadge.classList.add('badge-locked');
      liveStatusText.textContent = 'Closed';
      break;
  }
}

// 1. Render Waiting State
function renderWaitingView() {
  viewWaiting.style.display = 'block';
  viewLiveQuestion.style.display = 'none';
  viewWinnerHero.style.display = 'none';
  submissionFeedbackBar.style.display = 'none';
  clearInterval(timerInterval);
}

// 2. Render Live Question View
function renderLiveQuestionView(q, questionStartTime) {
  if (!q) return;

  viewWaiting.style.display = 'none';
  viewWinnerHero.style.display = 'none';
  viewLiveQuestion.style.display = 'block';

  qHeaderTitle.textContent = `QUESTION #${q.number || 1}`;
  qTextDisplay.textContent = q.text || 'Question Text';

  // Check if team has ALREADY answered this question in localStorage
  const hasAnsweredKey = `quiz_answered_${q.id}_${currentTeam.id}`;
  const alreadyAnswered = localStorage.getItem(hasAnsweredKey) === 'true';

  // Start Timer Sync
  startTimer(questionStartTime, q.durationSec || 30);

  // Render Options
  renderOptions(q.options || [], alreadyAnswered, q.id);
}

// Render 4 Option Buttons with Single-Click & Lock Protection
function renderOptions(options, alreadyAnswered, questionId) {
  optionsContainer.innerHTML = '';

  const labels = ['A', 'B', 'C', 'D'];

  options.forEach((optText, index) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.dataset.index = index;

    btn.innerHTML = `
      <div class="option-badge">${labels[index] || index + 1}</div>
      <div style="flex: 1;">${escapeHtml(optText)}</div>
    `;

    if (alreadyAnswered) {
      btn.disabled = true;
      const savedChoice = localStorage.getItem(`quiz_choice_${questionId}_${currentTeam.id}`);
      if (savedChoice == index) {
        btn.classList.add('selected');
      }
    } else {
      // Touch & Click Instant Listener (pointerdown handles touch + click instantly)
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        handleOptionSelection(questionId, index, optText, optionsContainer);
      });
    }

    optionsContainer.appendChild(btn);
  });

  if (alreadyAnswered) {
    submissionFeedbackBar.style.display = 'block';
  } else {
    submissionFeedbackBar.style.display = 'none';
  }
}

// Handle Single-Click Response & Atomic Submit Call
async function handleOptionSelection(questionId, optionIndex, optionText, container) {
  if (isSubmitting) return;
  isSubmitting = true;

  // 1. IMMEDIATELY disable all buttons on the DOM to prevent double tapping
  const buttons = container.querySelectorAll('.option-btn');
  buttons.forEach((b, idx) => {
    b.disabled = true;
    if (idx === optionIndex) {
      b.classList.add('selected');
    }
  });

  submissionFeedbackBar.style.display = 'block';

  // 2. Calculate Response Time in Milliseconds
  const startTime = quizState?.questionStartTime || Date.now();
  const timeTakenMs = Math.max(0, Date.now() - startTime);

  // 3. Save Submission state to localStorage to prevent refresh tricks
  const hasAnsweredKey = `quiz_answered_${questionId}_${currentTeam.id}`;
  localStorage.setItem(hasAnsweredKey, 'true');
  localStorage.setItem(`quiz_choice_${questionId}_${currentTeam.id}`, optionIndex);

  // 4. ATOMIC SUBMISSION TRANSACTION TO FIREBASE
  try {
    const res = await submitTeamAnswer(
      questionId,
      currentTeam.id,
      currentTeam.name,
      optionIndex,
      optionText,
      timeTakenMs
    );
    console.log('Submission Transaction Result:', res);
  } catch (err) {
    console.error('Failed to process submission:', err);
  } finally {
    isSubmitting = false;
  }
}

// 3. Render Locked View (When time expires or Admin locks question)
function renderLockedView() {
  const buttons = optionsContainer.querySelectorAll('.option-btn');
  buttons.forEach((b) => (b.disabled = true));
}

// 4. Render Winner View
function renderWinnerView(winner, q) {
  viewWaiting.style.display = 'none';

  if (winner) {
    viewWinnerHero.style.display = 'block';
    winnerNameDisplay.textContent = winner.teamName || 'Unknown Team';
    winnerTimeDisplay.textContent = `${(winner.timeTakenMs / 1000).toFixed(2)}s`;
    
    const labels = ['A', 'B', 'C', 'D'];
    const label = labels[winner.selectedOptionIndex] || `#${winner.selectedOptionIndex + 1}`;
    winnerOptionDisplay.textContent = `Option ${label}: ${winner.selectedOptionText || ''}`;

    // Highlight if YOUR team was the fastest!
    if (winner.teamId === currentTeam.id) {
      yourTeamVictoryTag.style.display = 'block';
    } else {
      yourTeamVictoryTag.style.display = 'none';
    }
  }
}

// Synced Countdown Timer
function startTimer(questionStartTime, durationSec) {
  clearInterval(timerInterval);
  if (!questionStartTime) {
    teamCountdownTimer.textContent = `${durationSec}s`;
    return;
  }

  const update = () => {
    const elapsedSec = Math.floor((Date.now() - questionStartTime) / 1000);
    const remainingSec = Math.max(0, durationSec - elapsedSec);

    teamCountdownTimer.textContent = `${remainingSec}s`;
    if (remainingSec <= 5) {
      teamCountdownTimer.classList.add('danger');
    } else {
      teamCountdownTimer.classList.remove('danger');
    }

    if (remainingSec <= 0) {
      clearInterval(timerInterval);
    }
  };

  update();
  timerInterval = setInterval(update, 500);
}

// HTML Escaper for Safety
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', init);
