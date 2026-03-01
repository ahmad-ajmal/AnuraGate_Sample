// GitHub AI Agent — AnuraGate Example
//
// How it works:
//   1. GitHub sends webhook events to AnuraGate (push, issues, PRs, comments)
//   2. AnuraGate verifies the signature, applies your security policies,
//      and forwards events to this watcher via the outbound queue
//   3. This watcher calls the model with the event context and posts a reply
//      back to GitHub (e.g., a comment on the issue or PR)
//
// Default behaviour: respond to new issues and PR review comments
// directed at the bot (containing @ai or /ai).
//
// Setup:
//   1. Create a GitHub integration in your AnuraGate dashboard
//   2. Copy the webhook URL from the integration page
//   3. In your GitHub repo → Settings → Webhooks → Add webhook
//      URL: paste the AnuraGate webhook URL
//      Secret: paste GITHUB_WEBHOOK_SECRET (same value as in .env)
//      Events: Issues, Pull requests, Issue comments, PR review comments
//   4. Create a GitHub personal access token with repo:write scope
//
// Setup: see README.md

require("dotenv").config();
const { GateGitHubWatcher } = require("@anura-gate/watcher-github");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATE_KEY = process.env.GATE_KEY;
const INTEGRATION_ID = process.env.INTEGRATION_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const BOT_TRIGGER = process.env.BOT_TRIGGER || "@ai";
const MODEL = process.env.MODEL;
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  "You are a helpful code review assistant. Keep your responses concise and technical. When reviewing code, focus on correctness, clarity, and potential bugs.";

if (!GATE_KEY || !INTEGRATION_ID || !GITHUB_TOKEN || !GITHUB_WEBHOOK_SECRET) {
  console.error(
    "Missing required env vars. Copy .env.example to .env and fill it in.\n" +
    "  GITHUB_TOKEN: create at github.com/settings/tokens (repo:write scope)\n" +
    "  GITHUB_WEBHOOK_SECRET: any secret string — set the same value in your GitHub webhook"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Per-issue/PR conversation history
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

  const res = await fetch("https://anuragate.com/v1/chat/completions", {
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

const watcher = new GateGitHubWatcher({
  gateKey: GATE_KEY,
  integrationId: INTEGRATION_ID,
  githubToken: GITHUB_TOKEN,
  webhookSecret: GITHUB_WEBHOOK_SECRET,
});

watcher.on("ready", () => {
  console.log("GitHub watcher connected!");
  console.log(`Watching for comments containing '${BOT_TRIGGER}' on issues and PRs.\n`);
});

// Fires for incoming GitHub events forwarded by AnuraGate
watcher.on("event", async (event) => {
  const { eventType, content, raw } = event;

  // Respond to issue comments and PR review comments that mention the trigger
  const isComment =
    eventType === "issue_comment.created" ||
    eventType === "pull_request_review_comment.created";
  if (!isComment) return;

  const body = content?.text || "";
  if (!body.toLowerCase().includes(BOT_TRIGGER.toLowerCase())) return;

  const owner = raw?.repository?.owner?.login;
  const repo = raw?.repository?.name;
  const issueNumber = raw?.issue?.number || raw?.pull_request?.number;
  if (!owner || !repo || !issueNumber) return;

  // Use repo + issue number as conversation context key
  const contextKey = `${owner}/${repo}#${issueNumber}`;
  console.log(`[${contextKey}] ${event.source?.name}: ${body.slice(0, 80)}...`);

  try {
    const reply = await chat(contextKey, body);
    console.log(`Assistant: ${reply.slice(0, 80)}...\n`);
    // Post The reply as a comment
    await watcher.postComment(owner, repo, issueNumber, reply);
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
