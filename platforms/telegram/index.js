// Telegram AI Agent — AnuraGate Example
//
// How it works:
//   1. Connects your personal Telegram account (not a bot)
//   2. When you message "Saved Messages" (yourself), your message is sent
//      through AnuraGate and forwarded to the model
//   3. The reply appears in your Saved Messages automatically
//
// Setup: see README.md

require("dotenv").config();
const { GateWatcherTelegram } = require("@anura-gate/watcher-telegram");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATE_KEY = process.env.GATE_KEY;
const INTEGRATION_ID = process.env.INTEGRATION_ID;
const API_ID = process.env.TELEGRAM_API_ID;
const API_HASH = process.env.TELEGRAM_API_HASH;
const MODEL = process.env.MODEL;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";

if (!GATE_KEY || !INTEGRATION_ID || !API_ID || !API_HASH) {
  console.error(
    "Missing required env vars. Copy .env.example to .env and fill it in.\n" +
    "  Get API_ID and API_HASH from https://my.telegram.org"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Conversation history (maintains context within a session)
// ---------------------------------------------------------------------------

const history = [{ role: "system", content: SYSTEM_PROMPT }];

async function chat(userMessage) {
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

const watcher = new GateWatcherTelegram({
  gateKey: GATE_KEY,
  integrationId: INTEGRATION_ID,
  sessionId: "telegram-demo",
  apiId: API_ID,
  apiHash: API_HASH,
  sessionDir: "./.telegram_session",
});

let ownUserId = null;

watcher.on("ready", async () => {
  try {
    const client = watcher.getTelegramClient();
    const me = await client.getMe();
    ownUserId = String(me.id);
    console.log("Connected to Telegram!");
    console.log("Send a message to your Saved Messages to start chatting.\n");
  } catch (err) {
    console.error("Could not fetch own user ID:", err.message);
  }
});

// Fires for every message YOU send (outgoing)
watcher.on("message_sent", async (message) => {
  if (!ownUserId) return;

  // Only respond to Saved Messages (self-chat)
  const peerId = message.peerId;
  const isSavedMessages =
    peerId?.className === "PeerUser" && String(peerId.userId) === ownUserId;
  if (!isSavedMessages) return;

  const text = (message.text || message.message)?.trim();
  if (!text) return;

  console.log(`You: ${text}`);

  try {
    const reply = await chat(text);
    console.log(`Assistant: ${reply}\n`);
    await watcher.getTelegramClient().sendMessage("me", { message: reply });
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

// First run: will prompt for phone number + verification code
watcher.start().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});
