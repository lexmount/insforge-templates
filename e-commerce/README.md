# InsForge E-Commerce

A full-stack e-commerce starter built with Next.js, Tailwind CSS, and InsForge.

**[Features](#features)** · **[Demo](#demo)** · **[Quick Launch](#quick-launch)** · **[Run locally](#run-locally)** · **[Deploy to Vercel](#deploy-to-vercel)** · **[First Try](#first-try)** · **[Analytics](#analytics)** · **[Customize](#customize)**

![InsForge E-Commerce starter preview](public/e-commerce-readme-cover.png)

This starter includes a public storefront, seeded catalog data, customer authentication, cart and checkout flows, saved addresses, order history, and the database + storage setup needed to run it from one migration file.

## Features

- Seeded storefront with featured products, categories, and search
- Variant-aware product pages and customer shopping flow
- Authenticated cart, checkout, saved addresses, and order history
- [InsForge](https://insforge.dev) authentication, database, storage, and Row Level Security
- Platform-managed GA4 analytics for traffic, conversions, acquisition, and retention
- Built with [Next.js](https://nextjs.org), React 19, and [Tailwind CSS](https://tailwindcss.com)
- Real Stripe Checkout with Apple Pay, Google Pay, and Link via InsForge Payments
- Promotion codes redeemable at Stripe Checkout (configured in your Stripe dashboard, see Stripe setup section)
- Order status timeline: placed, payment confirmed, preparing, shipped, delivered
- Wishlist with optimistic heart toggle and a dedicated `/account/wishlist` page

## Demo

Demo: [demoecommerce.insforge.site](https://demoecommerce.insforge.site)

The live demo includes a seeded storefront, category browsing, product detail pages, cart and checkout flows, and customer account pages so you can evaluate the starter before making any changes.

## Quick Launch

If you want the fastest path, use the InsForge CLI and follow the prompts:

```bash
npx @insforge/cli create
```

From there:

1. Choose the e-commerce template
2. Create or connect your InsForge project
3. Let the CLI set up the project files
4. Choose to deploy with [InsForge](https://insforge.dev) automatically from the guided flow

Use the local setup below if you want to inspect the repo, edit environment variables manually, or control the setup step by step.

## Run locally

1. Clone the repository and move into the e-commerce template:

   ```bash
   git clone https://github.com/InsForge/insforge-templates.git
   cd insforge-templates/e-commerce
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Go to the [InsForge dashboard](https://insforge.dev), create a project, and click **Connect** → **CLI** to get the link command:

   ```bash
   npx @insforge/cli link --project-id <your-project-id>
   ```

4. Copy the example environment file:

   ```bash
   cp .env.example .env.local
   ```

5. Fill in the required values (find these in the InsForge dashboard under **Connect** → **API Keys**):

   ```env
   NEXT_PUBLIC_INSFORGE_URL=https://your-project.region.insforge.app
   NEXT_PUBLIC_INSFORGE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

6. Apply the included schema and seed data to your InsForge project. You can either ask your agent using this prompt:

   > help me create table and seed data from migrations/db_init.sql

   Or run the command directly:

   ```bash
   npx @insforge/cli db import migrations/db_init.sql
   ```

   This migration creates the storefront tables, checkout functions, RLS policies, the `product-images` storage bucket record, and the seeded 15-product catalog.

7. Start the dev server:

   ```bash
   npm run dev
   ```

8. Open [http://localhost:3000](http://localhost:3000)

## Configure Stripe payments

This template uses InsForge's managed Stripe integration. The Stripe secret key is stored on the InsForge backend, never in your frontend.

1. Add your Stripe test key to InsForge:

   ```bash
   npx @insforge/cli payments config set test sk_test_xxx
   ```

2. Create one Stripe product + price per row in `public.products` (and per row in `public.product_variants` if you sell variants). The CLI mirrors them into `payments.products` and `payments.prices`:

   ```bash
   npx @insforge/cli payments products create \
     --environment test \
     --name "Linen sofa" \
     --idempotency-key "product:linen-sofa"

   npx @insforge/cli payments prices create \
     --environment test \
     --product prod_xxx \
     --currency usd \
     --amount 129900
   ```

3. Copy the resulting `price_xxx` and write it onto the matching `public.products` row (or `public.product_variants` row for variant level pricing):

   ```sql
   update public.products
   set stripe_price_id = 'price_xxx'
   where slug = 'linen-sofa';
   ```

4. When you are ready for production, repeat with `payments config set live sk_live_xxx` and seed live prices. The current implementation passes `'test'` as the environment to `payments.createCheckoutSession` (see `lib/store.ts`). Change that string, or wire it from an env variable, when you flip to live.

### Promotion codes

Promotion codes are not enabled by the template today because the InsForge SDK does not yet expose the `allowPromotionCodes` flag on the create-checkout-session call. Once the SDK adds the flag, this template will pass it through automatically. Until then:

1. In your Stripe dashboard, create a Coupon, then create a Promotion Code from that coupon (e.g. `SUMMER10` for 10 percent off).
2. Configure your Stripe Checkout settings to allow promotion codes by default at the account level, or pass the discount via the `discounts` parameter once the SDK supports it. The promo code input box on the Stripe Checkout page is controlled by Stripe, not by this template.
3. The `orders.discount_code` and `orders.discount_cents` columns are wired up but will not be populated until the SDK surfaces those fields on the payments projection table.

## Order lifecycle

1. The `place_order` PL/pgSQL function creates a `pending` order and records an `order_placed` event in `order_status_events`. It does not deduct inventory and does not convert the cart yet.
2. The `placeOrderAction` server action creates a Stripe Checkout Session via `insforge.payments.createCheckoutSession`.
3. The user is redirected to Stripe to enter a card or apply a promotion code.
4. Stripe redirects back to `/checkout/success?order_id=...&session_id=...`.
5. The success page polls `finalizeOrderAction`, which reads `payments.checkout_sessions.payment_status`. When `paid`, it calls the `finalize_order` RPC, which marks the order as paid + confirmed + processing, decrements inventory, converts the cart, and appends `payment_succeeded` + `fulfillment_processing` events.
6. The order detail page renders the timeline as a stepper. Subsequent fulfillment events (`fulfillment_shipped`, `fulfillment_delivered`) can be inserted by your fulfillment workflow to advance the stepper.

## Deploy to Vercel

After cloning the repo and running the starter locally, you can deploy it on Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FInsForge%2Finsforge-templates%2Ftree%2Fmain%2Fe-commerce&root-directory=e-commerce&project-name=insforge-ecommerce&repository-name=insforge-ecommerce&env=NEXT_PUBLIC_INSFORGE_URL,NEXT_PUBLIC_INSFORGE_ANON_KEY&envDescription=Connect%20your%20InsForge%20project%20URL%20and%20anon%20key.&external-id=https%3A%2F%2Fgithub.com%2FInsForge%2Finsforge-templates%2Ftree%2Fmain%2Fe-commerce&demo-title=InsForge%20E-Commerce&demo-description=A%20full-stack%20e-commerce%20starter%20built%20with%20Next.js%2C%20Tailwind%20CSS%2C%20and%20InsForge.&demo-image=https%3A%2F%2Fraw.githubusercontent.com%2FInsForge%2Finsforge-templates%2Fmain%2Fe-commerce%2Fpublic%2Fe-commerce-readme-cover.png)

1. Set `NEXT_PUBLIC_INSFORGE_URL`
2. Set `NEXT_PUBLIC_INSFORGE_ANON_KEY`
3. Deploy the project
4. In Vercel, open your project, go to `Settings` → `Environment Variables`, and set `NEXT_PUBLIC_APP_URL` to your deployed app URL
5. Redeploy the project
6. In the InsForge dashboard, open `Authentication` → `General` → `Allowed Redirect URLs`, then add:
   - `http://localhost:3000/auth/callback`
   - `https://your-project.vercel.app/auth/callback`

## First Try

After the migration runs, start by opening the home page, browsing a category, and opening a product detail page to see the seeded catalog in context. Then sign up, add a product to the cart, complete checkout, and open the account area to confirm that saved addresses and order history are backed by real database records.

## Analytics

Production deployments use the platform-managed GA4 property automatically. Page views and SPA
route changes require no application code. Import `analytics` from `@/lib/analytics` for explicit
business conversions such as a successful checkout. See [`../ANALYTICS.md`](../ANALYTICS.md) for
the event and privacy contract.

## Customize

- Replace the seeded catalog and placeholder photography with your own products and assets.
- Update the storefront copy, category structure, and pricing rules to match your product.

## Notes

- The seeded catalog uses remote placeholder furniture photography through `image_url`, so the storefront works immediately before any bucket uploads.
- In production, replace the placeholder photography with your own assets and update each product or variant `image_url`.
- Checkout is written through the `place_order` database function for an atomic order write.
- The app uses server-side [InsForge](https://insforge.dev) SDK calls with `httpOnly` auth cookies.
