/**
 * TEAM STAGE BUZZER CONTROLLER
 * High-concurrency support: Generates unique device UUIDs to prevent name collisions
 * when 20+ teams join simultaneously across smartphones.
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

function getOrCreateDeviceId() {
  let uuid = localStorage.getItem('quiz_device_uuid');
  if (!uuid) {
    uuid = Math.random().toString(36).substring(2, 8) + Date.now().toString(36).slice(-4);
    localStorage.setItem('quiz_device_uuid', uuid);
  }
  return uuid;
}

function init() {
  loadStoredTeamIdentity();
  setupEventListeners();
  setupConnectionMonitor();
  subscribeToBuzzerState();
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

      const deviceUuid = getOrCreateDeviceId();
      const id = 'team_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + deviceUuid;
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

  if (giantBuzzerBtn) {
    giantBuzzerBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handleBuzzerPress();
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

function subscribeToBuzzerState() {
  subscribeQuizState((state) => {
    if (!state) return;
    currentRoundState = state;
    renderBuzzerState(state);
  });
}

function renderBuzzerState(state) {
  const { status, winner, currentQuestionId } = state;
  const roundId = currentQuestionId || 'r1';

  updateStatusBadge(status);

  const hasBuzzedKey = `buzzed_${roundId}_${currentTeam.id}`;
  const alreadyBuzzed = localStorage.getItem(hasBuzzedKey) === 'true';

  switch (status) {
    case 'waiting':
      if (viewWinnerHero) viewWinnerHero.style.display = 'none';
      if (giantBuzzerBtn) {
        giantBuzzerBtn.disabled = true;
        giantBuzzerBtn.className = 'giant-buzzer-btn';
      }
      if (buzzerBtnText) buzzerBtnText.textContent = 'WAITING...';
      if (buzzerSubtext) buzzerSubtext.textContent = 'Host will open buzzers shortly. Stand by!';
      break;

    case 'live':
      if (viewWinnerHero) viewWinnerHero.style.display = 'none';
      if (alreadyBuzzed) {
        if (giantBuzzerBtn) {
          giantBuzzerBtn.disabled = true;
          giantBuzzerBtn.className = 'giant-buzzer-btn buzzed';
        }
        if (buzzerBtnText) buzzerBtnText.textContent = 'BUZZED!';
        if (buzzerSubtext) buzzerSubtext.textContent = '🔒 Response locked. Waiting for host verdict...';
      } else {
        if (giantBuzzerBtn) {
          giantBuzzerBtn.disabled = false;
          giantBuzzerBtn.className = 'giant-buzzer-btn live';
        }
        if (buzzerBtnText) buzzerBtnText.textContent = 'PRESS BUZZER!';
        if (buzzerSubtext) buzzerSubtext.textContent = '⚡ TAP NOW TO CLAIM FIRST PLACE!';
      }
      break;

    case 'locked':
    case 'closed':
      if (giantBuzzerBtn) {
        giantBuzzerBtn.disabled = true;
        giantBuzzerBtn.className = 'giant-buzzer-btn';
      }
      if (buzzerBtnText) buzzerBtnText.textContent = 'LOCKED';
      if (buzzerSubtext) buzzerSubtext.textContent = 'Buzzers closed by Host.';
      break;

    case 'winner_selected':
      if (giantBuzzerBtn) {
        giantBuzzerBtn.disabled = true;
        giantBuzzerBtn.className = 'giant-buzzer-btn';
      }
      if (buzzerBtnText) buzzerBtnText.textContent = 'ROUND ENDED';
      if (buzzerSubtext) buzzerSubtext.textContent = 'Winner declared!';

      if (winner) {
        if (viewWinnerHero) viewWinnerHero.style.display = 'block';
        if (winnerNameDisplay) winnerNameDisplay.textContent = winner.teamName || 'Unknown Team';
        if (winnerTimeDisplay) winnerTimeDisplay.textContent = `${((winner.timeTakenMs || 0) / 1000).toFixed(3)}s`;

        const isVictory = (winner.teamId === currentTeam.id);
        if (yourTeamVictoryTag) {
          yourTeamVictoryTag.style.display = isVictory ? 'block' : 'none';
        }
        if (isVictory) {
          triggerVictoryFanfare();
        }
      }
      break;
  }
}

async function handleBuzzerPress() {
  if (isSubmitting || !currentRoundState || currentRoundState.status !== 'live') return;
  isSubmitting = true;

  if (navigator.vibrate) {
    try { navigator.vibrate([100, 50, 100]); } catch (e) {}
  }

  const roundId = currentRoundState.currentQuestionId || 'r1';

  if (giantBuzzerBtn) {
    giantBuzzerBtn.disabled = true;
    giantBuzzerBtn.className = 'giant-buzzer-btn buzzed';
  }
  if (buzzerBtnText) buzzerBtnText.textContent = 'BUZZED!';
  if (buzzerSubtext) buzzerSubtext.textContent = '🔒 Response locked. Waiting for host...';

  localStorage.setItem(`buzzed_${roundId}_${currentTeam.id}`, 'true');

  const startTime = currentRoundState.questionStartTime || Date.now();
  const reactionTimeMs = Math.max(0, Date.now() - startTime);

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

function triggerVictoryFanfare() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.1 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.1);
      osc.stop(ctx.currentTime + idx * 0.1 + 0.3);
    });
  } catch (e) {}
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
