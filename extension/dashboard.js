// Tab navigation control
const navItems = document.querySelectorAll('.nav-item');
const tabs = document.querySelectorAll('.dashboard-tab');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(nav => nav.classList.remove('active'));
    tabs.forEach(tab => tab.classList.remove('active'));
    
    item.classList.add('active');
    const tabId = `tab-${item.getAttribute('data-tab')}`;
    document.getElementById(tabId).classList.add('active');
  });
});

// Server states
const connBadge = document.getElementById('dashboard-conn-badge');
const connText = document.getElementById('dashboard-conn-text');

// Form elements
const profileForm = document.getElementById('profile-form');
const settingsForm = document.getElementById('settings-form');
const clearHistoryBtn = document.getElementById('btn-clear-history');
const clearLogsBtn = document.getElementById('btn-clear-dash-logs');
const dashTerminalBox = document.getElementById('dash-terminal-box');

// Stats metrics counter selectors
const statDiscovered = document.getElementById('stat-discovered');
const statPending = document.getElementById('stat-pending');
const statApplied = document.getElementById('stat-applied');
const statIgnored = document.getElementById('stat-ignored');
const queueTableBody = document.getElementById('queue-table-body');

// Check local server connection status
let isConnected = false;

function checkServerStatus() {
  chrome.runtime.sendMessage({ action: 'checkConnection' }, (response) => {
    isConnected = response && response.connected;
    if (isConnected) {
      connBadge.className = 'conn-indicator online';
      connText.textContent = 'Online';
      loadDashboardData();
    } else {
      connBadge.className = 'conn-indicator';
      connText.textContent = 'Offline (Start Gateway)';
    }
  });
}

// Load configurations from REST APIs
async function loadDashboardData() {
  try {
    // 1. Fetch Profile
    const profRes = await fetch('http://127.0.0.1:18789/api/profile');
    if (profRes.ok) {
      const profile = await profRes.json();
      populateProfileForm(profile);
    }

    // 2. Fetch Settings
    const setRes = await fetch('http://127.0.0.1:18789/api/settings');
    if (setRes.ok) {
      const settings = await setRes.json();
      populateSettingsForm(settings);
    }

    // 3. Fetch History List
    const histRes = await fetch('http://127.0.0.1:18789/api/history');
    if (histRes.ok) {
      const history = await histRes.json();
      updateHistoryTable(history);
    }
  } catch (err) {
    console.error('Failed fetching data from local server:', err);
  }
}

function populateProfileForm(profile) {
  document.getElementById('prof-firstName').value = profile.firstName || '';
  document.getElementById('prof-lastName').value = profile.lastName || '';
  document.getElementById('prof-email').value = profile.email || '';
  document.getElementById('prof-phone').value = profile.phone || '';
  document.getElementById('prof-city').value = profile.city || '';
  document.getElementById('prof-country').value = profile.country || '';
  document.getElementById('prof-linkedin').value = profile.linkedin || '';
  document.getElementById('prof-github').value = profile.github || '';
  document.getElementById('prof-portfolio').value = profile.portfolio || '';
  document.getElementById('prof-experience').value = profile.experience || 0;
  
  document.getElementById('prof-remote').checked = !!profile.remote;
  document.getElementById('prof-relocate').checked = !!profile.relocate;
  document.getElementById('prof-sponsorship').checked = !!profile.visaSponsorship;
  
  document.getElementById('prof-skills').value = profile.additionalInfo?.skills || '';
  document.getElementById('prof-salary').value = profile.additionalInfo?.salaryExpectation || '';
  document.getElementById('prof-notice').value = profile.additionalInfo?.noticePeriod || '';
}

function populateSettingsForm(settings) {
  document.getElementById('sett-mode').value = settings.mode || 'approval';
  document.getElementById('sett-crawlerEnabled').checked = !!settings.crawlerEnabled;
  document.getElementById('sett-crawlInterval').value = settings.crawlIntervalMinutes || 60;
  document.getElementById('sett-matchThreshold').value = settings.matchThreshold || 70;
  document.getElementById('sett-routerUrl').value = settings.routerUrl || 'http://127.0.0.1:20128/v1';
  document.getElementById('sett-apiKey').value = settings.apiKey || '';
  document.getElementById('sett-telegramEnabled').checked = !!settings.telegramEnabled;
}

function updateHistoryTable(history) {
  // Compute counts
  let discCount = 0;
  let pendCount = 0;
  let appCount = 0;
  let ignCount = 0;

  history.forEach(item => {
    if (item.status === 'discovered') discCount++;
    else if (item.status === 'pending_approval') pendCount++;
    else if (item.status === 'applied') appCount++;
    else if (item.status === 'ignored') ignCount++;
  });

  statDiscovered.textContent = discCount + pendCount + appCount + ignCount;
  statPending.textContent = pendCount;
  statApplied.textContent = appCount;
  statIgnored.textContent = ignCount;

  if (history.length === 0) {
    queueTableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #6b7280; padding: 30px;">
          Queue empty. Populate positions by crawling or browsing platforms.
        </td>
      </tr>`;
    return;
  }

  queueTableBody.innerHTML = '';
  history.forEach(job => {
    const row = document.createElement('tr');
    
    // Match score class
    let matchClass = 'match-low';
    const score = job.score || 0;
    if (score >= 80) matchClass = 'match-high';
    else if (score >= 60) matchClass = 'match-med';

    // Status label
    const statusText = job.status.replace('_', ' ');

    row.innerHTML = `
      <td>
        <div style="font-weight: 700;">${escapeHtml(job.title)}</div>
        <div style="font-size: 11px; color: #9ca3af;">${escapeHtml(job.company)} - ${escapeHtml(job.location)}</div>
        <div style="font-size: 10px; color: #818cf8; word-break: break-all; margin-top: 4px;">${escapeHtml(job.url)}</div>
      </td>
      <td>LinkedIn / Web</td>
      <td>
        <div class="match-badge ${matchClass}">${score}%</div>
        <div style="font-size: 10px; color: #9ca3af; max-width: 200px; margin-top: 4px; line-height: 1.2;">${escapeHtml(job.reason || '')}</div>
      </td>
      <td>
        <span class="status-pill ${job.status}">${escapeHtml(statusText)}</span>
      </td>
      <td>
        ${job.status === 'pending_approval' ? `
          <div style="display: flex; gap: 6px;">
            <button class="action-btn-small btn-apply-table" onclick="approveTableRun('${job.url}', 'SUBMIT')">Approve</button>
            <button class="action-btn-small" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);" onclick="approveTableRun('${job.url}', 'CANCEL')">Cancel</button>
          </div>
        ` : job.status === 'discovered' ? `
          <button class="action-btn-small btn-apply-table" onclick="applyTableRun('${job.url}')">Apply Now</button>
        ` : `
          <span style="font-size: 11px; color: #6b7280; font-weight: 600;">Complete</span>
        `}
      </td>
    `;
    queueTableBody.appendChild(row);
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// REST Form Save Handlers
profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isConnected) return alert('Cannot save. Local server is offline.');

  const payload = {
    firstName: document.getElementById('prof-firstName').value,
    lastName: document.getElementById('prof-lastName').value,
    email: document.getElementById('prof-email').value,
    phone: document.getElementById('prof-phone').value,
    city: document.getElementById('prof-city').value,
    country: document.getElementById('prof-country').value,
    linkedin: document.getElementById('prof-linkedin').value,
    github: document.getElementById('prof-github').value,
    portfolio: document.getElementById('prof-portfolio').value,
    experience: parseInt(document.getElementById('prof-experience').value, 10) || 0,
    remote: document.getElementById('prof-remote').checked,
    relocate: document.getElementById('prof-relocate').checked,
    visaSponsorship: document.getElementById('prof-sponsorship').checked,
    additionalInfo: {
      skills: document.getElementById('prof-skills').value,
      salaryExpectation: document.getElementById('prof-salary').value,
      noticePeriod: document.getElementById('prof-notice').value
    }
  };

  try {
    const res = await fetch('http://127.0.0.1:18789/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert('Candidate Profile successfully updated!');
    }
  } catch (err) {
    alert('Failed to save profile on server.');
  }
});

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isConnected) return alert('Cannot save. Local server is offline.');

  const payload = {
    mode: document.getElementById('sett-mode').value,
    crawlerEnabled: document.getElementById('sett-crawlerEnabled').checked,
    crawlIntervalMinutes: parseInt(document.getElementById('sett-crawlInterval').value, 10) || 60,
    matchThreshold: parseInt(document.getElementById('sett-matchThreshold').value, 10) || 70,
    routerUrl: document.getElementById('sett-routerUrl').value,
    apiKey: document.getElementById('sett-apiKey').value,
    telegramEnabled: document.getElementById('sett-telegramEnabled').checked
  };

  try {
    const res = await fetch('http://127.0.0.1:18789/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert('Configuration Settings successfully updated!');
    }
  } catch (err) {
    alert('Failed to save settings on server.');
  }
});

// Dropzone file upload control
const dropzone = document.getElementById('cv-dropzone');
const fileInput = document.getElementById('cv-file-input');
const uploadStatus = document.getElementById('upload-status');

dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.style.borderColor = '#818cf8';
});

dropzone.addEventListener('dragleave', () => {
  dropzone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    uploadCVFile(files[0]);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    uploadCVFile(fileInput.files[0]);
  }
});

async function uploadCVFile(file) {
  if (file.type !== 'application/pdf') {
    return alert('Only PDF CV files are supported for auto-extraction.');
  }

  uploadStatus.style.color = '#818cf8';
  uploadStatus.textContent = 'Uploading and analyzing CV with LLM...';

  const formData = new FormData();
  formData.append('cv', file);

  try {
    const res = await fetch('http://127.0.0.1:18789/api/upload-cv', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      uploadStatus.style.color = '#10b981';
      uploadStatus.textContent = 'CV parsed successfully! Profile populated below.';
      populateProfileForm(data.profile);
    } else {
      uploadStatus.style.color = '#ef4444';
      uploadStatus.textContent = 'Failed to analyze CV: ' + data.error;
    }
  } catch (e) {
    console.error('CV upload error:', e);
    uploadStatus.style.color = '#ef4444';
    uploadStatus.textContent = 'Server communications error during upload.';
  }
}

// Clear History queue list
clearHistoryBtn.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to clear the entire job queue application history?')) return;
  try {
    await fetch('http://127.0.0.1:18789/api/clear-history', { method: 'POST' });
    loadDashboardData();
  } catch {}
});

// Logs clear control
clearLogsBtn.addEventListener('click', () => {
  dashTerminalBox.innerHTML = '';
});

// Global functions for inline action items in table queue
window.applyTableRun = function(url) {
  chrome.runtime.sendMessage({
    action: 'sendWSMessage',
    payload: { type: 'apply', url }
  });
  alert('Playwright browser runner started for URL. Switch to Logs or check the Side Panel to track progress.');
};

window.approveTableRun = function(url, action) {
  chrome.runtime.sendMessage({
    action: 'sendWSMessage',
    payload: { type: 'approve', url, action }
  });
};

// WebSocket log stream interceptor
function appendDashboardLog(text) {
  const line = document.createElement('div');
  line.style.marginBottom = '6px';
  line.style.wordBreak = 'break-all';

  if (text.includes('[ERROR]')) {
    line.style.color = '#ef4444';
  } else if (text.includes('[WARN]')) {
    line.style.color = '#fbbf24';
  } else {
    line.style.color = '#a1a1aa';
  }

  line.textContent = text.replace(/\\x1b\\[[0-9;]*m/g, '');
  dashTerminalBox.appendChild(line);
  dashTerminalBox.scrollTop = dashTerminalBox.scrollHeight;
}

// Receive messages from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'connectionStatus') {
    if (message.connected) {
      connBadge.className = 'conn-indicator online';
      connText.textContent = 'Online';
      loadDashboardData();
    } else {
      connBadge.className = 'conn-indicator';
      connText.textContent = 'Offline (Start Gateway)';
    }
  }

  if (message.action === 'gatewayMessage') {
    const data = message.payload;
    if (data.type === 'log') {
      appendDashboardLog(data.text);
    } 
    else if (data.type === 'history_update' || data.type === 'settings_update' || data.type === 'profile_update' || data.type === 'run_complete') {
      loadDashboardData();
    }
  }
});

// Initial load check
checkServerStatus();
setInterval(checkServerStatus, 5000);
