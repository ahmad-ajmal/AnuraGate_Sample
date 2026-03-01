// Webhooks — AnuraGate Example
//
// How it works:
//   1. This script starts a minimal HTTP server on PORT (default 3000)
//   2. AnuraGate POSTs signed events to /webhook whenever something happens
//      (policy block, budget warning, circuit breaker, PII detected, etc.)
//   3. The server verifies the HMAC-SHA256 signature and logs each event
//
// Setup:
//   1. Start this server (it needs a public URL — use ngrok or similar for local dev)
//      npx ngrok http 3000   →   copy the https:// URL
//   2. In your AnuraGate dashboard → Webhooks → New Endpoint
//      URL: https://your-ngrok-url.ngrok-free.app/webhook
//      Events: select the events you want to receive
//   3. Copy the Signing Secret shown and paste it into WEBHOOK_SECRET below
//
// Event types you may receive:
//   security.policy_blocked    — a policy rule blocked a request
//   security.circuit_breaker   — a session hit a cost/token/request limit
//   security.session_killed    — a session was manually or automatically terminated
//   security.pii_detected      — PII was found and redacted
//   security.secret_detected   — an API key or credential was found and redacted
//   budget.exceeded            — daily spend limit reached
//   budget.warning             — 80% of daily budget spent
//   request.error              — upstream AI provider returned an error
//   finance.intent.detected    — a purchase intent was detected in a conversation
//   finance.intent.approved    — a purchase was approved
//   finance.intent.declined    — a purchase was declined
//
// See README.md for more details.

require("dotenv").config();
const http = require("http");
const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const PORT = process.env.PORT || 3000;

if (!WEBHOOK_SECRET) {
  console.error("Missing WEBHOOK_SECRET. Copy .env.example to .env and fill it in.");
  console.error("Get the secret from your AnuraGate dashboard → Webhooks → your endpoint.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifySignature(rawBody, signature) {
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ---------------------------------------------------------------------------
// Event handler
// ---------------------------------------------------------------------------

function handleEvent(event) {
  const { type, data, timestamp } = event;
  const time = new Date(timestamp).toLocaleTimeString();

  switch (type) {
    case "security.policy_blocked":
      console.log(`[${time}] POLICY BLOCKED — key: ${data.keyLabel}`);
      console.log(`  Rules triggered: ${data.violations?.map((v) => v.ruleType).join(", ")}`);
      break;

    case "security.circuit_breaker":
      console.log(`[${time}] CIRCUIT BREAKER — key: ${data.keyLabel}, session: ${data.sessionId}`);
      console.log(`  Reason: ${data.message}`);
      break;

    case "security.session_killed":
      console.log(`[${time}] SESSION KILLED — key: ${data.keyLabel}, session: ${data.sessionId}`);
      console.log(`  Reason: ${data.reason} | Cost: $${data.totalCost?.toFixed(4)}`);
      break;

    case "security.pii_detected":
      console.log(`[${time}] PII DETECTED — key: ${data.keyLabel}, direction: ${data.direction}`);
      console.log(`  Categories: ${data.categories?.join(", ")}`);
      break;

    case "security.secret_detected":
      console.log(`[${time}] SECRET DETECTED — key: ${data.keyLabel}`);
      console.log(`  Categories: ${data.categories?.join(", ")}`);
      break;

    case "budget.exceeded":
      console.log(`[${time}] BUDGET EXCEEDED — key: ${data.keyLabel}`);
      break;

    case "budget.warning":
      console.log(`[${time}] BUDGET WARNING — key: ${data.keyLabel}`);
      console.log(`  Spent: $${data.spent?.toFixed(2)} of $${data.dailyLimit?.toFixed(2)}`);
      break;

    case "request.error":
      console.log(`[${time}] REQUEST ERROR — key: ${data.keyLabel}, model: ${data.model}, status: ${data.status}`);
      break;

    case "finance.intent.detected":
      console.log(`[${time}] PURCHASE INTENT — ${data.merchant} $${data.amount} ${data.currency}`);
      console.log(`  Category: ${data.category} | Confidence: ${Math.round((data.confidence || 0) * 100)}%`);
      break;

    case "finance.intent.approved":
      console.log(`[${time}] PURCHASE APPROVED — ${data.merchant} $${data.amount}`);
      break;

    case "finance.intent.declined":
      console.log(`[${time}] PURCHASE DECLINED — ${data.merchant}: ${data.reason}`);
      break;

    default:
      console.log(`[${time}] ${type}`);
      console.log(`  ${JSON.stringify(data)}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/webhook") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  let rawBody = "";
  req.on("data", (chunk) => { rawBody += chunk; });
  req.on("end", () => {
    // Verify signature
    const signature = req.headers["x-gate-signature"];
    if (!signature) {
      console.warn("Request missing x-gate-signature — ignoring");
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    try {
      if (!verifySignature(rawBody, signature)) {
        console.warn("Invalid signature — ignoring");
        res.writeHead(401);
        res.end("Unauthorized");
        return;
      }
    } catch {
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    // Parse and handle
    try {
      const event = JSON.parse(rawBody);
      handleEvent(event);
    } catch (err) {
      console.error("Failed to parse event:", err.message);
    }

    res.writeHead(200);
    res.end("OK");
  });
});

server.listen(PORT, () => {
  console.log(`Webhook receiver listening on http://localhost:${PORT}/webhook`);
  console.log("Register this URL in your AnuraGate dashboard → Webhooks → New Endpoint");
  console.log("(Use ngrok or a public URL for local development)\n");
});
