// Slack AI Agent — AnuraGate Example
//
// How it works:
//   1. Connects a Slack bot via Socket Mode (no public URL needed)
//   2. When someone DMs the bot, the message is sent through AnuraGate
//      and forwarded to the model
//   3. The reply is posted back to the same DM channel
//
// Setup: see README.md

require("dotenv").config();
const { GateSlackWatcher } = require("@anura-gate/watcher-slack");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATE_KEY = process.env.GATE_KEY;
const INTEGRATION_ID = process.env.INTEGRATION_ID;
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const APP_TOKEN = process.env.SLACK_APP_TOKEN;
const MODEL = process.env.MODEL;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";
const GATE_URL = process.env.GATE_URL || "https://anuragate.com";

if (!GATE_KEY || !INTEGRATION_ID || !BOT_TOKEN || !APP_TOKEN) {
  console.error(
    "Missing required env vars. Copy .env.example to .env and fill it in.\n" +
    "  SLACK_BOT_TOKEN: starts with xoxb-\n" +
    "  SLACK_APP_TOKEN: starts with xapp- (requires Socket Mode enabled)"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Per-channel conversation history
// ---------------------------------------------------------------------------

const histories = new Map();

function getHistory(channelId) {
  if (!histories.has(channelId)) {
    histories.set(channelId, [{ role: "system", content: SYSTEM_PROMPT }]);
  }
  return histories.get(channelId);
}

async function chat(channelId, userMessage) {
  const history = getHistory(channelId);
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

const watcher = new GateSlackWatcher({
  gateUrl: GATE_URL,
  gateKey: GATE_KEY,
  integrationId: INTEGRATION_ID,
  botToken: BOT_TOKEN,
  appToken: APP_TOKEN,
});

watcher.on("ready", ({ botName, teamName }) => {
  console.log(`Connected to Slack as @${botName} (${teamName})`);
  console.log("DM the bot to start chatting.\n");
});

// Fires for every message the bot receives
watcher.on("message", async (event) => {
  // Only respond to direct messages (DMs)
  if (event.channel_type !== "im") return;

  const text = event.text?.trim();
  if (!text) return;

  console.log(`User (${event.user}): ${text}`);

  try {
    const reply = await chat(event.channel, text);
    console.log(`Assistant: ${reply}\n`);
    await watcher.getWebClient().chat.postMessage({
      channel: event.channel,
      text: reply,
    });
  } catch (err) {
    console.error("Error:", err.message);
  }
});

watcher.on("gate_error", (err) => {
  console.error("AnuraGate error:", err);
});

watcher.start().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});
