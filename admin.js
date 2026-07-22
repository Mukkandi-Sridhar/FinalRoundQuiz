/**
 * HOST ADMIN CONTROLLER (4-OPTION RESPONSE ENGINE)
 * Question-free Stage Quiz Controller. Tracks connected teams,
 * highlights the winner and selected option (A, B, C, D) in real-time,
 * and provides one-click round resets.
 */

import {
  subscribeQuizState,
  subscribeConnectionStatus,
  subscribeTeams,
  subscribeSubmissions,
  startQuestion,
  resetQuestion
} from './firebase.js';

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

const adminRoundCounter = document.getElementById('admin-round-counter');
const btnStartQuestion = document.getElementById('btn-start-question');
const btnResetQuestion = document.getElementById('btn-reset-question');

const adminWinnerBanner = document.getElementById('admin-winner-banner');
const adminWinnerTeam = document.getElementById('admin-winner-team');
const adminWinnerTime = document.getElementById('admin-winner-time');
const adminWinnerOption = document.getElementById('admin-winner-option');
const adminWinnerCallout = document.getElementById('admin-winner-callout');
const adminWinnerOptCallout = document.getElementById('admin-winner-opt-callout');

const submissionsTableBody = document.getElementById('submissions-table-body');

// Admin State
let roundCount = 1;
let currentQuizState = null;
let currentSubscribersUnsubscribe = null;
let previousWinnerId = null;
let registeredTeamsMap = {};
let activeSubmissionsMap = {};

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function init() {
  checkAdminAuth();
  setupEventListeners();
  setupConnectionMonitor();
}

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

  subscribeToQuizState();
  subscribeToTeamsRoster();
}

function setupEventListeners() {
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

  btnAdminLogout.addEventListener('click', () => {
    sessionStorage.removeItem('quiz_admin_auth');
    renderLoginCard();
  });

  // OPEN OPTIONS NOW
  btnStartQuestion.addEventListener('click', async () => {
    await startQuestion({
      id: `round_${roundCount}`,
      number: roundCount,
      options: ['Option A', 'Option B', 'Option C', 'Option D']
    });
  });

  // RESET / NEXT ROUND
  btnResetQuestion.addEventListener('click', async () => {
    roundCount++;
    adminRoundCounter.textContent = `ROUND #${roundCount}`;
    await resetQuestion({
      id: `round_${roundCount}`,
      number: roundCount,
      options: ['Option A', 'Option B', 'Option C', 'Option D']
    });
  });
}

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

function subscribeToQuizState() {
  subscribeQuizState((state) => {
    if (!state) return;
    currentQuizState = state;
    updateAdminUI(state);
  });
}

function updateAdminUI(state) {
  const { status, winner, currentQuestionId, currentQuestion } = state;

  if (currentQuestion && currentQuestion.number) {
    roundCount = currentQuestion.number;
    adminRoundCounter.textContent = `ROUND #${roundCount}`;
  }

  updateAdminStatusBadge(status);

  if (status === 'live') {
    btnStartQuestion.disabled = true;
    btnStartQuestion.textContent = '▶️ OPTIONS OPEN & LIVE';
  } else {
    btnStartQuestion.disabled = false;
    btnStartQuestion.textContent = '▶️ OPEN OPTIONS NOW';
  }

  // PROMINENT WINNER HIGHLIGHT
  if (winner && (status === 'winner_selected' || status === 'locked')) {
    const optLabel = OPTION_LABELS[winner.selectedOptionIndex] || `Option ${winner.selectedOptionIndex + 1}`;
    
    adminWinnerBanner.style.display = 'block';
    adminWinnerTeam.textContent = winner.teamName || 'Unknown Team';
    adminWinnerTime.textContent = `${((winner.timeTakenMs || 0) / 1000).toFixed(2)}s`;
    adminWinnerOption.textContent = `Option ${optLabel}`;

    adminWinnerCallout.textContent = winner.teamName || 'Team';
    adminWinnerOptCallout.textContent = `Option ${optLabel}`;

    if (previousWinnerId !== winner.teamId) {
      previousWinnerId = winner.teamId;
      playWinnerChime();
    }
  } else {
    adminWinnerBanner.style.display = 'none';
    previousWinnerId = null;
  }

  renderTeamsRoster();

  const roundId = currentQuestionId || `round_${roundCount}`;
  if (typeof currentSubscribersUnsubscribe === 'function') {
    currentSubscribersUnsubscribe();
  }
  currentSubscribersUnsubscribe = subscribeSubmissions(roundId, (subs) => {
    activeSubmissionsMap = subs || {};
    renderSubmissionsTable(subs, winner?.teamId);
    renderTeamsRoster();
  });
}

function updateAdminStatusBadge(status) {
  adminStatusBadge.className = 'status-badge ';
  switch (status) {
    case 'waiting':
      adminStatusBadge.classList.add('badge-waiting');
      adminStatusText.textContent = 'Waiting to Open';
      break;
    case 'live':
      adminStatusBadge.classList.add('badge-live');
      adminStatusText.textContent = 'OPTIONS LIVE!';
      break;
    case 'winner_selected':
      adminStatusBadge.classList.add('badge-winner');
      adminStatusText.textContent = 'Winner Declared';
      break;
    default:
      adminStatusBadge.classList.add('badge-waiting');
      adminStatusText.textContent = 'Waiting';
      break;
  }
}

function subscribeToTeamsRoster() {
  subscribeTeams((teamsMap) => {
    registeredTeamsMap = teamsMap || {};
    renderTeamsRoster();
  });
}

function renderTeamsRoster() {
  adminTeamsList.innerHTML = '';
  const teams = Object.values(registeredTeamsMap);
  const onlineTeams = teams.filter((t) => t.online);
  const winnerTeamId = currentQuizState?.winner?.teamId;

  onlineTeamCount.textContent = `${onlineTeams.length} Online`;
  teamsCountBadge.textContent = `${onlineTeams.length} / ${teams.length} Registered`;

  if (teams.length === 0) {
    adminTeamsList.innerHTML = `<span style="font-size: 0.85rem; color: var(--text-dim);">No teams registered yet...</span>`;
    return;
  }

  teams.forEach((t) => {
    const isWinner = t.teamId === winnerTeamId;
    const teamSub = activeSubmissionsMap[t.teamId];
    const hasClicked = Boolean(teamSub);

    let extraClass = '';
    let optBadge = '';
    if (isWinner) {
      extraClass = 'winner-chip';
    } else if (hasClicked) {
      extraClass = 'buzzed';
    }

    if (teamSub && teamSub.optionIndex !== undefined) {
      const label = OPTION_LABELS[teamSub.optionIndex] || teamSub.optionIndex + 1;
      optBadge = ` [Opt ${label}]`;
    }

    const chip = document.createElement('div');
    chip.className = `team-chip ${t.online ? 'online' : ''} ${extraClass}`;

    const icon = isWinner ? '👑 ' : (hasClicked ? '🎯 ' : '');
    chip.innerHTML = `
      <span class="online-dot"></span>
      <span>${icon}${escapeHtml(t.teamName || t.teamId)}${optBadge}</span>
    `;

    adminTeamsList.appendChild(chip);
  });
}

function renderSubmissionsTable(submissionsMap, winnerTeamId) {
  submissionsTableBody.innerHTML = '';
  const subs = Object.values(submissionsMap || {});

  if (subs.length === 0) {
    submissionsTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-dim); padding: 1.5rem 0;">
          Waiting for team responses...
        </td>
      </tr>
    `;
    return;
  }

  subs.sort((a, b) => (a.timeTakenMs || 0) - (b.timeTakenMs || 0));

  subs.forEach((s, idx) => {
    const isWinner = s.teamId === winnerTeamId || idx === 0;
    const tr = document.createElement('tr');
    if (isWinner) {
      tr.className = 'winner-row';
    }

    const rankDisplay = isWinner ? '🥇 1st (WINNER)' : `#${idx + 1}`;
    const optLabel = OPTION_LABELS[s.optionIndex] || s.optionIndex + 1;
    const optionDisplay = `Option ${optLabel}`;
    const timeDisplay = `${((s.timeTakenMs || 0) / 1000).toFixed(2)}s`;

    tr.innerHTML = `
      <td>${rankDisplay}</td>
      <td><strong>${escapeHtml(s.teamName || s.teamId)}</strong></td>
      <td><span class="status-badge badge-waiting" style="font-size:0.75rem;">${optionDisplay}</span></td>
      <td><code>${timeDisplay}</code></td>
    `;

    submissionsTableBody.appendChild(tr);
  });
}

function playWinnerChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {}
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', init);
