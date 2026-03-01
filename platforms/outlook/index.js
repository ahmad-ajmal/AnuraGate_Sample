// Outlook AI Agent — AnuraGate Example
//
// How it works:
//   1. Connects to your Outlook / Microsoft 365 mailbox via IMAP
//   2. When you email yourself, the email is sent through AnuraGate
//      and forwarded to the model
//   3. The reply is sent back to your inbox via SMTP
//
// Setup: see README.md

require("dotenv").config();
const nodemailer = require("nodemailer");
const { GateOutlookWatcher } = require("@anura-gate/watcher-outlook");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATE_KEY = process.env.GATE_KEY;
const INTEGRATION_ID = process.env.INTEGRATION_ID;
const EMAIL = process.env.OUTLOOK_EMAIL;
const PASSWORD = process.env.OUTLOOK_PASSWORD;
const MODEL = process.env.MODEL;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";

if (!GATE_KEY || !INTEGRATION_ID || !EMAIL || !PASSWORD) {
  console.error(
    "Missing required env vars. Copy .env.example to .env and fill it in.\n" +
    "  For Microsoft 365 accounts, use an app password or enable IMAP in account settings."
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// SMTP sender (replies back to yourself)
// ---------------------------------------------------------------------------

const smtp = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  auth: { user: EMAIL, pass: PASSWORD },
});

// ---------------------------------------------------------------------------
// Conversation history (per email subject thread)
// ---------------------------------------------------------------------------

const histories = new Map();

function getHistory(subject) {
  if (!histories.has(subject)) {
    histories.set(subject, [{ role: "system", content: SYSTEM_PROMPT }]);
  }
  return histories.get(subject);
}

async function chat(subject, userMessage) {
  const history = getHistory(subject);
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

const watcher = new GateOutlookWatcher({
  gateKey: GATE_KEY,
  integrationId: INTEGRATION_ID,
  sessionId: "outlook-demo",
  email: EMAIL,
  password: PASSWORD,
});

watcher.on("ready", (email) => {
  console.log(`Connected to Outlook as ${email}`);
  console.log("Email yourself to start chatting.\n");
});

// Fires for every new email in your inbox
watcher.on("mail", async (mail) => {
  // Only respond to emails from yourself (self-email)
  const fromEmail = (mail.from?.address || "").toLowerCase();
  if (fromEmail !== EMAIL.toLowerCase()) return;

  const subject = mail.subject || "(no subject)";
  const body = mail.snippet || subject;
  const text = body.trim();
  if (!text) return;

  console.log(`You (subject: ${subject}): ${text.slice(0, 100)}...`);

  try {
    const reply = await chat(subject, text);
    console.log(`Assistant: ${reply.slice(0, 100)}...\n`);

    await smtp.sendMail({
      from: EMAIL,
      to: EMAIL,
      subject: `Re: ${subject}`,
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
