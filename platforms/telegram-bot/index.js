// Telegram Bot AI Agent — AnuraGate Example
//
// How it works:
//   1. You configure your Telegram Bot to send webhook events to AnuraGate
//   2. When anyone messages your bot, AnuraGate receives the event,
//      applies your security policies, and forwards it to this watcher
//   3. This watcher calls the model and sends the reply back via the Telegram Bot API
//
// This uses the Telegram Bot API (via @BotFather), not your personal account.
// For the personal account watcher, see the telegram/ example instead.
//
// Setup:
//   1. Create a bot with @BotFather on Telegram → copy the bot token
//   2. Create a Telegram Bot integration in your AnuraGate dashboard
//      and copy the Integration ID and Webhook Secret
//   3. In the AnuraGate dashboard, copy the webhook URL for this integration
//      and set it as your bot's webhook:
//      https://api.telegram.org/bot{TOKEN}/setWebhook?url={ANURAGATE_WEBHOOK_URL}
//
// Setup: see README.md

require("dotenv").config();
const { GateTelegramBotWatcher } = require("@anura-gate/watcher-telegram-bot");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATE_KEY = process.env.GATE_KEY;
const INTEGRATION_ID = process.env.INTEGRATION_ID;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const MODEL = process.env.MODEL;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";
const GATE_URL = process.env.GATE_URL || "https://anuragate.com";

if (!GATE_KEY || !INTEGRATION_ID || !BOT_TOKEN || !WEBHOOK_SECRET) {
  console.error(
    "Missing required env vars. Copy .env.example to .env and fill it in.\n" +
    "  TELEGRAM_BOT_TOKEN: get from @BotFather\n" +
    "  TELEGRAM_WEBHOOK_SECRET: set in AnuraGate dashboard → Integrations → your bot integration"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Per-chat conversation history
// ---------------------------------------------------------------------------

const histories = new Map();

function getHistory(chatId) {
  if (!histories.has(chatId)) {
    histories.set(chatId, [{ role: "system", content: SYSTEM_PROMPT }]);
  }
  return histories.get(chatId);
}

async function chat(chatId, userMessage) {
  const history = getHistory(chatId);
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

const watcher = new GateTelegramBotWatcher({
  gateUrl: GATE_URL,
  gateKey: GATE_KEY,
  integrationId: INTEGRATION_ID,
  botToken: BOT_TOKEN,
  webhookSecret: WEBHOOK_SECRET,
});

watcher.on("ready", ({ botName }) => {
  console.log(`Connected Telegram bot @${botName}!`);
  console.log("Message the bot on Telegram to start chatting.\n");
});

// Fires for every message the bot receives
watcher.on("message", async (event) => {
  const chatId = String(event.content?.metadata?.chatId || event.source?.id);
  const text = event.content?.text?.trim();
  if (!chatId || !text) return;

  console.log(`User (${event.source?.name || chatId}): ${text}`);

  try {
    const reply = await chat(chatId, text);
    console.log(`Assistant: ${reply}\n`);
    await watcher.sendMessage(chatId, reply);
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
