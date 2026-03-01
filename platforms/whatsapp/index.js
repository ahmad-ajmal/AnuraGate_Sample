// WhatsApp AI Agent — AnuraGate Example
//
// How it works:
//   1. Connects your WhatsApp via a QR code scan
//   2. When you message yourself (self-chat), your message is sent through
//      AnuraGate and forwarded to the model
//   3. The reply is sent back to your self-chat automatically
//
// Setup: see README.md

require("dotenv").config();
const { GateWatcher } = require("@anura-gate/watcher-whatsapp");
const qrcode = require("qrcode-terminal");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATE_KEY = process.env.GATE_KEY;
const INTEGRATION_ID = process.env.INTEGRATION_ID;
const MODEL = process.env.MODEL;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";
const GATE_URL = process.env.GATE_URL || "https://anuragate.com";

if (!GATE_KEY || !INTEGRATION_ID) {
  console.error("Missing GATE_KEY or INTEGRATION_ID. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Conversation history (maintains context within a session)
// ---------------------------------------------------------------------------

const history = [{ role: "system", content: SYSTEM_PROMPT }];

async function chat(userMessage) {
  history.push({ role: "user", content: userMessage });

  const res = await fetch(`${GATE_URL}/v1/chat/completions`, {
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

const sentByBot = new Set(); // track IDs of messages sent by the bot to avoid re-processing

const watcher = new GateWatcher({
  gateUrl: GATE_URL,
  gateKey: GATE_KEY,
  integrationId: INTEGRATION_ID,
  sessionId: "whatsapp-demo",
});

watcher.on("qr", (qr) => {
  console.log("\nScan this QR code with WhatsApp (Settings > Linked Devices):\n");
  qrcode.generate(qr, { small: true });
});

watcher.on("ready", () => {
  console.log("Connected to WhatsApp!");
  console.log("Message yourself to start chatting.\n");
});

// Fires for every message YOU send (outgoing)
watcher.on("message_sent", async (msg) => {
  // Only respond to self-chat (user messaging their own number)
  const client = watcher.getWhatsAppClient();
  const ownId = client?.info?.wid?._serialized;
  if (!ownId || msg.to !== ownId) return;

  // Skip replies sent by this bot
  const msgId = msg.id?._serialized;
  if (msgId && sentByBot.has(msgId)) {
    sentByBot.delete(msgId);
    return;
  }

  const text = msg.body?.trim();
  if (!text) return;

  console.log(`You: ${text}`);

  try {
    const reply = await chat(text);
    console.log(`Assistant: ${reply}\n`);
    const sent = await client.sendMessage(ownId, reply);
    if (sent?.id?._serialized) sentByBot.add(sent.id._serialized);
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
