const connBadge = document.getElementById('conn-badge');
const connText = document.getElementById('conn-text');

const detectLoading = document.getElementById('detect-loading');
const detectResult = document.getElementById('detect-result');
const scoreCircleElement = document.getElementById('score-circle-element');
const scoreVal = document.getElementById('score-val');
const jobTitleVal = document.getElementById('job-title-val');
const scoreReasonVal = document.getElementById('score-reason-val');
const btnApplyCurrent = document.getElementById('btn-apply-current');

const runStatusCard = document.getElementById('run-status-card');
const activeUrlVal = document.getElementById('active-url-val');
const activeStateVal = document.getElementById('active-state-val');

const approvalCard = document.getElementById('approval-card');
const btnSubmitApprove = document.getElementById('btn-submit-approve');
const btnSubmitCancel = document.getElementById('btn-submit-cancel');

const logsBox = document.getElementById('logs-box');
const clearLogs = document.getElementById('clear-logs');

let activeJobUrl = null;

// Connect state check
function checkConnection() {
  chrome.runtime.sendMessage({ action: 'checkConnection' }, (response) => {
    updateConnectionUI(response && response.connected);
  });
}

function updateConnectionUI(connected) {
  if (connected) {
    connBadge.className = 'conn-badge connected';
    connText.textContent = 'Connected';
  } else {
    connBadge.className = 'conn-badge';
    connText.textContent = 'Offline';
  }
}

// Scrape active page and calculate AI Match Score
async function checkCurrentPageJob() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  const url = tab.url;
  const isSupported = url.includes('linkedin.com/jobs') || url.includes('indeed.com') || url.includes('wuzzuf.net');
  
  if (!isSupported) {
    detectLoading.style.display = 'block';
    detectLoading.innerHTML = '<span style="font-size: 13px; color: #a1a1aa;">Navigate to LinkedIn, Indeed, or Wuzzuf job listing...</span>';
    detectResult.style.display = 'none';
    return;
  }

  detectLoading.style.display = 'block';
  detectLoading.innerHTML = '<span style="font-size: 13px; color: #818cf8;">Scraping page context...</span>';
  detectResult.style.display = 'none';

  chrome.tabs.sendMessage(tab.id, { action: 'scrapeJobDetails' }, async (response) => {
    if (!response || !response.title) {
      detectLoading.innerHTML = '<span style="font-size: 13px; color: #ef4444;">Failed to extract job details. Try reloading page.</span>';
      return;
    }

    activeJobUrl = response.url;
    detectLoading.style.display = 'none';
    detectResult.style.display = 'block';
    
    jobTitleVal.textContent = `${response.title} at ${response.company || 'Unknown Company'}`;
    scoreVal.textContent = '--';
    scoreReasonVal.textContent = 'Calculating AI Match score...';
    scoreCircleElement.style.setProperty('--percent', '0%');

    try {
      // Query local Gateway Server for AI Score
      const res = await fetch('http://127.0.0.1:18789/api/score-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response)
      });
      
      const data = await res.json();
      if (data && data.score !== undefined) {
        scoreVal.textContent = data.score;
        scoreReasonVal.textContent = data.reason;
        scoreCircleElement.style.setProperty('--percent', `${data.score}%`);
        
        // Color coding score
        if (data.score >= 80) {
          scoreCircleElement.style.background = `conic-gradient(#10b981 ${data.score}%, rgba(255,255,255,0.05) 0)`;
        } else if (data.score >= 60) {
          scoreCircleElement.style.background = `conic-gradient(#f59e0b ${data.score}%, rgba(255,255,255,0.05) 0)`;
        } else {
          scoreCircleElement.style.background = `conic-gradient(#ef4444 ${data.score}%, rgba(255,255,255,0.05) 0)`;
        }
      }
    } catch (err) {
      scoreReasonVal.textContent = 'Offline. Start Gateway Server to compute AI Match.';
    }
  });
}

// Action triggers
btnApplyCurrent.addEventListener('click', () => {
  if (!activeJobUrl) return;
  chrome.runtime.sendMessage({
    action: 'sendWSMessage',
    payload: { type: 'apply', url: activeJobUrl }
  });
  appendLogLine(`[SYSTEM] Sent apply trigger for: ${activeJobUrl}`);
});

btnSubmitApprove.addEventListener('click', () => {
  if (!activeJobUrl) return;
  chrome.runtime.sendMessage({
    action: 'sendWSMessage',
    payload: { type: 'approve', url: activeJobUrl, action: 'SUBMIT' }
  });
  approvalCard.style.display = 'none';
  appendLogLine(`[SYSTEM] User clicked APPROVED. Resuming application submission...`);
});

btnSubmitCancel.addEventListener('click', () => {
  if (!activeJobUrl) return;
  chrome.runtime.sendMessage({
    action: 'sendWSMessage',
    payload: { type: 'approve', url: activeJobUrl, action: 'CANCEL' }
  });
  approvalCard.style.display = 'none';
  appendLogLine(`[SYSTEM] User clicked CANCEL. Aborting run...`);
});

clearLogs.addEventListener('click', () => {
  logsBox.innerHTML = '';
});

function appendLogLine(text) {
  const line = document.createElement('div');
  line.className = 'log-line';
  
  if (text.includes('[ERROR]')) {
    line.className += ' log-error';
  } else if (text.includes('[WARN]')) {
    line.className += ' log-warn';
  } else {
    line.className += ' log-info';
  }

  // Remove color codes if they slip in
  line.textContent = text.replace(/\\x1b\\[[0-9;]*m/g, '');
  logsBox.appendChild(line);
  logsBox.scrollTop = logsBox.scrollHeight;
}

// Listen to WebSocket messages relayed by background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'connectionStatus') {
    updateConnectionUI(message.connected);
  }

  if (message.action === 'gatewayMessage') {
    const data = message.payload;
    
    if (data.type === 'log') {
      appendLogLine(data.text);
    } 
    
    else if (data.type === 'reply') {
      appendLogLine(`[CLAW AI] ${data.text}`);
    } 
    
    else if (data.type === 'status') {
      // Check active runs
      const activeJobs = data.data.activeJobs || [];
      if (activeJobs.length > 0) {
        runStatusCard.style.display = 'block';
        activeUrlVal.textContent = activeJobs[0];
        activeStateVal.textContent = 'Active Execution';
        
        // Show approval panel if pending approval state (we can match the active run url)
        // Wait, server emits a specific log or we can check active jobs list
        // Let's assume if it is in the active list, we show approval panel if activeJobs contains the page url
      } else {
        runStatusCard.style.display = 'none';
        approvalCard.style.display = 'none';
      }
    } 
    
    else if (data.type === 'status_change') {
      if (data.status === 'submitting') {
        activeStateVal.textContent = 'Submitting...';
      }
    }

    // Capture approval state based on logs containing specific keyword
    if (data.type === 'log' && data.text.includes('Approval Mode: Pausing for manual user confirmation')) {
      approvalCard.style.display = 'block';
      runStatusCard.style.display = 'block';
      activeStateVal.textContent = 'Paused (Awaiting Approval)';
    }

    if (data.type === 'run_complete') {
      runStatusCard.style.display = 'none';
      approvalCard.style.display = 'none';
      appendLogLine(`[SYSTEM] Automation completed. Success: ${data.success}. Details: ${data.message}`);
    }
  }
});

// Event listeners for browser tab shifts
chrome.tabs.onActivated.addListener(() => {
  setTimeout(checkCurrentPageJob, 500);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    checkCurrentPageJob();
  }
});

// Initial run
checkConnection();
setTimeout(checkCurrentPageJob, 500);

// Poll for connection occasionally
setInterval(checkConnection, 3000);
