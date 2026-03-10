// Jira AI Agent — AnuraGate Example
//
// Two auth modes:
//   OAuth 2.0 (recommended) — set JIRA_CLIENT_ID + JIRA_CLIENT_SECRET,
//     browser opens on first run, you click "Allow", tokens auto-refresh.
//   API Token (headless/CI) — set JIRA_DOMAIN + JIRA_EMAIL + JIRA_TOKEN.
//
// How it works:
//   1. The watcher polls Jira Cloud for issue updates, comments, transitions
//   2. Events are sent to AnuraGate for security processing (redaction, policies)
//   3. When a comment contains the trigger phrase (@ai), the agent calls the
//      model with the issue context and posts a reply as a Jira comment
//
// Setup:
//   1. Create a Jira integration in your AnuraGate dashboard
//   2. Copy .env.example to .env and fill in your credentials
//   3. npm start — browser opens for OAuth, or uses API token automatically
//
// Credentials stay on your machine — NEVER sent to AnuraGate.

require("dotenv").config();
const { GateJiraWatcher } = require("@anura-gate/watcher-jira");
const { authorize, loadTokens, ensureValidToken } = require("@anura-gate/watcher-jira/lib/oauth");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATE_KEY = process.env.GATE_KEY;
const INTEGRATION_ID = process.env.INTEGRATION_ID;
const JIRA_PROJECTS = process.env.JIRA_PROJECTS;
const BOT_TRIGGER = process.env.BOT_TRIGGER || "@ai";
const MODEL = process.env.MODEL;
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  "You are a helpful project management assistant. Keep your responses concise and actionable. When reviewing issues, focus on clarity, priority, and next steps.";
const GATE_URL = process.env.GATE_URL || "https://anuragate.com";

// API token auth (optional)
const JIRA_DOMAIN = process.env.JIRA_DOMAIN;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_TOKEN;

// OAuth (recommended)
const JIRA_CLIENT_ID = process.env.JIRA_CLIENT_ID;
const JIRA_CLIENT_SECRET = process.env.JIRA_CLIENT_SECRET;

if (!GATE_KEY || !INTEGRATION_ID) {
  console.error(
    "Missing GATE_KEY or INTEGRATION_ID. Copy .env.example to .env and fill it in."
  );
  process.exit(1);
}

const hasApiToken = JIRA_DOMAIN && JIRA_EMAIL && JIRA_TOKEN;
const hasOAuthCreds = JIRA_CLIENT_ID && JIRA_CLIENT_SECRET;

if (!hasApiToken && !hasOAuthCreds) {
  console.error(
    "No Jira credentials found. Either:\n" +
    "  1. Set JIRA_CLIENT_ID + JIRA_CLIENT_SECRET for OAuth (recommended)\n" +
    "  2. Set JIRA_DOMAIN + JIRA_EMAIL + JIRA_TOKEN for API token auth"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Per-issue conversation history
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

const projects = JIRA_PROJECTS
  ? JIRA_PROJECTS.split(",").map((p) => p.trim()).filter(Boolean)
  : [];

async function main() {
  let watcherOpts;

  if (hasApiToken) {
    // API Token mode
    watcherOpts = {
      gateUrl: GATE_URL,
      gateKey: GATE_KEY,
      integrationId: INTEGRATION_ID,
      jiraDomain: JIRA_DOMAIN,
      jiraEmail: JIRA_EMAIL,
      jiraToken: JIRA_TOKEN,
      projects,
    };
    console.log("Starting with API token auth...\n");
  } else {
    // OAuth mode
    let stored = loadTokens();

    if (!stored) {
      stored = await authorize({
        clientId: JIRA_CLIENT_ID,
        clientSecret: JIRA_CLIENT_SECRET,
      });
    } else {
      stored = await ensureValidToken(stored);
      console.log(`Using stored OAuth tokens for: ${stored.siteName} (${stored.siteUrl})`);
    }

    watcherOpts = {
      gateUrl: GATE_URL,
      gateKey: GATE_KEY,
      integrationId: INTEGRATION_ID,
      oauth: {
        accessToken: stored.accessToken,
        cloudId: stored.cloudId,
        siteUrl: stored.siteUrl,
      },
      projects,
    };
    console.log("Starting with OAuth...\n");
  }

  const watcher = new GateJiraWatcher(watcherOpts);

  // Auto-refresh OAuth tokens every 45 minutes
  if (!hasApiToken) {
    setInterval(async () => {
      try {
        const refreshed = await ensureValidToken(loadTokens());
        watcher.updateOAuthToken(refreshed.accessToken);
      } catch (err) {
        console.error("Token refresh failed:", err.message);
      }
    }, 45 * 60_000);
  }

  watcher.on("ready", (displayName) => {
    console.log(`Jira watcher connected as ${displayName}!`);
    console.log(`Auth mode: ${hasApiToken ? "API Token" : "OAuth 2.0"}`);
    if (projects.length > 0) {
      console.log(`Watching projects: ${projects.join(", ")}`);
    } else {
      console.log("Watching: all projects");
    }
    console.log(`Responding to comments containing '${BOT_TRIGGER}'\n`);
  });

  // Fires for every Jira event detected by the watcher
  watcher.on("event", async (event) => {
    const { eventType, content } = event;

    // Only respond to comments that contain the trigger phrase
    if (eventType !== "comment_added") return;

    const text = content?.text || "";
    const commentBody = content?.metadata?.commentBody || text;
    if (!commentBody.toLowerCase().includes(BOT_TRIGGER.toLowerCase())) return;

    const issueKey = content?.metadata?.issueKey;
    if (!issueKey) return;

    const summary = content?.metadata?.summary || "";
    const contextKey = issueKey;

    console.log(`[${issueKey}] ${event.source?.name}: ${commentBody.slice(0, 80)}...`);

    // Build context with issue details
    const prompt = [
      `Issue: ${issueKey} — ${summary}`,
      `Status: ${content?.metadata?.status || "unknown"}`,
      `Priority: ${content?.metadata?.priority || "unknown"}`,
      `Type: ${content?.metadata?.issueType || "unknown"}`,
      "",
      `Comment by ${event.source?.name}:`,
      commentBody,
    ].join("\n");

    try {
      const reply = await chat(contextKey, prompt);
      console.log(`Assistant: ${reply.slice(0, 80)}...\n`);

      // Post the reply directly as a Jira comment
      await watcher.postComment(issueKey, reply);
      console.log(`  → Comment posted to ${issueKey}\n`);
    } catch (err) {
      console.error("Error:", err.message);
    }
  });

  watcher.on("gate_error", (err) => {
    console.error("AnuraGate error:", err);
  });

  watcher.on("jira_error", (err) => {
    console.error("Jira error:", err);
  });

  await watcher.start();
}

main().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});
