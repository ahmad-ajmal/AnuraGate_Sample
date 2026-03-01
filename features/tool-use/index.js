// Tool Use AI Agent — AnuraGate Example
//
// How it works:
//   1. You type a message in the terminal
//   2. The request is sent with tool definitions — the model can call tools if needed
//   3. If the model calls a tool, it's executed locally and the result is sent back
//   4. The model uses the result to give you a final answer
//
// Demo tools:
//   - get_weather(location)  → returns fake weather data
//   - calculate(expression)  → evaluates a simple math expression
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
  "You are a helpful assistant. Use the available tools when they would help answer the user's question.";

if (!GATE_KEY) {
  console.error("Missing GATE_KEY. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Tool definitions (OpenAI format — works with all providers via AnuraGate)
// ---------------------------------------------------------------------------

const tools = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the current weather for a city or location.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City and country, e.g. 'London, UK' or 'New York, US'",
          },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Evaluate a simple arithmetic expression. Supports +, -, *, /, parentheses.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "The expression to evaluate, e.g. '(4 + 5) * 3'",
          },
        },
        required: ["expression"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution (local)
// ---------------------------------------------------------------------------

function executeTool(name, args) {
  if (name === "get_weather") {
    // Fake weather — replace with a real API call if you like
    const conditions = ["Sunny", "Partly cloudy", "Overcast", "Light rain", "Clear skies"];
    const temp = Math.floor(Math.random() * 25) + 10;
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    return JSON.stringify({ location: args.location, temperature: `${temp}°C`, condition });
  }

  if (name === "calculate") {
    try {
      // Safe eval: only allow numbers and arithmetic operators
      const sanitised = args.expression.replace(/[^0-9+\-*/().%\s]/g, "");
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${sanitised})`)();
      return JSON.stringify({ expression: args.expression, result });
    } catch {
      return JSON.stringify({ error: "Could not evaluate expression" });
    }
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

// ---------------------------------------------------------------------------
// Conversation history
// ---------------------------------------------------------------------------

const history = [{ role: "system", content: SYSTEM_PROMPT }];

// ---------------------------------------------------------------------------
// Chat with tool loop
// ---------------------------------------------------------------------------

async function chat(userMessage) {
  history.push({ role: "user", content: userMessage });

  // Keep looping until the model gives a final text response (no more tool calls)
  while (true) {
    const res = await fetch("https://anuragate.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GATE_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, messages: history, tools }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);

    const msg = data.choices[0].message;
    history.push(msg);

    // No tool calls — this is the final answer
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return msg.content;
    }

    // Execute each tool call and push results
    for (const tc of msg.tool_calls) {
      const args = JSON.parse(tc.function.arguments);
      console.log(`  [tool] ${tc.function.name}(${JSON.stringify(args)})`);
      const result = executeTool(tc.function.name, args);
      history.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      });
    }
    // Loop back to send tool results to the model
  }
}

// ---------------------------------------------------------------------------
// REPL
// ---------------------------------------------------------------------------

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log("Tool-use chat with the AI agent via AnuraGate.");
console.log("Try: 'What is the weather in Tokyo?' or 'Calculate (12 * 8) + 44'");
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
