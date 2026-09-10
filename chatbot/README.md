<a href="https://insforge.dev">
  <h1 align="center">Lexmount AI Chat + Storage Starter</h1>
</a>

<p align="center">
  A Next.js starter that uses the AI model and object storage already configured by Insight Flow.
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#quick-launch"><strong>Quick Launch</strong></a> ·
  <a href="#run-locally"><strong>Run locally</strong></a> ·
  <a href="#deploy-to-vercel"><strong>Deploy to Vercel</strong></a> ·
  <a href="#first-try"><strong>First Try</strong></a>
</p>

<img alt="InsForge Chatbot template preview" src="./public/chatbot-readme-cover.png" />

<br/>

## Features

- [Next.js](https://nextjs.org) App Router
- Streaming chat UI with persisted history and file attachments
- [InsForge](https://insforge.dev) auth, database, storage, and AI
- Platform-owned AI credentials and default model; no provider key in application code
- InsForge Storage backed by the Platform-owned S3-compatible provider (Tencent COS in Lexmount)
- Optional model override with `provider/model` IDs
- [shadcn/ui](https://ui.shadcn.com) components
- Styling with [Tailwind CSS](https://tailwindcss.com)

## Quick Launch

In Insight Flow, choose **AI Chat + Storage Starter** when creating an application. The
Platform checks `ai.chat`, `ai.streaming`, and `storage` before provisioning, installs the
database migration and storage bucket, and generates `.env.local` with only the public InsForge
endpoint and anon key.

The model selector starts at **Platform default**. That option intentionally omits the model from
the request, allowing the server-owned `AI_DEFAULT_MODEL` to select DeepSeek, LiteLLM, or another
configured OpenAI-compatible model. Files are uploaded through InsForge Storage; the application
never receives COS credentials.

Use the local setup below if you want to inspect the repo, edit environment variables manually, or control the setup step by step.

## Run locally

1. Clone the repository and move into the chatbot template:

   ```bash
   git clone https://github.com/lexmount/insforge-templates.git
   cd insforge-templates/chatbot
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Go to the [InsForge dashboard](https://insforge.dev), create a project, and click **Connect** → **CLI** to get the link command:

   ```bash
   npx @insforge/cli link --project-id <your-project-id>
   ```

5. Copy the example environment file:

   ```bash
   cp .env.example .env.local
   ```

6. Fill in the required values (find these in the InsForge dashboard under **Connect** → **API Keys**):

   ```env
   NEXT_PUBLIC_INSFORGE_URL=https://your-project.region.insforge.app
   NEXT_PUBLIC_INSFORGE_ANON_KEY=your-public-anon-key
   ```

7. Apply the included schema and seed data to your InsForge project. You can either ask your agent using this prompt:

   > help me create table and seed data from migrations/db_init.sql

   Or run the command directly:

   ```bash
   npx @insforge/cli db import migrations/db_init.sql
   ```

   This migration creates the chat tables and also inserts the `chat-attachments` storage bucket record used by file uploads.

8. Start the dev server:

   ```bash
   npm run dev
   ```

9. Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

After cloning the repo and running the starter locally, you can deploy it on Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Flexmount%2Finsforge-templates%2Ftree%2Fmain%2Fchatbot&root-directory=chatbot&project-name=insforge-chatbot&repository-name=insforge-chatbot&env=NEXT_PUBLIC_INSFORGE_URL,NEXT_PUBLIC_INSFORGE_ANON_KEY&envDescription=Connect%20your%20InsForge%20project%20URL%20and%20anon%20key.)

1. Set `NEXT_PUBLIC_INSFORGE_URL`
2. Set `NEXT_PUBLIC_INSFORGE_ANON_KEY`
3. Deploy the project
4. In the InsForge dashboard, open `Authentication` → `General` → `Allowed Redirect URLs`, then add your deployed callback URL (for example `https://your-project.vercel.app/auth/callback`)

## First Try

The empty chat state starts with a welcome heading and three beginner-friendly starter prompts ("Explain a concept", "Improve my writing", "Brainstorm next steps") so you can try the template quickly on localhost or a cloud preview. Selecting a starter prompt fills the input first, so you can adjust it before sending. The prompts are defined in [`components/chat-empty-state.tsx`](./components/chat-empty-state.tsx) and are easy to replace with your own product's use cases.

## Managed user credits

This template includes `/credits` (available balance, reserved credits, redemption and paginated history), plus a credit link in the chat header. The platform owns pricing, grants, wallets and accounting. **Do not create credit tables in the application's database.** No payment, referral or subscription UI is included.

Enable credits in the application management console after deploying a runtime with the user-credits API and provisioning its server-only platform credentials. Existing applications can keep billing disabled or use shadow mode before enforcement. Set an immutable model price version, global/model multipliers and optional verified-registration grant in the platform. Environment credentials, wallet identities, model prices and multipliers never come from the browser. The only template configuration remains the public InsForge URL and anon key.

`lib/credits-client.ts` is the portable client: `wallet()`, `ledger(cursor?)`, and `redeem(code, idempotencyKey)`. Values are **integer microcredit strings** (1 credit = 1,000,000 microcredits); use `formatCredits` for exact display. Retain the same redemption key when retrying an uncertain network result. The server also prevents each user from redeeming the same code twice.

For another template:

1. Copy the lightweight client and adapt `components/credits-panel.tsx` to your UI.
2. Connect it to authenticated runtime `/api/credits/wallet`, `/api/credits/ledger`, and `/api/credits/redeem`. For cookie-based SSR use the same-origin routes and `lib/credits-proxy.ts`; verify the current session server-side and forward its bearer token. Never forward a client-supplied user, application or environment identifier.
3. Send AI requests through the application's managed gateway with the verified user's access token. The runtime automatically reserves and settles credits; the template must not deduct points itself.
4. Preserve HTTP `INSUFFICIENT_CREDITS` errors and SSE failures; refresh the wallet after completed or failed requests. Show redemption/contact-administrator guidance instead of a recharge button.

The AI adapter calls the same managed `/api/ai/chat/completion` gateway directly because the currently locked SDK discards structured stream failures. It requires an explicit successful `done` event before persisting the response as complete. A disconnected request can still consume credits; check history before retrying. Wallets are isolated by application, environment and verified user. Tenant attribution is retained by the platform without tenant-level charging in v1.

Validation: `npm test`, `npm run typecheck`, and `npm run build`. Before enabling enforcement, exercise the template against a test runtime with a real model: verified sign-up grant, code redemption/replay, successful streaming debit, insufficient balance, interrupted stream, ledger pagination and a second user/environment isolation check. Unit test fixtures are not a substitute for this integration acceptance.

### Whole-credit billing

The platform rounds each positively priced AI request up to a whole credit (minimum 1 credit; 1.2 credits becomes 2). Reservations use the same upward rounding. The template displays whole balances and ledger amounts without decimal suffixes, while preserving exact historical fractional values. Do not round or price requests in the client: the platform retains precise usage/cost and returns authoritative microcredit strings.
