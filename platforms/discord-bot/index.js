// Discord Bot AI Agent — AnuraGate Example
//
// How it works:
//   1. Connects a Discord bot to AnuraGate
//   2. When someone sends a direct message to the bot, the message is sent
//      through AnuraGate and forwarded to the model
//   3. The reply is posted back to the same DM
//
// Setup: see README.md

require("dotenv").config();
const { GateDiscordBotWatcher } = require("@anura-gate/watcher-discord-bot");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATE_KEY = process.env.GATE_KEY;
const INTEGRATION_ID = process.env.INTEGRATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const MODEL = process.env.MODEL;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";
const GATE_URL = process.env.GATE_URL || "https://anuragate.com";

if (!GATE_KEY || !INTEGRATION_ID || !BOT_TOKEN) {
  console.error(
    "Missing required env vars. Copy .env.example to .env and fill it in.\n" +
    "  DISCORD_BOT_TOKEN: create a bot at discord.com/developers/applications → Bot → Token"
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

const watcher = new GateDiscordBotWatcher({
  gateUrl: GATE_URL,
  gateKey: GATE_KEY,
  integrationId: INTEGRATION_ID,
  botToken: BOT_TOKEN,
});

watcher.on("ready", ({ botName }) => {
  console.log(`Connected to Discord as @${botName}!`);
  console.log("DM the bot to start chatting.\n");
});

// Fires for every message the bot receives
watcher.on("message", async (event) => {
  // Only respond to direct messages (DMs)
  if (event.channel_type !== "dm") return;

  const text = event.text?.trim();
  if (!text) return;

  console.log(`User (${event.user}): ${text}`);

  try {
    const reply = await chat(event.channel, text);
    console.log(`Assistant: ${reply}\n`);
    await watcher.getDiscordClient().channels.cache.get(event.channel)?.send(reply);
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
