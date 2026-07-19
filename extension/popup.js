document.getElementById('open-sidepanel').addEventListener('click', async () => {
  if (chrome.sidePanel) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  }
  window.close(); // close popup window
});

document.getElementById('open-dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  window.close();
});

// Update state on load
chrome.runtime.sendMessage({ action: 'checkConnection' }, (response) => {
  const containerEl = document.getElementById('connection-container');
  const statusEl = document.getElementById('connection-status');
  
  if (response && response.connected) {
    statusEl.textContent = 'Connected';
    containerEl.className = 'status-badge status-active';
  } else {
    statusEl.textContent = 'Offline';
    containerEl.className = 'status-badge status-offline';
  }
});
