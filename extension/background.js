let ws = null;
let reconnectInterval = 5000;

function connectGateway() {
  // Connect to local OpenClaw gateway
  ws = new WebSocket('ws://127.0.0.1:20128/ws');

  ws.onopen = () => {
    console.log('Connected to OpenClaw Gateway');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'log') {
        chrome.runtime.sendMessage({ action: 'agentLog', text: data.text });
      }
    } catch (e) {
      console.error(e);
    }
  };

  ws.onclose = () => {
    console.log('Disconnected from OpenClaw Gateway. Reconnecting...');
    setTimeout(connectGateway, reconnectInterval);
  };
}

// Start connection
connectGateway();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkConnection') {
    sendResponse({ connected: ws && ws.readyState === WebSocket.OPEN });
    return true;
  }

  if (request.action === 'sendChatMessage') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Send chat context to local gateway server
      ws.send(JSON.stringify({ type: 'chat', text: request.payload }));
      // Standard local echo response back
      sendResponse({ reply: `Received prompt: "${request.payload}". Automation pipeline initialized.` });
    } else {
      sendResponse({ reply: 'Could not connect to Gateway. Please check if OpenClaw is running locally.' });
    }
    return true;
  }
});
