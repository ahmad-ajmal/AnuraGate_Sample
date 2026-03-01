// Streaming AI Agent — AnuraGate Example
//
// How it works:
//   1. You type a message in the terminal
//   2. The request is sent to AnuraGate with stream: true
//   3. The reply streams back token-by-token and prints in real time
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
const GATE_URL = process.env.GATE_URL || "https://anuragate.com";

if (!GATE_KEY) {
  console.error("Missing GATE_KEY. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Conversation history
// ---------------------------------------------------------------------------

const history = [{ role: "system", content: SYSTEM_PROMPT }];

// ---------------------------------------------------------------------------
// Streaming chat
// ---------------------------------------------------------------------------

async function chat(userMessage) {
  history.push({ role: "user", content: userMessage });

  const res = await fetch(`${GATE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GATE_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages: history, stream: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  // Read the SSE stream and print each token as it arrives
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";

  process.stdout.write("\nAssistant: ");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep any incomplete line for next iteration

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;

      try {
        const chunk = JSON.parse(data);
        const token = chunk.choices?.[0]?.delta?.content || "";
        process.stdout.write(token);
        reply += token;
      } catch {
        // ignore malformed chunks
      }
    }
  }

  process.stdout.write("\n\n");
  history.push({ role: "assistant", content: reply });
}

// ---------------------------------------------------------------------------
// REPL
// ---------------------------------------------------------------------------

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log("Streaming chat with the AI agent via AnuraGate.");
console.log('Type a message and press Enter. Ctrl+C to quit.\n');

function prompt() {
  rl.question("You: ", async (input) => {
    const text = input.trim();
    if (!text) return prompt();

    try {
      await chat(text);
    } catch (err) {
      console.error("Error:", err.message, "\n");
    }

    prompt();
  });
}

prompt();
