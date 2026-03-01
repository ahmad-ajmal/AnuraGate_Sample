// LinkedIn AI Agent — AnuraGate Example
//
// How it works:
//   1. Connects your LinkedIn account via an access token
//   2. When you receive a message in LinkedIn (or message yourself),
//      your message is sent through AnuraGate and forwarded to the model
//   3. The reply is sent back to the same conversation automatically
//
// Default behaviour: respond to messages in your LinkedIn inbox.
// For a private AI channel, message yourself from a second account
// or use a dedicated LinkedIn conversation.
//
// Setup: see README.md

require("dotenv").config();
const { GateLinkedInWatcher } = require("@anura-gate/watcher-linkedin");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATE_KEY = process.env.GATE_KEY;
const INTEGRATION_ID = process.env.INTEGRATION_ID;
const ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;
const MODEL = process.env.MODEL;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful professional assistant.";

if (!GATE_KEY || !INTEGRATION_ID || !ACCESS_TOKEN) {
  console.error(
    "Missing required env vars. Copy .env.example to .env and fill it in.\n" +
    "  LINKEDIN_ACCESS_TOKEN: create an app at linkedin.com/developers and get an OAuth token"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Per-conversation history
// ---------------------------------------------------------------------------

const histories = new Map();

function getHistory(conversationId) {
  if (!histories.has(conversationId)) {
    histories.set(conversationId, [{ role: "system", content: SYSTEM_PROMPT }]);
  }
  return histories.get(conversationId);
}

async function chat(conversationId, userMessage) {
  const history = getHistory(conversationId);
  history.push({ role: "user", content: userMessage });

  const res = await fetch("https://anuragate.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GATE_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages: history }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "AI request failed");

  const reply = data.choices[0].message.content;
  history.push({ role: "assistant", content: reply });
  return reply;
}

// ---------------------------------------------------------------------------
// Watcher
// ---------------------------------------------------------------------------

const watcher = new GateLinkedInWatcher({
  gateKey: GATE_KEY,
  integrationId: INTEGRATION_ID,
  sessionId: "linkedin-demo",
  accessToken: ACCESS_TOKEN,
});

watcher.on("ready", () => {
  console.log("Connected to LinkedIn!");
  console.log("Send a message in LinkedIn to start chatting.\n");
});

// Fires for every incoming message
watcher.on("message", async (event) => {
  const conversationId = String(event.content?.metadata?.conversationId || event.source?.id);
  const text = event.content?.text?.trim();
  if (!conversationId || !text) return;

  console.log(`${event.source?.name || "User"}: ${text}`);

  try {
    const reply = await chat(conversationId, text);
    console.log(`Assistant: ${reply}\n`);
    await watcher.sendMessage(conversationId, reply);
  } catch (err) {
    console.error("Error:", err.message);
  }
});

watcher.on("disconnected", (reason) => {
  console.log("Disconnected:", reason);
});

watcher.on("gate_error", (err) => {
  console.error("AnuraGate error:", err);
});

watcher.start().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});
