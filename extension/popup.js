document.getElementById('open-sidepanel').addEventListener('click', async () => {
  // Open side panel in current window
  if (chrome.sidePanel) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  }
});

// Update state on load
chrome.runtime.sendMessage({ action: 'checkConnection' }, (response) => {
  const statusEl = document.getElementById('connection-status');
  if (response && response.connected) {
    statusEl.textContent = 'Connected';
    statusEl.className = 'status-active';
  } else {
    statusEl.textContent = 'Offline';
    statusEl.style.color = '#ef4444';
  }
});
