/**
 * HOST ADMIN CONTROLLER (STAGE BUZZER ENGINE)
 * Handles team roster, win counters, projector fullscreen mode, and millisecond feeds.
 */

import {
  subscribeQuizState,
  subscribeConnectionStatus,
  subscribeTeams,
  subscribeSubmissions,
  startQuestion,
  resetQuestion,
  removeTeam,
  clearAllTeams
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
const btnClearAllTeams = document.getElementById('btn-clear-all-teams');
const btnToggleProjector = document.getElementById('btn-toggle-projector');
const btnCloseProjector = document.getElementById('btn-close-projector');

const btnStartQuestion = document.getElementById('btn-start-question');
const btnResetQuestion = document.getElementById('btn-reset-question');

const adminWinnerBanner = document.getElementById('admin-winner-banner');
const adminWinnerTeam = document.getElementById('admin-winner-team');
const adminWinnerTime = document.getElementById('admin-winner-time');
const adminWinnerCallout = document.getElementById('admin-winner-callout');

const submissionsTableBody = document.getElementById('submissions-table-body');

// Admin State
let roundCount = 1;
let currentQuizState = null;
let currentSubscribersUnsubscribe = null;
let previousWinnerId = null;
let registeredTeamsMap = {};
let activeSubmissionsMap = {};
let teamWinsMap = {}; // teamId -> totalWins

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
  if (adminLoginCard) adminLoginCard.style.display = 'block';
  if (adminDashboardContainer) adminDashboardContainer.style.display = 'none';
  if (adminSessionBadge) adminSessionBadge.style.display = 'none';
}

function renderDashboard() {
  if (adminLoginCard) adminLoginCard.style.display = 'none';
  if (adminDashboardContainer) adminDashboardContainer.style.display = 'block';
  if (adminSessionBadge) adminSessionBadge.style.display = 'inline-flex';

  subscribeToQuizState();
  subscribeToTeamsRoster();
}

function setupEventListeners() {
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const user = adminUserInput ? adminUserInput.value.trim() : '';
      const pass = adminPassInput ? adminPassInput.value.trim() : '';

      if (user === 'admin' && pass === 'admin123') {
        sessionStorage.setItem('quiz_admin_auth', 'true');
        if (adminAuthError) adminAuthError.style.display = 'none';
        renderDashboard();
      } else {
        if (adminAuthError) adminAuthError.style.display = 'block';
      }
    });
  }

  if (btnAdminLogout) {
    btnAdminLogout.addEventListener('click', () => {
      sessionStorage.removeItem('quiz_admin_auth');
      renderLoginCard();
    });
  }

  if (btnStartQuestion) {
    btnStartQuestion.addEventListener('click', async () => {
      await startQuestion({
        id: `round_${roundCount}`,
        number: roundCount
      });
    });
  }

  if (btnResetQuestion) {
    btnResetQuestion.addEventListener('click', async () => {
      roundCount++;
      await resetQuestion({
        id: `round_${roundCount}`,
        number: roundCount
      });
    });
  }

  if (btnClearAllTeams) {
    btnClearAllTeams.addEventListener('click', async () => {
      if (confirm('Are you sure you want to remove ALL registered teams?')) {
        teamWinsMap = {};
        await clearAllTeams();
      }
    });
  }

  if (btnToggleProjector && adminWinnerBanner) {
    btnToggleProjector.addEventListener('click', () => {
      adminWinnerBanner.classList.toggle('projector-fullscreen');
      if (btnCloseProjector) {
        btnCloseProjector.style.display = adminWinnerBanner.classList.contains('projector-fullscreen') ? 'inline-block' : 'none';
      }
    });
  }
}

function setupConnectionMonitor() {
  subscribeConnectionStatus((isConnected) => {
    if (adminConnectionBadge) {
      adminConnectionBadge.className = 'status-badge ' + (isConnected ? 'badge-live' : 'badge-locked');
    }
    if (adminConnText) {
      adminConnText.textContent = isConnected ? 'ONLINE' : 'OFFLINE';
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
  const { status, winner, currentQuestionId } = state;

  updateAdminStatusBadge(status);

  if (btnStartQuestion) {
    if (status === 'live') {
      btnStartQuestion.disabled = true;
      btnStartQuestion.textContent = '🚨 BUZZERS OPEN & LIVE';
    } else {
      btnStartQuestion.disabled = false;
      btnStartQuestion.textContent = '🚨 OPEN BUZZERS NOW';
    }
  }

  if (winner && (status === 'winner_selected' || status === 'locked')) {
    if (adminWinnerBanner) adminWinnerBanner.style.display = 'block';
    if (adminWinnerTeam) adminWinnerTeam.textContent = winner.teamName || 'Unknown Team';
    if (adminWinnerTime) adminWinnerTime.textContent = `${((winner.timeTakenMs || 0) / 1000).toFixed(3)}s`;

    if (adminWinnerCallout) adminWinnerCallout.textContent = winner.teamName || 'Team';

    if (previousWinnerId !== winner.teamId) {
      previousWinnerId = winner.teamId;
      teamWinsMap[winner.teamId] = (teamWinsMap[winner.teamId] || 0) + 1;
      playWinnerChime();
    }
  } else {
    if (adminWinnerBanner) adminWinnerBanner.style.display = 'none';
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
  if (!adminStatusBadge || !adminStatusText) return;

  adminStatusBadge.className = 'status-badge ';
  switch (status) {
    case 'waiting':
      adminStatusBadge.classList.add('badge-waiting');
      adminStatusText.textContent = 'Waiting to Open';
      break;
    case 'live':
      adminStatusBadge.classList.add('badge-live');
      adminStatusText.textContent = 'BUZZERS OPEN';
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
  if (!adminTeamsList) return;
  adminTeamsList.innerHTML = '';
  const teams = Object.values(registeredTeamsMap);
  const onlineTeams = teams.filter((t) => t.online);
  const winnerTeamId = currentQuizState?.winner?.teamId;

  if (onlineTeamCount) onlineTeamCount.textContent = `${onlineTeams.length} Online`;
  if (teamsCountBadge) teamsCountBadge.textContent = `${onlineTeams.length} / ${teams.length} Registered`;

  if (teams.length === 0) {
    adminTeamsList.innerHTML = `<span style="font-size: 0.85rem; color: var(--text-dim);">No teams registered yet...</span>`;
    return;
  }

  teams.forEach((t) => {
    const isWinner = t.teamId === winnerTeamId;
    const hasBuzzed = Boolean(activeSubmissionsMap[t.teamId]);
    const winCount = teamWinsMap[t.teamId] || 0;

    let extraClass = '';
    if (isWinner) {
      extraClass = 'winner-chip';
    } else if (hasBuzzed) {
      extraClass = 'buzzed';
    }

    const winBadge = winCount > 0 ? `<span class="win-badge">🏆 ${winCount}</span>` : '';
    const chip = document.createElement('div');
    chip.className = `team-chip ${t.online ? 'online' : ''} ${extraClass}`;

    const icon = isWinner ? '👑 ' : (hasBuzzed ? '⚡ ' : '');
    chip.innerHTML = `
      <span class="online-dot"></span>
      <span>${icon}${escapeHtml(t.teamName || t.teamId)}</span>
      ${winBadge}
      <button class="btn-remove-single-team" data-id="${t.teamId}" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:0.75rem; margin-left:6px; font-weight:bold;" title="Remove this team">❌</button>
    `;

    const btnRemove = chip.querySelector('.btn-remove-single-team');
    if (btnRemove) {
      btnRemove.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Remove team "${t.teamName || t.teamId}"?`)) {
          delete teamWinsMap[t.teamId];
          await removeTeam(t.teamId);
        }
      });
    }

    adminTeamsList.appendChild(chip);
  });
}

function renderSubmissionsTable(submissionsMap, winnerTeamId) {
  if (!submissionsTableBody) return;
  submissionsTableBody.innerHTML = '';
  const subs = Object.values(submissionsMap || {});

  if (subs.length === 0) {
    submissionsTableBody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; color: var(--text-dim); padding: 1.5rem 0;">
          Waiting for team buzzes...
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
    const timeDisplay = `${((s.timeTakenMs || 0) / 1000).toFixed(3)}s`;

    tr.innerHTML = `
      <td>${rankDisplay}</td>
      <td><strong>${escapeHtml(s.teamName || s.teamId)}</strong></td>
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
