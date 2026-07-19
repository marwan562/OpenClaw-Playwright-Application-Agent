let ws = null;
const reconnectInterval = 5000;
let isConnected = false;

function connectGateway() {
  console.log('Attempting connection to OpenClaw Gateway...');
  ws = new WebSocket('ws://127.0.0.1:18789/ws');

  ws.onopen = () => {
    console.log('Connected to OpenClaw Gateway Server');
    isConnected = true;
    chrome.runtime.sendMessage({ action: 'connectionStatus', connected: true }).catch(() => {});
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('Gateway Server event:', data);
      
      // Relay all gateway WebSocket messages to any active panel or tab listeners
      chrome.runtime.sendMessage({ action: 'gatewayMessage', payload: data }).catch(() => {});
    } catch (e) {
      console.error('Error parsing incoming WS payload:', e);
    }
  };

  ws.onclose = () => {
    console.log('Disconnected from OpenClaw Gateway. Reconnecting...');
    isConnected = false;
    chrome.runtime.sendMessage({ action: 'connectionStatus', connected: false }).catch(() => {});
    setTimeout(connectGateway, reconnectInterval);
  };

  ws.onerror = (err) => {
    console.error('WebSocket Error:', err);
  };
}

// Initialize gateway connection
connectGateway();

// Listen to runtime messages from popups, dashboards, sidepanels, content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkConnection') {
    sendResponse({ connected: isConnected });
    return true;
  }

  if (request.action === 'sendWSMessage') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(request.payload));
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'WebSocket is offline.' });
    }
    return true;
  }
});
