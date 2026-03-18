// X AI Agent — AnuraGate Example
//
// How it works:
//   1. The watcher polls X for mentions of your account
//   2. Events are sent to AnuraGate for security processing (redaction, policies)
//   3. When a mention contains the trigger phrase (@ai), the agent calls the
//      model with the tweet context and posts a reply
//
// Setup:
//   1. Create an X integration in your AnuraGate dashboard
//   2. Copy .env.example to .env and fill in your credentials
//   3. npm start
//
// Credentials stay on your machine — NEVER sent to AnuraGate.

require("dotenv").config();
const { GateXWatcher } = require("@anura-gate/watcher-x");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATE_KEY = process.env.GATE_KEY;
const INTEGRATION_ID = process.env.INTEGRATION_ID;
const X_API_KEY = process.env.X_API_KEY;
const X_API_SECRET = process.env.X_API_SECRET;
const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;
const BOT_TRIGGER = process.env.BOT_TRIGGER || "@ai";
const MODEL = process.env.MODEL;
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  "You are a helpful AI assistant responding on X. Keep replies concise (under 280 characters when possible). Be friendly and informative.";
const GATE_URL = process.env.GATE_URL || "https://anuragate.com";

if (!GATE_KEY || !INTEGRATION_ID) {
  console.error(
    "Missing GATE_KEY or INTEGRATION_ID. Copy .env.example to .env and fill it in."
  );
  process.exit(1);
}

if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
  console.error(
    "Missing X OAuth 1.0a credentials.\n" +
    "Set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET\n" +
    "Get these from https://developer.x.com/en/portal/dashboard"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Per-thread conversation history (keyed by conversation_id)
// ---------------------------------------------------------------------------

const histories = new Map();

function getHistory(key) {
  if (!histories.has(key)) {
    histories.set(key, [{ role: "system", content: SYSTEM_PROMPT }]);
  }
  return histories.get(key);
}

async function chat(contextKey, userMessage) {
  const history = getHistory(contextKey);
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

async function main() {
  const watcher = new GateXWatcher({
    gateUrl: GATE_URL,
    gateKey: GATE_KEY,
    integrationId: INTEGRATION_ID,
    apiKey: X_API_KEY,
    apiSecret: X_API_SECRET,
    accessToken: X_ACCESS_TOKEN,
    accessTokenSecret: X_ACCESS_TOKEN_SECRET,
  });

  watcher.on("ready", (displayName) => {
    console.log(`X watcher connected as ${displayName}!`);
    console.log(`Responding to mentions containing '${BOT_TRIGGER}'\n`);
  });

  // Fires for every X event detected by the watcher
  watcher.on("event", async (event) => {
    const { eventType, content } = event;

    // Only respond to mentions and replies that contain the trigger
    if (eventType !== "mention" && eventType !== "reply") return;

    const text = content?.text || "";
    if (!text.toLowerCase().includes(BOT_TRIGGER.toLowerCase())) return;

    const tweetId = content?.metadata?.tweetId;
    if (!tweetId) return;

    const authorUsername = content?.metadata?.authorUsername || event.source?.name || "someone";
    const conversationId = content?.metadata?.conversationId || tweetId;

    console.log(`[@${authorUsername}] ${text.slice(0, 80)}...`);

    // Build context
    const prompt = [
      `Tweet from @${authorUsername}:`,
      text,
      "",
      "Reply concisely (280 char limit for X).",
    ].join("\n");

    try {
      const reply = await chat(conversationId, prompt);
      console.log(`Assistant: ${reply.slice(0, 80)}...\n`);

      // Post the reply as a tweet
      await watcher.replyToTweet(tweetId, reply);
      console.log(`  → Reply posted to tweet ${tweetId}\n`);
    } catch (err) {
      console.error("Error:", err.message);
    }
  });

  watcher.on("gate_error", (err) => {
    console.error("AnuraGate error:", err);
  });

  watcher.on("x_error", (err) => {
    console.error("X error:", err);
  });

  await watcher.start();
}

main().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});
