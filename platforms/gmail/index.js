// Gmail AI Agent — AnuraGate Example
//
// How it works:
//   1. Connects to your Gmail via IMAP (app password — your credentials stay local)
//   2. When you email yourself, the email is sent through AnuraGate
//      and forwarded to the model
//   3. The reply is sent back to your inbox via SMTP
//
// Setup: see README.md

require("dotenv").config();
const nodemailer = require("nodemailer");
const { GateGmailWatcher } = require("@anura-gate/watcher-gmail");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATE_KEY = process.env.GATE_KEY;
const INTEGRATION_ID = process.env.INTEGRATION_ID;
const EMAIL = process.env.GMAIL_EMAIL;
const APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const MODEL = process.env.MODEL;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";
const GATE_URL = process.env.GATE_URL || "https://anuragate.com";

if (!GATE_KEY || !INTEGRATION_ID || !EMAIL || !APP_PASSWORD) {
  console.error(
    "Missing required env vars. Copy .env.example to .env and fill it in.\n" +
    "  GMAIL_APP_PASSWORD: generate at myaccount.google.com → Security → App passwords"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// SMTP sender (replies back to yourself)
// ---------------------------------------------------------------------------

const smtp = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  auth: { user: EMAIL, pass: APP_PASSWORD },
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

const watcher = new GateGmailWatcher({
  gateUrl: GATE_URL,
  gateKey: GATE_KEY,
  integrationId: INTEGRATION_ID,
  sessionId: "gmail-demo",
  email: EMAIL,
  appPassword: APP_PASSWORD,
});

watcher.on("ready", (email) => {
  console.log(`Connected to Gmail as ${email}`);
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
