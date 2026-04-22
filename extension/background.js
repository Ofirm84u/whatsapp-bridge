/**
 * Background service worker — manages WebSocket connection to local relay.
 * Relays messages between the content script and the relay server.
 */

const RELAY_URL = "ws://localhost:8070";
let ws = null;
let contentPort = null;

function connectRelay() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket(RELAY_URL);
  } catch (e) {
    console.log("[WA Bridge] Failed to create WebSocket:", e);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log("[WA Bridge] Connected to relay server");
    notifyPopup({ type: "status", connected: true });
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      // Forward commands from relay to content script
      if (contentPort) {
        contentPort.postMessage(data);
      }
    } catch (e) {
      console.error("[WA Bridge] Failed to parse relay message:", e);
    }
  };

  ws.onclose = () => {
    console.log("[WA Bridge] Disconnected from relay");
    ws = null;
    notifyPopup({ type: "status", connected: false });
    scheduleReconnect();
  };

  ws.onerror = (err) => {
    console.log("[WA Bridge] WebSocket error");
    ws = null;
  };
}

function scheduleReconnect() {
  setTimeout(connectRelay, 5000);
}

function sendToRelay(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function notifyPopup(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// Listen for connections from content script
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "wa-bridge-content") {
    console.log("[WA Bridge] Content script connected");
    contentPort = port;

    port.onMessage.addListener((msg) => {
      // Forward to relay server
      sendToRelay(msg);
    });

    port.onDisconnect.addListener(() => {
      console.log("[WA Bridge] Content script disconnected");
      contentPort = null;
    });
  }
});

// Listen for popup messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "get_status") {
    sendResponse({
      relayConnected: ws && ws.readyState === WebSocket.OPEN,
      contentConnected: contentPort !== null,
    });
    return true;
  }
});

// Start connection
connectRelay();
