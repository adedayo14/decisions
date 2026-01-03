# Decisions - Profit Decision Engine for Shopify

A Shopify app that analyzes your order data to find **specific, actionable profit opportunities** you're missing right now.

No fluff. No generic advice. Just data-backed decisions with the maths to prove it.

## What It Does

Decisions v2 analyzes your last 90 days of orders and looks for three specific profit-killing patterns, with enhanced seasonality analysis and decision history:

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

## COGS Management (v2)

The app supports three sources for cost data with precedence: **Manual > CSV > Shopify**.

**Option 1: Shopify (lowest precedence)**
1. Go to Products → [Product] → Variants
2. Edit each variant
3. Set "Cost per item" (what you pay to acquire/make it)
4. Save

**Option 2: CSV Upload**
1. Navigate to Settings → CSV import/export
2. Upload Shopify product export CSV
3. Required columns: `variant_id` (or `sku`), `cost` (or `cost_gbp`, `unit_cost`, `Cost per item`)
4. App validates: cost > 0, warns if cost > price
5. Upload summary shows matched/skipped/updated counts

**Assumed Shipping Cost:**
- Default: £3.50 per order (configurable in Settings)
- Used when calculating shipping impact
- Noted as "Estimated shipping" in numbers breakdown

Products without COGS are **excluded** from COGS-dependent decisions (Best-Seller Loss, Discount-Refund Hit).

---

## What's New in v2

### ✅ Decision History
- Timeline of past analysis runs with all decisions (not just top 3)
- View historical decisions with status tracking (Open/Done/Ignored)
- Numbers snapshot preserved for each decision
- Load more functionality for older runs

### ✅ Filters & Sorting
- Filter by Status: Open, Done, Ignored
- Filter by Type: Best-seller loss, Free shipping trap, Discount-refund hit
- Filter by Confidence: High, Medium, Low
- Sort by: Impact (default), Confidence, Newest
- Lightweight controls that preserve v1 simplicity

### ✅ Seasonality Analysis
- Weekly baseline calculation (52 weeks if available)
- Seasonal context: "X% worse/better than usual for this time of year"
- Only shown with >= 12 weeks of historical data
- Sales pace framing: "At your current sales pace (N orders in 30 days)"

### ✅ COGS CSV Upload
- Bulk import costs via Shopify product export
- Variant ID and SKU mapping with fallback
- Validation: cost > 0, warnings if cost > price
- Precedence: manual > csv > shopify
- Upload summary with matched/skipped/updated counts

### ✅ Clarified Assumptions
- Refund timing disclaimer: "Refunds are counted when processed"
- Shipping estimation note: "Shipping costs are estimated per order"
- COGS source transparency in Settings
- No long paragraphs, just short inline explanations

### ✅ Multi-Currency Support
- Dynamic currency symbols (USD $, EUR €, GBP £, etc.)
- Fetched from Shopify shop settings on install
- All decision amounts use shop's currency

---

## What It Does NOT Do

Be clear about limitations:

- ❌ No email alerts when new decisions appear
- ❌ No predictive forecasting or AI
- ❌ No automatic price changes
- ❌ No integration with other tools (yet)
- ❌ No dashboard (deliberately avoided feature creep)

Philosophy: **Find profit leaks with transparent maths. Show context. Let the merchant decide.**

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

## Known Limitations (v2)

1. **90-day window only** - can't analyze longer timeframes (future: customizable windows)
2. **No refund tracking by reason** - treats all refunds equally
3. **Assumed shipping cost** is store-wide, not per-product (Shopify limitation)
4. **Free shipping threshold is inferred** - not pulled from settings (Shopify doesn't expose via API)
5. **Seasonality requires 12+ weeks** - earlier data won't show seasonal context
6. **CSV upload requires variant_id or unique SKU** - ambiguous SKUs are skipped

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
