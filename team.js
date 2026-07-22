/**
 * STAGE BUZZER TEAM CONTROLLER
 * Ultra-fast single-touch buzzer button with sub-millisecond atomic locking.
 * Completely question-free for stage competitions.
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

const roundNumTag = document.getElementById('round-num-tag');
const liveQuizStatusBadge = document.getElementById('live-quiz-status-badge');
const liveStatusText = document.getElementById('live-status-text');

const viewWinnerHero = document.getElementById('view-winner-hero');
const winnerNameDisplay = document.getElementById('winner-name-display');
const winnerTimeDisplay = document.getElementById('winner-time-display');
const yourTeamVictoryTag = document.getElementById('your-team-victory-tag');

const giantBuzzerBtn = document.getElementById('giant-buzzer-btn');
const buzzerBtnText = document.getElementById('buzzer-btn-text');
const buzzerSubtext = document.getElementById('buzzer-subtext');

// State Variables
let currentTeam = { id: '', name: '' };
let currentRoundState = null;
let isSubmitting = false;

function init() {
  loadStoredTeamIdentity();
  setupEventListeners();
  setupConnectionMonitor();
  subscribeToBuzzerState();
}

// Load Identity from LocalStorage
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

function renderTeamLoggedInUI() {
  teamLoginContainer.style.display = 'none';
  quizArenaContainer.style.display = 'block';
  teamInfoBadge.style.display = 'inline-flex';
  currentTeamNameDisplay.textContent = currentTeam.name;
}

function renderTeamLoginUI() {
  teamLoginContainer.style.display = 'block';
  quizArenaContainer.style.display = 'none';
  teamInfoBadge.style.display = 'none';
}

function setupEventListeners() {
  // Login Submit
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

  // Switch Team
  btnChangeTeam.addEventListener('click', () => {
    if (confirm('Switch team identity?')) {
      localStorage.removeItem('quiz_team_name');
      localStorage.removeItem('quiz_team_id');
      currentTeam = { id: '', name: '' };
      renderTeamLoginUI();
    }
  });

  // GIANT BUZZER INSTANT TOUCH & CLICK LISTENER
  giantBuzzerBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handleBuzzerPress();
  });
}

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

// Subscribe to Realtime Engine State
function subscribeToBuzzerState() {
  subscribeQuizState((state) => {
    if (!state) return;
    currentRoundState = state;
    renderBuzzerState(state);
  });
}

// Render State Machine
function renderBuzzerState(state) {
  const { status, winner, currentQuestionId, questionStartTime } = state;
  const roundId = currentQuestionId || 'r1';

  updateStatusBadge(status);

  const hasBuzzedKey = `buzzed_${roundId}_${currentTeam.id}`;
  const alreadyBuzzed = localStorage.getItem(hasBuzzedKey) === 'true';

  switch (status) {
    case 'waiting':
      viewWinnerHero.style.display = 'none';
      giantBuzzerBtn.disabled = true;
      giantBuzzerBtn.className = 'giant-buzzer-btn';
      buzzerBtnText.textContent = 'WAITING...';
      buzzerSubtext.textContent = 'Host will open buzzers shortly. Stand by!';
      break;

    case 'live':
      viewWinnerHero.style.display = 'none';
      if (alreadyBuzzed) {
        giantBuzzerBtn.disabled = true;
        giantBuzzerBtn.className = 'giant-buzzer-btn buzzed';
        buzzerBtnText.textContent = 'BUZZED!';
        buzzerSubtext.textContent = '🔒 Response locked. Waiting for host verdict...';
      } else {
        giantBuzzerBtn.disabled = false;
        giantBuzzerBtn.className = 'giant-buzzer-btn live';
        buzzerBtnText.textContent = 'PRESS BUZZER!';
        buzzerSubtext.textContent = '⚡ TAP NOW TO CLAIM FIRST PLACE!';
      }
      break;

    case 'locked':
    case 'closed':
      giantBuzzerBtn.disabled = true;
      giantBuzzerBtn.className = 'giant-buzzer-btn';
      buzzerBtnText.textContent = 'LOCKED';
      buzzerSubtext.textContent = 'Buzzers closed by Host.';
      break;

    case 'winner_selected':
      giantBuzzerBtn.disabled = true;
      giantBuzzerBtn.className = 'giant-buzzer-btn';
      buzzerBtnText.textContent = 'ROUND ENDED';
      buzzerSubtext.textContent = 'Winner declared!';

      if (winner) {
        viewWinnerHero.style.display = 'block';
        winnerNameDisplay.textContent = winner.teamName || 'Unknown Team';
        winnerTimeDisplay.textContent = `${((winner.timeTakenMs || 0) / 1000).toFixed(2)}s`;

        if (winner.teamId === currentTeam.id) {
          yourTeamVictoryTag.style.display = 'block';
        } else {
          yourTeamVictoryTag.style.display = 'none';
        }
      }
      break;
  }
}

// Single-Touch Buzzer Press Handler
async function handleBuzzerPress() {
  if (isSubmitting || !currentRoundState || currentRoundState.status !== 'live') return;
  isSubmitting = true;

  const roundId = currentRoundState.currentQuestionId || 'r1';

  // 1. Immediately disable button & style visually
  giantBuzzerBtn.disabled = true;
  giantBuzzerBtn.className = 'giant-buzzer-btn buzzed';
  buzzerBtnText.textContent = 'BUZZED!';
  buzzerSubtext.textContent = '🔒 Response locked. Waiting for host...';

  // 2. Lock state in LocalStorage to prevent refresh tricks
  localStorage.setItem(`buzzed_${roundId}_${currentTeam.id}`, 'true');

  // 3. Calculate Reaction Time
  const startTime = currentRoundState.questionStartTime || Date.now();
  const reactionTimeMs = Math.max(0, Date.now() - startTime);

  // 4. ATOMIC SUBMISSION TRANSACTION TO REALTIME BACKEND
  try {
    await submitTeamAnswer(
      roundId,
      currentTeam.id,
      currentTeam.name,
      0,
      'Buzzer Pressed',
      reactionTimeMs
    );
  } catch (err) {
    console.error('Buzzer submit error:', err);
  } finally {
    isSubmitting = false;
  }
}

function updateStatusBadge(status) {
  liveQuizStatusBadge.className = 'status-badge ';
  switch (status) {
    case 'waiting':
      liveQuizStatusBadge.classList.add('badge-waiting');
      liveStatusText.textContent = 'Waiting for Host';
      break;
    case 'live':
      liveQuizStatusBadge.classList.add('badge-live');
      liveStatusText.textContent = 'BUZZER LIVE!';
      break;
    case 'locked':
      liveQuizStatusBadge.classList.add('badge-locked');
      liveStatusText.textContent = 'Locked';
      break;
    case 'winner_selected':
      liveQuizStatusBadge.classList.add('badge-winner');
      liveStatusText.textContent = 'Winner Declared';
      break;
  }
}

document.addEventListener('DOMContentLoaded', init);
