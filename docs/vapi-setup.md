# Vapi Voice Integration — Setup Guide

Complete setup for connecting Vapi to the Stack file assistant. After this, users click the mic button, speak a question, and hear the answer from their uploaded files.

---

## Architecture

```
User speaks → Vapi (speech-to-text) → askFiles function call
                                          ↓
                              POST /vapi/webhook (your backend)
                                          ↓
                              RAG pipeline (embed → vector search → LLM)
                                          ↓
                              Answer text → Vapi (text-to-speech) → User hears answer
```

Security: The frontend passes the authenticated `userId` as call metadata. The webhook validates it before querying files. No Supabase tokens are sent to Vapi — only the opaque user ID.

---

## Step 1 — Create a Vapi Account

1. Go to [https://vapi.ai](https://vapi.ai) and sign up
2. Navigate to **Dashboard → Organization Settings → API Keys**
3. Copy your **Public Key** (starts with `pk_...`) — this is safe for the frontend
4. Note your **Private Key** — you won't need it in code, but keep it for dashboard API access

---

## Step 2 — Create the Assistant

1. In the Vapi dashboard, go to **Assistants → Create Assistant**
2. Choose **Blank Template**

### 2a. Model Configuration

| Setting | Value |
|---------|-------|
| Provider | OpenAI (or your preference) |
| Model | gpt-4o-mini (cost-effective) or gpt-4o |
| Temperature | 0.2 |
| Max Tokens | 300 |

### 2b. System Prompt

Paste this exactly:

```
You are a voice assistant for a file management app called Stack. Users upload PDF and DOCX files, and you answer questions about their contents.

Rules:
- Use ONLY the information returned by the askFiles function. Never invent answers.
- If the function returns no useful information, say "I couldn't find that in your files."
- Keep answers concise — 2-3 sentences max for voice.
- When citing files, say the file name naturally (e.g., "According to your resume...")
- Be conversational but professional.
- If the user asks something unrelated to their files, politely redirect: "I can only help with questions about your uploaded files."
```

### 2c. Voice Configuration

| Setting | Value |
|---------|-------|
| Provider | 11labs or PlayHT or Deepgram |
| Voice | Pick any natural-sounding voice |
| Filler Injection | Enabled (makes it feel natural) |
| Response Delay | 0.4s (optional, avoids cutting user off) |

### 2d. Transcriber Configuration

| Setting | Value |
|---------|-------|
| Provider | Deepgram |
| Model | nova-2 |
| Language | en |

---

## Step 3 — Add the `askFiles` Function

This is how Vapi knows to call your backend.

1. In the assistant editor, go to **Functions** (or **Tools**)
2. Click **Add Function**
3. Configure:

| Field | Value |
|-------|-------|
| Name | `askFiles` |
| Description | `Search the user's uploaded files and answer their question using RAG` |
| Type | Server (webhook) |

### Function Parameters (JSON Schema):

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "The user's question to search their files for"
    }
  },
  "required": ["query"]
}
```

### Server URL:

```
https://YOUR_BACKEND_DOMAIN/vapi/webhook
```

Replace `YOUR_BACKEND_DOMAIN` with your actual backend URL (e.g., `https://api.yourapp.com`).

> **For local development**: Use a tunnel like [ngrok](https://ngrok.com) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):
> ```bash
> ngrok http 3001
> ```
> Then use the ngrok URL: `https://abc123.ngrok-free.app/vapi/webhook`

4. Click **Save**

---

## Step 4 — Copy the Assistant ID

1. After saving, the assistant page URL will look like:
   `https://dashboard.vapi.ai/assistants/asst_xxxxxxxxxxxx`
2. Copy the ID (the `asst_xxxxxxxxxxxx` part)

---

## Step 5 — Configure Environment Variables

### Frontend (`frontend/.env`)

```env
VITE_VAPI_PUBLIC_KEY=pk_your_public_key_here
VITE_VAPI_ASSISTANT_ID=asst_your_assistant_id_here
```

That's it for the frontend. No backend env vars needed — the webhook is stateless and uses the existing RAG configuration.

---

## Step 6 — Secure the Webhook

The webhook at `POST /vapi/webhook` is open (no auth middleware) because Vapi calls it server-to-server. To prevent abuse, add a shared secret:

### 6a. Set a secret in Vapi Dashboard

1. Go to **Assistant → Advanced → Server URL Headers**
2. Add a header:
   - **Key**: `x-vapi-secret`
   - **Value**: Generate a strong random string (e.g., `openssl rand -hex 32`)

### 6b. Add the secret to your backend `.env`

```env
VAPI_WEBHOOK_SECRET=your_generated_secret_here
```

### 6c. Validate in the webhook (optional hardening)

If you want to enforce this, add to `vapi.controller.ts`:

```typescript
const secret = process.env.VAPI_WEBHOOK_SECRET;
if (secret && req.headers["x-vapi-secret"] !== secret) {
  res.status(401).json({ error: "Unauthorized" });
  return;
}
```

---

## Step 7 — Test

1. Start backend and frontend locally
2. Sign in to the app
3. Upload at least one PDF or DOCX file (wait for indexing)
4. Click the mic button (bottom-right corner)
5. Speak: "What is in my files?"
6. You should hear the assistant respond with content from your files

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Mic button doesn't appear | Missing env vars | Ensure both `VITE_VAPI_PUBLIC_KEY` and `VITE_VAPI_ASSISTANT_ID` are set and restart dev server |
| "Connecting" but never starts | Invalid public key | Double-check `VITE_VAPI_PUBLIC_KEY` matches your Vapi dashboard |
| Assistant says "Authentication required" | userId not passed | Check that the user is signed in before clicking mic |
| Assistant says "I couldn't find..." | Files not indexed | Upload a file and wait ~10s for embedding indexing to complete |
| No audio / silent | Browser permissions | Allow microphone access when prompted |
| Webhook never called | Wrong Server URL | Check the function's Server URL matches your backend (including `/vapi/webhook` path) |
| Webhook returns errors | Backend not running | Check backend logs for errors; ensure `OPENAI_API_KEY` / embedding config is set |

---

## Security Summary

| Concern | How it's handled |
|---------|-----------------|
| User identity | `userId` passed as call metadata (opaque UUID, not a token) |
| File access | Backend queries files scoped to that userId — no cross-user access |
| API keys | Vapi Public Key is safe for frontend; Private Key stays on dashboard only |
| Webhook abuse | Optional `x-vapi-secret` header validation |
| No tokens to Vapi | Supabase session tokens never leave the frontend; only the userId UUID is shared |
| Voice data | Handled by Vapi's infrastructure; review their [privacy policy](https://vapi.ai/privacy) |

---

## Cost Estimate

| Component | Cost |
|-----------|------|
| Vapi | ~$0.05/min (includes STT + TTS + orchestration) |
| OpenAI (RAG) | ~$0.01-0.03 per question (embedding + completion) |
| Total | ~$0.06-0.08 per voice question |

Free tier: Vapi offers $10 credit on signup (~200 minutes of voice).

---

## Optional Enhancements (Post-MVP)

- **Workspace scoping**: Pass `workspaceId` in metadata to scope voice queries to a workspace
- **Conversation memory**: Enable Vapi's conversation history for follow-up questions
- **Custom voice**: Clone a brand voice via 11Labs for a unique experience
- **End-of-call summary**: Use Vapi's `call-end` event to save the conversation to activity timeline
