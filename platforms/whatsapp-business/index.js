// WhatsApp Business AI Agent — AnuraGate Example
//
// How it works:
//   1. Meta sends webhook events from your WhatsApp Business number to AnuraGate
//   2. AnuraGate verifies the signature, applies your security policies,
//      and forwards messages to this watcher
//   3. This watcher calls the model and sends the reply back via the
//      WhatsApp Business Cloud API
//
// This uses the WhatsApp Business Platform (Cloud API), not your personal
// WhatsApp account. For the personal account watcher, see the whatsapp/ example.
//
// Setup:
//   1. Create a Meta App at developers.facebook.com with WhatsApp product added
//   2. Get a permanent access token and your Phone Number ID from the app dashboard
//   3. Create a WhatsApp Business integration in your AnuraGate dashboard
//      and note the Integration ID and webhook URL
//   4. In your Meta App → WhatsApp → Configuration:
//      Webhook URL: the AnuraGate webhook URL for this integration
//      Verify Token: paste WHATSAPP_VERIFY_TOKEN (same value as in .env)
//      App Secret: paste WHATSAPP_APP_SECRET (from Meta App → Settings → Basic)
//      Subscribe to: messages
//
// Setup: see README.md

require("dotenv").config();
const { GateWhatsAppBusinessWatcher } = require("@anura-gate/watcher-whatsapp-business");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATE_KEY = process.env.GATE_KEY;
const INTEGRATION_ID = process.env.INTEGRATION_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const MODEL = process.env.MODEL;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";
const GATE_URL = process.env.GATE_URL || "https://anuragate.com";

if (!GATE_KEY || !INTEGRATION_ID || !ACCESS_TOKEN || !PHONE_NUMBER_ID || !APP_SECRET || !VERIFY_TOKEN) {
  console.error(
    "Missing required env vars. Copy .env.example to .env and fill it in.\n" +
    "  WHATSAPP_ACCESS_TOKEN:  Meta App → WhatsApp → API Setup → access token\n" +
    "  WHATSAPP_PHONE_NUMBER_ID: Meta App → WhatsApp → API Setup → Phone Number ID\n" +
    "  WHATSAPP_APP_SECRET:    Meta App → Settings → Basic → App Secret\n" +
    "  WHATSAPP_VERIFY_TOKEN:  any string you choose — set same value in Meta webhook config"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Per-sender conversation history
// ---------------------------------------------------------------------------

const histories = new Map();

function getHistory(senderId) {
  if (!histories.has(senderId)) {
    histories.set(senderId, [{ role: "system", content: SYSTEM_PROMPT }]);
  }
  return histories.get(senderId);
}

async function chat(senderId, userMessage) {
  const history = getHistory(senderId);
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

const watcher = new GateWhatsAppBusinessWatcher({
  gateUrl: GATE_URL,
  gateKey: GATE_KEY,
  integrationId: INTEGRATION_ID,
  accessToken: ACCESS_TOKEN,
  phoneNumberId: PHONE_NUMBER_ID,
  appSecret: APP_SECRET,
  verifyToken: VERIFY_TOKEN,
});

watcher.on("ready", () => {
  console.log("WhatsApp Business watcher connected!");
  console.log(`Listening for messages on phone number ID: ${PHONE_NUMBER_ID}\n`);
});

// Fires for every inbound text message
watcher.on("message", async (event) => {
  if (event.eventType !== "message.text") return;

  const senderId = event.source?.id;
  const text = event.content?.text?.trim();
  if (!senderId || !text) return;

  console.log(`${event.source?.name || senderId}: ${text}`);

  try {
    const reply = await chat(senderId, text);
    console.log(`Assistant: ${reply}\n`);
    await watcher.sendMessage(senderId, reply);
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
