// Sessions & Circuit Breaker — AnuraGate Example
//
// How it works:
//   1. A unique session ID is created at startup and sent with every request
//      via the x-gate-session header
//   2. AnuraGate tracks cumulative cost, tokens, and request count for the session
//   3. If a circuit breaker limit is hit (cost / tokens / duration / requests),
//      AnuraGate returns HTTP 429 with error.type === "circuit_breaker"
//   4. This script catches that and exits gracefully
//
// The session ID is printed at startup — find it in your AnuraGate dashboard
// under Sessions to see live cost, token count, and status.
//
// Circuit breaker limits are configured per key in the dashboard:
//   Dashboard → Keys → Edit → Circuit Breaker
//   (Requires Pro or higher plan)
//
// Setup: see README.md

require("dotenv").config();
const readline = require("readline");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATE_KEY = process.env.GATE_KEY;
const MODEL = process.env.MODEL;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";

if (!GATE_KEY) {
  console.error("Missing GATE_KEY. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Session ID — unique per run, visible in the AnuraGate dashboard
// ---------------------------------------------------------------------------

const SESSION_ID = `demo-${Date.now()}`;

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
      "x-gate-session": SESSION_ID,   // <-- enables session tracking
    },
    body: JSON.stringify({ model: MODEL, messages: history }),
  });

  const data = await res.json();

  // Circuit breaker tripped — the session has hit a configured limit
  if (res.status === 429 && data.error?.type === "circuit_breaker") {
    console.error(`\nCircuit breaker tripped: ${data.error.message}`);
    console.error("Session has been stopped. Check your dashboard for details.");
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

console.log("Session chat with the AI agent via AnuraGate.");
console.log(`Session ID: ${SESSION_ID}`);
console.log("View this session live in your AnuraGate dashboard → Sessions\n");

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
