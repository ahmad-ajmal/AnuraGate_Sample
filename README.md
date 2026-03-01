# AnuraGate Examples

Connect an AI model to your messaging apps and services in minutes. No servers. No webhooks. No infrastructure.

These examples show how to build AI agents powered by AnuraGate — a security proxy that sits between your apps and the AI provider. Your credentials never leave your machine.

---

## How it works

```
You → message → AnuraGate → AI model → reply back to you
```

1. **You run a watcher** — a small local process that monitors your account
2. **You send a message** — WhatsApp self-chat, Slack DM, GitHub issue comment, etc.
3. **AnuraGate receives it** — applies your security policies (redaction, rate limits, audit)
4. **The model responds** — the reply is sent back through the watcher to your account

Your credentials (WhatsApp session, Telegram API key, Slack tokens, email passwords) **never leave your machine**. Only the message content flows through AnuraGate.

---

## Prerequisites

- **Node.js 18+** — uses native `fetch`
- **AnuraGate account** — [sign up at anuragate.com](https://anuragate.com)
- **A Gate Key** — dashboard → Settings → API Keys → Create Key
- **A Watcher Integration** — dashboard → Integrations → New Integration → choose your platform

---

## Quick start

Pick an example, then:

```bash
cd platforms/whatsapp          # or any other folder
npm install
cp .env.example .env
# edit .env with your credentials
node index.js
```

---

## Platform examples

Connect an AI model to a messaging platform. Message yourself (or the bot) to get a response.

| Platform | How to trigger | Auth required |
|----------|---------------|---------------|
| [WhatsApp](./platforms/whatsapp/) | Message your own number | QR code scan |
| [Telegram](./platforms/telegram/) | Message Saved Messages | Phone number + code |
| [Slack](./platforms/slack/) | DM your bot | Bot token + App token |
| [Gmail](./platforms/gmail/) | Email yourself | App password |
| [Outlook](./platforms/outlook/) | Email yourself | Password / App password |
| [Discord](./platforms/discord/) | DM your own account | User token |
| [Discord Bot](./platforms/discord-bot/) | DM the bot | Bot token |
| [Telegram Bot](./platforms/telegram-bot/) | Message the bot | Bot token + webhook secret |
| [GitHub](./platforms/github/) | Comment `@ai` on an issue or PR | Personal access token + webhook secret |
| [LinkedIn](./platforms/linkedin/) | Receive a LinkedIn message | OAuth access token |
| [WhatsApp Business](./platforms/whatsapp-business/) | Message your business number | Cloud API credentials |

---

## Feature examples

These show specific AnuraGate capabilities. Only a Gate Key is required — no platform watcher needed.

| Example | What it demonstrates |
|---------|---------------------|
| [Streaming](./features/streaming/) | Real-time token-by-token responses via SSE |
| [Tool use](./features/tool-use/) | AI tool calling mid-conversation |
| [Sessions](./features/sessions/) | Session tracking + circuit breaker kill-switch |
| [Webhooks](./features/webhooks/) | Receiving and verifying AnuraGate security events |
| [Finance](./features/finance/) | AI-driven purchase intent + human-in-the-loop approval |

---

## Streaming

The [streaming](./features/streaming/) example sends requests with `stream: true` and prints the response token-by-token as it arrives — no waiting for the full response.

```bash
cd features/streaming && npm install && cp .env.example .env
node index.js
```

---

## Tool use

The [tool-use](./features/tool-use/) example shows the model calling local tools during a conversation. When the model decides to use a tool, the call executes locally and the result is sent back — the model then gives a final answer using the tool output.

Includes two demo tools: `get_weather` and `calculate`. Replace with your own (calendar, search, database, etc.).

```bash
cd features/tool-use && npm install && cp .env.example .env
node index.js
# Try: "What is the weather in Tokyo?" or "Calculate (12 * 8) + 44"
```

---

## Sessions

The [sessions](./features/sessions/) example attaches a unique session ID to every request via the `x-gate-session` header. AnuraGate tracks cumulative cost, token count, and request count for the session — visible in your dashboard under Sessions.

If you configure a circuit breaker on your key (dashboard → Keys → Edit → Circuit Breaker), AnuraGate stops the session automatically when a limit is hit and returns an error this example handles gracefully.

```bash
cd features/sessions && npm install && cp .env.example .env
node index.js
```

Circuit breaker requires Pro or higher plan.

---

## Webhooks

The [webhooks](./features/webhooks/) example is a minimal HTTP server that receives signed event notifications from AnuraGate. It verifies the HMAC-SHA256 signature and logs each event by type.

Events include: policy blocks, budget warnings, circuit breaker trips, PII detections, and finance events.

```bash
cd features/webhooks && npm install && cp .env.example .env
# For local dev, expose with: npx ngrok http 3000
# Register the URL in dashboard → Webhooks → New Endpoint
node index.js
```

Webhooks require Pro or higher plan.

---

## Finance

The [finance](./features/finance/) example shows the AnuraGate financial gateway. When the model's response contains a purchase intent (flight, hotel, subscription, etc.), AnuraGate automatically:

1. Detects the intent using a two-tier scanner (regex + LLM)
2. Sends you an approval request via your configured watcher (WhatsApp, Slack, or Telegram) — or asks inline in the chat if no watcher is running
3. Issues a single-use virtual card on approval
4. Declines and notifies the agent if you say no (or if no policy covers the transaction)

This script is just the chat interface — intent detection, approval routing, and card issuance all happen inside AnuraGate.

```bash
cd features/finance && npm install && cp .env.example .env
node index.js
# Try: "Find me a one-way flight from NYC to London next Friday"
```

Requires Pro or higher plan. One-time setup in the dashboard:
- Finance → Wallets → create a wallet with a spend limit
- Finance → Transaction Policies → create a policy with your rules and set **Require Approval** on. Rules must match the purchase for it to be authorized — a policy with no rules matches everything.
- Finance → Approver → set your platform and recipient ID. For WhatsApp, enter your phone number (e.g. `+923164706597`) — AnuraGate normalizes the format automatically.
- Have the corresponding watcher running (whatsapp/, slack/, or telegram/). If the watcher is offline, approval falls back to the chat conversation — reply `YES` or `NO` directly.

**Approval timeouts (local dev):** Pending approvals auto-expire via a scheduled cron job. When running locally, trigger it manually if an intent gets stuck:
```bash
curl http://localhost:3000/api/cron/finance-timeouts
```

---

## Self-message mode

The personal account examples (WhatsApp, Telegram, Discord, LinkedIn) respond only when you message **yourself**. This gives you a dedicated, private channel to talk to your AI agent without it watching all your conversations.

For extra control, enable **"Self-messages only"** in your AnuraGate integration settings — the watcher will filter non-self messages at the source before they ever reach AnuraGate.

---

## Conversation memory

Each example maintains conversation history for the duration of the session, so the model remembers what you said earlier. History resets when you restart the script.

For persistence across restarts, save the `history` array to a database (SQLite, Redis, etc.) and restore it on startup.

---

## Customising the system prompt

Set `SYSTEM_PROMPT` in your `.env`:

```
SYSTEM_PROMPT=You are a personal assistant who helps me manage my tasks and always responds concisely.
```

---

## Choosing a model

Set `MODEL` in your `.env`. Any model available through your AnuraGate key works:

```
MODEL=gpt-4o
MODEL=gemini-2.0-flash
MODEL=gpt-4o-mini
```

---

## Security

AnuraGate sits between your app and the AI provider. Everything that flows through gets:

- **Redaction** — PII and secrets stripped before reaching the model
- **Policies** — block or allow specific content patterns
- **Audit** — optional logging of all interactions
- **Rate limits** — per-key daily and per-minute limits
- **Circuit breakers** — auto-stop sessions that exceed cost, token, or request limits

Configure all of this in the AnuraGate dashboard — no code changes needed.

---

## Extending these examples

These scripts are intentionally minimal. Some ideas for what to build next:

- **Persistent memory** — store conversation history in a database between sessions
- **Multiple personas** — different system prompts per platform or per user
- **Pool mode** — serve multiple users from a single watcher process (see SDK docs)
- **Richer tools** — calendar, search, code execution, database queries
- **Scheduled messages** — proactive AI check-ins at set times

---

## License

MIT
