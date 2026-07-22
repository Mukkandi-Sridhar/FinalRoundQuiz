/**
 * TEAM CONTROLLER (4-OPTION RESPONSE ENGINE)
 * Renders 4 touch option buttons (A, B, C, D) with single-touch atomic lock.
 * Hardened with safe optional chaining for 100% crash-proof rendering.
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
const winnerOptionDisplay = document.getElementById('winner-option-display');
const yourTeamVictoryTag = document.getElementById('your-team-victory-tag');

const optionsContainer = document.getElementById('options-container');
const submissionFeedbackBar = document.getElementById('submission-feedback-bar');
const optionsInstructionText = document.getElementById('options-instruction-text');

// State Variables
let currentTeam = { id: '', name: '' };
let currentRoundState = null;
let isSubmitting = false;

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function init() {
  loadStoredTeamIdentity();
  setupEventListeners();
  setupConnectionMonitor();
  subscribeToRoundState();
}

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
  if (teamLoginContainer) teamLoginContainer.style.display = 'none';
  if (quizArenaContainer) quizArenaContainer.style.display = 'block';
  if (teamInfoBadge) teamInfoBadge.style.display = 'inline-flex';
  if (currentTeamNameDisplay) currentTeamNameDisplay.textContent = currentTeam.name;
}

function renderTeamLoginUI() {
  if (teamLoginContainer) teamLoginContainer.style.display = 'block';
  if (quizArenaContainer) quizArenaContainer.style.display = 'none';
  if (teamInfoBadge) teamInfoBadge.style.display = 'none';
}

function setupEventListeners() {
  if (teamLoginForm) {
    teamLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = teamNameInput ? teamNameInput.value.trim() : '';
      if (!name) return;

      const id = 'team_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      currentTeam.name = name;
      currentTeam.id = id;

      localStorage.setItem('quiz_team_name', name);
      localStorage.setItem('quiz_team_id', id);

      renderTeamLoggedInUI();
      registerTeamPresence(currentTeam.id, currentTeam.name);
    });
  }

  if (btnChangeTeam) {
    btnChangeTeam.addEventListener('click', () => {
      if (confirm('Switch team identity?')) {
        localStorage.removeItem('quiz_team_name');
        localStorage.removeItem('quiz_team_id');
        currentTeam = { id: '', name: '' };
        renderTeamLoginUI();
      }
    });
  }
}

function setupConnectionMonitor() {
  subscribeConnectionStatus((isConnected) => {
    if (teamConnectionBadge) {
      teamConnectionBadge.className = 'status-badge ' + (isConnected ? 'badge-live' : 'badge-locked');
    }
    if (teamConnText) {
      teamConnText.textContent = isConnected ? 'ONLINE' : 'OFFLINE';
    }
  });
}

function subscribeToRoundState() {
  subscribeQuizState((state) => {
    if (!state) return;
    currentRoundState = state;
    renderOptionsState(state);
  });
}

function renderOptionsState(state) {
  const { status, winner, currentQuestionId, currentQuestion } = state;
  const roundId = currentQuestionId || 'r1';

  if (roundNumTag && currentQuestion && currentQuestion.number) {
    roundNumTag.textContent = `ROUND #${currentQuestion.number}`;
  }

  updateStatusBadge(status);

  const hasAnsweredKey = `answered_${roundId}_${currentTeam.id}`;
  const alreadyAnswered = localStorage.getItem(hasAnsweredKey) === 'true';
  const savedChoice = localStorage.getItem(`choice_${roundId}_${currentTeam.id}`);

  // Render 4 Option Buttons safely
  if (optionsContainer) {
    optionsContainer.innerHTML = '';
    OPTION_LABELS.forEach((label, idx) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.dataset.index = idx;
      btn.innerHTML = `
        <div class="option-badge">${label}</div>
        <div style="flex: 1;">Option ${label}</div>
      `;

      if (status !== 'live' || alreadyAnswered) {
        btn.disabled = true;
        if (alreadyAnswered && savedChoice == idx) {
          btn.classList.add('selected');
        }
      } else {
        btn.disabled = false;
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          handleOptionSelection(roundId, idx, `Option ${label}`);
        });
      }

      optionsContainer.appendChild(btn);
    });
  }

  // Handle Feedback & Banner View safely
  if (status === 'live') {
    if (viewWinnerHero) viewWinnerHero.style.display = 'none';
    if (optionsInstructionText) {
      optionsInstructionText.textContent = alreadyAnswered
        ? '🔒 Choice submitted. Waiting for fastest team declaration...'
        : '⚡ Tap your choice now!';
    }
    if (submissionFeedbackBar) {
      submissionFeedbackBar.style.display = alreadyAnswered ? 'block' : 'none';
    }
  } else if (status === 'waiting') {
    if (viewWinnerHero) viewWinnerHero.style.display = 'none';
    if (optionsInstructionText) {
      optionsInstructionText.textContent = 'Host will open options shortly. Stand by!';
    }
    if (submissionFeedbackBar) submissionFeedbackBar.style.display = 'none';
  } else if (status === 'winner_selected' || status === 'locked') {
    if (optionsInstructionText) optionsInstructionText.textContent = 'Round completed.';
    if (submissionFeedbackBar) submissionFeedbackBar.style.display = 'none';

    if (winner) {
      if (viewWinnerHero) viewWinnerHero.style.display = 'block';
      if (winnerNameDisplay) winnerNameDisplay.textContent = winner.teamName || 'Unknown Team';
      if (winnerTimeDisplay) winnerTimeDisplay.textContent = `${((winner.timeTakenMs || 0) / 1000).toFixed(2)}s`;
      
      const optLabel = OPTION_LABELS[winner.selectedOptionIndex] || `Option ${winner.selectedOptionIndex + 1}`;
      if (winnerOptionDisplay) winnerOptionDisplay.textContent = `Option ${optLabel}`;

      if (yourTeamVictoryTag) {
        yourTeamVictoryTag.style.display = (winner.teamId === currentTeam.id) ? 'block' : 'none';
      }
    }
  }
}

async function handleOptionSelection(roundId, optionIndex, optionText) {
  if (isSubmitting || !currentRoundState || currentRoundState.status !== 'live') return;
  isSubmitting = true;

  if (optionsContainer) {
    const buttons = optionsContainer.querySelectorAll('.option-btn');
    buttons.forEach((b, idx) => {
      b.disabled = true;
      if (idx === optionIndex) {
        b.classList.add('selected');
      }
    });
  }

  if (submissionFeedbackBar) submissionFeedbackBar.style.display = 'block';

  localStorage.setItem(`answered_${roundId}_${currentTeam.id}`, 'true');
  localStorage.setItem(`choice_${roundId}_${currentTeam.id}`, optionIndex);

  const startTime = currentRoundState.questionStartTime || Date.now();
  const timeTakenMs = Math.max(0, Date.now() - startTime);

  try {
    await submitTeamAnswer(
      roundId,
      currentTeam.id,
      currentTeam.name,
      optionIndex,
      optionText,
      timeTakenMs
    );
  } catch (err) {
    console.error('Option submit error:', err);
  } finally {
    isSubmitting = false;
  }
}

function updateStatusBadge(status) {
  if (!liveQuizStatusBadge || !liveStatusText) return;

  liveQuizStatusBadge.className = 'status-badge ';
  switch (status) {
    case 'waiting':
      liveQuizStatusBadge.classList.add('badge-waiting');
      liveStatusText.textContent = 'Waiting for Host';
      break;
    case 'live':
      liveQuizStatusBadge.classList.add('badge-live');
      liveStatusText.textContent = 'OPTIONS LIVE!';
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
