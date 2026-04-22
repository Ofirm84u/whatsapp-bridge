/**
 * Content script — runs on web.whatsapp.com
 * Observes incoming messages and sends messages via DOM interaction.
 */

(function () {
  "use strict";

  const port = chrome.runtime.connect({ name: "wa-bridge-content" });
  const seenMessages = new Set();

  console.log("[WA Bridge] Content script loaded on WhatsApp Web");

  // ── Incoming message observer ──────────────────────────────────────

  let observer = null;

  function startObserving() {
    // Watch for new message elements in the chat panel
    const chatContainer = document.querySelector("#main");
    if (!chatContainer) {
      setTimeout(startObserving, 2000);
      return;
    }

    observer = new MutationObserver(handleMutations);
    observer.observe(chatContainer, { childList: true, subtree: true });
    console.log("[WA Bridge] Observing messages");
  }

  function handleMutations(mutations) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        // Find message containers — WhatsApp uses data-id on message rows
        const msgElements = node.querySelectorAll
          ? node.querySelectorAll("[data-id]")
          : [];
        for (const el of msgElements) {
          processMessageElement(el);
        }
        // Check if the node itself is a message
        if (node.hasAttribute && node.hasAttribute("data-id")) {
          processMessageElement(node);
        }
      }
    }
  }

  function processMessageElement(el) {
    const dataId = el.getAttribute("data-id");
    if (!dataId || seenMessages.has(dataId)) return;

    // Only process incoming messages (not from me)
    // WhatsApp data-id format: "true_<jid>_<msgid>" (true = from me) or "false_<jid>_<msgid>"
    if (dataId.startsWith("true_")) return;

    seenMessages.add(dataId);

    // Extract text content
    const textEl = el.querySelector(".selectable-text");
    if (!textEl) return; // Skip media messages

    const text = textEl.innerText.trim();
    if (!text) return;

    // Extract sender info
    const parts = dataId.split("_");
    const jid = parts[1] || "";
    const from = jid.replace("@c.us", "").replace("@s.whatsapp.net", "");

    // Try to get contact name from the header
    const headerEl = document.querySelector("#main header span[title]");
    const name = headerEl ? headerEl.getAttribute("title") : "";

    console.log("[WA Bridge] Incoming:", from, text.substring(0, 50));

    port.postMessage({
      type: "incoming_message",
      from,
      name,
      message: text,
      timestamp: Math.floor(Date.now() / 1000),
    });
  }

  // ── Send message handler ───────────────────────────────────────────

  port.onMessage.addListener(async (msg) => {
    if (msg.action === "send_message") {
      try {
        const result = await sendMessage(msg.to, msg.message);
        port.postMessage({ responseId: msg.id, result });
      } catch (e) {
        port.postMessage({ responseId: msg.id, error: e.message });
      }
    }
  });

  async function sendMessage(to, message) {
    // Normalize phone number
    let phone = to.replace(/[+\-\s()]/g, "");
    if (phone.startsWith("0")) {
      phone = "972" + phone.slice(1);
    }

    // Use WhatsApp's URL scheme to open the chat
    // This navigates to the chat with that number
    const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

    // Navigate to the chat
    window.location.href = url;

    // Wait for the chat to load and the message to appear in the input
    await waitForElement('div[contenteditable="true"][data-tab="10"]', 15000);
    await sleep(1000);

    // Find and click the send button
    const sendBtn = document.querySelector('button[aria-label="Send"], span[data-icon="send"]');
    if (sendBtn) {
      const button = sendBtn.closest("button") || sendBtn;
      button.click();
      await sleep(500);
      return { success: true };
    }

    // Fallback: press Enter on the input
    const input = document.querySelector('div[contenteditable="true"][data-tab="10"]');
    if (input) {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
      await sleep(500);
      return { success: true };
    }

    throw new Error("Could not find send button or input field");
  }

  // ── Utilities ──────────────────────────────────────────────────────

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) { resolve(el); return; }

      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) { obs.disconnect(); resolve(el); }
      });
      obs.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        obs.disconnect();
        const el = document.querySelector(selector);
        if (el) resolve(el);
        else reject(new Error(`Element ${selector} not found after ${timeout}ms`));
      }, timeout);
    });
  }

  // ── Global observer for page changes ───────────────────────────────

  // WhatsApp Web is a SPA — re-attach observer when #main changes
  const globalObserver = new MutationObserver(() => {
    const main = document.querySelector("#main");
    if (main && !observer) {
      startObserving();
    }
  });
  globalObserver.observe(document.body, { childList: true, subtree: true });

  // Initial start
  setTimeout(startObserving, 3000);
})();
