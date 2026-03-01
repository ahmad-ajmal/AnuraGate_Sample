// Discord AI Agent — AnuraGate Example
//
// How it works:
//   1. Connects your personal Discord account via a user token
//   2. When you send a message to yourself (DM to your own account),
//      your message is sent through AnuraGate and forwarded to the model
//   3. The reply is sent back to your DM automatically
//
// Setup: see README.md

require("dotenv").config();
const { GateDiscordWatcher } = require("@anura-gate/watcher-discord");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATE_KEY = process.env.GATE_KEY;
const INTEGRATION_ID = process.env.INTEGRATION_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const MODEL = process.env.MODEL;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";
const GATE_URL = process.env.GATE_URL || "https://anuragate.com";

if (!GATE_KEY || !INTEGRATION_ID || !DISCORD_TOKEN) {
  console.error("Missing required env vars. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Conversation history
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

const watcher = new GateDiscordWatcher({
  gateUrl: GATE_URL,
  gateKey: GATE_KEY,
  integrationId: INTEGRATION_ID,
  sessionId: "discord-demo",
  token: DISCORD_TOKEN,
});

let ownUserId = null;

watcher.on("ready", async () => {
  try {
    const client = watcher.getDiscordClient();
    ownUserId = client?.user?.id;
    console.log(`Connected to Discord as ${client?.user?.tag}!`);
    console.log("Send a DM to yourself to start chatting.\n");
  } catch (err) {
    console.error("Could not fetch own user ID:", err.message);
  }
});

// Fires for every message YOU send (outgoing)
watcher.on("message_sent", async (msg) => {
  if (!ownUserId) return;

  // Only respond to self-DMs (user messaging their own account)
  if (msg.to !== ownUserId) return;

  const text = msg.body?.trim();
  if (!text) return;

  console.log(`You: ${text}`);

  try {
    const reply = await chat(text);
    console.log(`Assistant: ${reply}\n`);
    await watcher.getDiscordClient().users.send(ownUserId, reply);
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
