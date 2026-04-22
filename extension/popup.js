chrome.runtime.sendMessage({ type: "get_status" }, (response) => {
  if (!response) return;

  const relayDot = document.getElementById("relay-dot");
  const relayStatus = document.getElementById("relay-status");
  const contentDot = document.getElementById("content-dot");
  const contentStatus = document.getElementById("content-status");

  if (response.relayConnected) {
    relayDot.classList.add("green");
    relayStatus.textContent = "Connected";
  } else {
    relayDot.classList.add("red");
    relayStatus.textContent = "Disconnected";
  }

  if (response.contentConnected) {
    contentDot.classList.add("green");
    contentStatus.textContent = "Active";
  } else {
    contentDot.classList.add("red");
    contentStatus.textContent = "Open WhatsApp Web";
  }
});
