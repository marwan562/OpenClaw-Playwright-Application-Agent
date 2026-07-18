const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

function appendMessage(sender, text, isAgent = false) {
  const div = document.createElement('div');
  div.className = 'message';
  const nameSpan = document.createElement('span');
  nameSpan.className = isAgent ? 'message-agent' : 'message-user';
  nameSpan.textContent = sender + ': ';
  const textSpan = document.createElement('span');
  textSpan.textContent = text;
  div.appendChild(nameSpan);
  div.appendChild(textSpan);
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;
  userInput.value = '';
  appendMessage('Maro', text, false);

  chrome.runtime.sendMessage({ action: 'sendChatMessage', payload: text }, (response) => {
    if (response && response.reply) {
      appendMessage('Homi', response.reply, true);
    } else {
      appendMessage('Homi', 'Failed to communicate with OpenClaw brain.', true);
    }
  });
}

// Listen to agent updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'agentLog') {
    appendMessage('System', message.text, true);
  }
});
