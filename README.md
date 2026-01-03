# Decisions - Profit Decision Engine for Shopify

A Shopify app that analyzes your order data to find **specific, actionable profit opportunities** you're missing right now.

No fluff. No generic advice. Just data-backed decisions with the maths to prove it.

## What v1 Does

Decisions analyzes your last 90 days of orders and looks for three specific profit-killing patterns:

### 1. Best-Seller Loss
**What it catches:** Products selling well but losing money after COGS, refunds, and shipping.

**Example decision:**
> £1,420/month at risk
> Stop pushing Classic Hoodie (or raise price by 8%)
> Made £8,200 revenue but lost £270 after COGS (£7,480), refunds (£180), and shipping (£90)

**Why it matters:** You can't see this in Shopify Analytics without manually calculating costs per product.

### 2. Free-Shipping Trap
**What it catches:** Orders clustering just below your free shipping threshold, costing you money.

**Example decision:**
> £680/month opportunity
> Lower free shipping to £45 (from assumed £50)
> 38% of orders are £3.50 below free shipping

**Why it matters:** Combines basket sizes + shipping costs + order clustering. Hard to spot manually.

### 3. Discount-Refund Double Hit
**What it catches:** Products heavily discounted AND getting refunded at high rates.

**Example decision:**
> £142/month at risk
> Stop discounting Summer Dress (23% off + 18% refunded)
> Discounted 23% on average, then 18% were refunded - lost £142.50 total

**Why it matters:** Discounts already hurt margins, but if refunds pile on top, you're paying twice.

---

## Required Data

- **30+ orders** in the last 90 days (bare minimum)
- **100+ orders** for reliable patterns
- **COGS (Cost of Goods Sold)** entered in Shopify for each variant

Without COGS, the app can still detect Free-Shipping Trap, but won't show Best-Seller Loss or Discount-Refund Hit.

---

## Installation & Setup

### 1. Prerequisites

- **Shopify Partners Account** - [Create one](https://partners.shopify.com/signup)
- **Development Store** with real or test order data
- **PostgreSQL Database** - Use [Neon](https://neon.tech) (free tier works)
- **Node.js** >= 20.0.0

### 2. Clone and Install

```bash
git clone https://github.com/adedayo14/decisions.git
cd decisions
npm install
```

### 3. Set up Environment Variables

Create a `.env` file:

```bash
# Shopify App Credentials
SHOPIFY_API_KEY="your_client_id_here"
SHOPIFY_API_SECRET="your_api_secret_here"

# Database
DATABASE_URL="postgresql://user:password@host.neon.tech/dbname?sslmode=require"

# App URL
SHOPIFY_APP_URL="http://localhost:3000"

# Required Scopes
SCOPES="read_orders,read_products"

# Environment
NODE_ENV="development"
```

### 4. Configure Shopify App

Update `shopify.app.toml`:

```toml
client_id = "your_client_id_here"
name = "Decisions"
application_url = "http://localhost:3000"
embedded = true

[access_scopes]
scopes = "read_orders,read_products"
```

### 5. Set up Database

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

### 6. Run Locally

```bash
npm run dev
```

This will:
- Start the Remix dev server
- Launch Shopify CLI with tunnel
- Open browser to install the app

---

## How It Works

1. **Install the app** in your Shopify Admin
2. **First load:** App automatically fetches your last 90 days of orders
3. **Analysis runs:** Checks for the 3 profit patterns
4. **Shows up to 3 decisions**, ranked by monthly impact
5. **Click "See numbers"** to verify the maths
6. **Mark as Done** when you've acted on it

If no patterns are found, you'll see:
> "We analyzed your Shopify data but haven't found any profit opportunities yet. Check back later as you get more orders."

This is expected behavior if:
- You have fewer than 30 orders
- Your margins are healthy across the board
- No clustering near free shipping threshold
- Refund rates are low

---

## Decision Thresholds

These are the minimum criteria for each decision type:

| Decision Type | Minimum Criteria |
|---------------|------------------|
| **Best-Seller Loss** | 10+ units sold, negative profit or <5% margin |
| **Free-Shipping Trap** | 30+ orders, 15%+ clustering below threshold |
| **Discount-Refund Hit** | 10+ units, 20%+ discount rate, 15%+ refund rate, negative profit |

Confidence levels:
- **High confidence:** 20+ units or 25%+ clustering
- **Medium confidence:** 10-19 units or 15-24% clustering
- **Low confidence:** Just meets minimum threshold

---

## COGS Management

The app uses Shopify's built-in "Cost per item" field for each variant.

**To add costs in Shopify:**
1. Go to Products → [Product] → Variants
2. Edit each variant
3. Set "Cost per item" (what you pay to acquire/make it)
4. Save

**Assumed Shipping Cost:**
- Default: £3.50 per order (configurable in Settings)
- Used when calculating shipping impact

Products without COGS are **excluded** from COGS-dependent decisions (Best-Seller Loss, Discount-Refund Hit).

---

## What v1 Does NOT Do

Be clear about limitations:

- ❌ No historical archive of past decisions
- ❌ No CSV export of data
- ❌ No email alerts when new decisions appear
- ❌ No predictive forecasting or AI
- ❌ No automatic price changes
- ❌ No integration with other tools (yet)

v1 is focused on: **Find the top 3 profit leaks right now. Show the maths. Let the merchant decide.**

---

## Deployment to Vercel

1. Push code to GitHub
2. Import project in [Vercel](https://vercel.com/new)
3. Add environment variables in Vercel dashboard:
   - `SHOPIFY_API_KEY`
   - `SHOPIFY_API_SECRET`
   - `SHOPIFY_APP_URL` (your Vercel URL)
   - `DATABASE_URL`
   - `SCOPES`
   - `NODE_ENV=production`
4. Deploy

After deployment:
```bash
# Update shopify.app.toml with Vercel URL
# Then sync with Shopify Partners
npm run deploy
```

---

## Tech Stack

- **Framework:** [Remix](https://remix.run) with Vite
- **Shopify Integration:** [@shopify/shopify-app-remix](https://shopify.dev/docs/api/shopify-app-remix)
- **Database:** PostgreSQL with [Prisma ORM](https://www.prisma.io/)
- **UI:** [Shopify Polaris](https://polaris.shopify.com/)
- **Deployment:** [Vercel](https://vercel.com) (serverless)
- **Language:** TypeScript

---

## Known Limitations (v1)

1. **COGS must be manually entered** in Shopify - no CSV bulk upload yet
2. **90-day window only** - can't analyze longer timeframes
3. **GBP currency only** - hardcoded £ symbol (multi-currency in v2)
4. **No refund tracking by reason** - treats all refunds equally
5. **Assumed shipping cost** is store-wide, not per-product
6. **Free shipping threshold is inferred** - not pulled from settings (Shopify doesn't expose this via API)

---

## Support

This is a v1 release. If you find bugs or have feedback:

- **Issues:** [GitHub Issues](https://github.com/adedayo14/decisions/issues)
- **Email:** adedayo@example.com

---

## License

MIT License - Use freely for your Shopify store

---

**Built to catch profit leaks you can't see in Shopify Analytics.**
