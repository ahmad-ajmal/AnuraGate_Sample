// Finance AI Agent — AnuraGate Example
//
// How it works:
//   1. You chat with the AI agent about travel, shopping, or subscriptions
//   2. When the model's response contains a purchase intent, AnuraGate
//      automatically detects it (no code needed — it's proxy-side)
//   3. AnuraGate sends you an approval request via your configured approver
//      platform (WhatsApp, Slack, or Telegram)
//   4. You reply YES to approve or NO to decline
//   5. On approval, AnuraGate issues a single-use virtual card for that
//      merchant and amount — The agent can then complete the checkout
//
// This script is just the chat interface. AnuraGate handles intent detection,
// approval routing, and card issuance automatically.
//
// Prerequisites (one-time setup in your AnuraGate dashboard):
//   1. Pro or higher plan required
//   2. Dashboard → Finance → Wallets → Create a wallet with a daily spend limit
//   3. Dashboard → Finance → Approver → Select your platform (WhatsApp/Slack/Telegram)
//      and enter the chat ID where approval requests should be sent
//   4. Have the relevant watcher running (see whatsapp/, slack/, or telegram/ example)
//
// Webhook events fired during the purchase flow (optional — see webhooks/ example):
//   finance.intent.detected       — intent found, evaluating policies
//   finance.intent.pending_approval — approval request sent to your approver
//   finance.intent.approved        — you said YES, card being issued
//   finance.intent.declined        — you said NO (or timed out)
//
// Setup: see README.md

require("dotenv").config();
const readline = require("readline");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATE_KEY = process.env.GATE_KEY;
const MODEL = process.env.MODEL;
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  "You are a helpful travel and shopping assistant. Help the user find and book flights, hotels, and make purchases. When you identify something specific to purchase, describe the item, merchant, and price clearly before proceeding.";

if (!GATE_KEY) {
  console.error("Missing GATE_KEY. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Session ID — required for the financial gateway to track purchase intents
// ---------------------------------------------------------------------------

const SESSION_ID = `finance-${Date.now()}`;

// ---------------------------------------------------------------------------
// Conversation history
// ---------------------------------------------------------------------------

const history = [{ role: "system", content: SYSTEM_PROMPT }];

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

async function chat(userMessage) {
  history.push({ role: "user", content: userMessage });

  const res = await fetch("https://anuragate.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GATE_KEY}`,
      "x-gate-session": SESSION_ID,   // required — finance gateway is session-scoped
    },
    body: JSON.stringify({ model: MODEL, messages: history }),
  });

  const data = await res.json();

  // Circuit breaker (e.g. session cost limit reached)
  if (res.status === 429 && data.error?.type === "circuit_breaker") {
    console.error(`\nSession stopped: ${data.error.message}`);
    process.exit(1);
  }

  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);

  const reply = data.choices[0].message.content;
  history.push({ role: "assistant", content: reply });
  return reply;
}

// ---------------------------------------------------------------------------
// REPL
// ---------------------------------------------------------------------------

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log("Finance AI Agent — powered by AnuraGate");
console.log(`Session: ${SESSION_ID}`);
console.log("");
console.log("Chat about travel, shopping, or subscriptions.");
console.log("When The model identifies a purchase, AnuraGate will send you");
console.log("an approval request via your configured approver platform.");
console.log("");
console.log('Try: "Find me a one-way flight from NYC to London next Friday"');
console.log("Ctrl+C to quit.\n");

function prompt() {
  rl.question("You: ", async (input) => {
    const text = input.trim();
    if (!text) return prompt();

    try {
      const reply = await chat(text);
      console.log(`\nAssistant: ${reply}\n`);
    } catch (err) {
      console.error("Error:", err.message, "\n");
    }

    prompt();
  });
}

prompt();
