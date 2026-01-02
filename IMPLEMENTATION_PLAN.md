# Decisions v1 - Implementation Plan

**Senior Engineer:** Claude
**Project:** Shopify Embedded Admin App - "Decisions"
**Objective:** Show merchants top 3 profit decisions with genuine "aha" moments

---

## CRITICAL REQUIREMENTS

### Non-Negotiable Rules
✅ Follow spec EXACTLY - no feature creep
✅ Commit early and often with clear messages
✅ Push to GitHub after each logical milestone
✅ No code before Git init + first push
✅ Read-only Shopify scopes only
✅ Never invent advice - data-driven only
✅ Show "Not enough evidence yet" when data insufficient

---

## PHASE 0: REPOSITORY INITIALIZATION
**Status:** MUST DO FIRST (before any code)

### Task 0.1: Initialize Git Repository
```bash
echo "# decisions" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/adedayo14/decisions.git
git push -u origin main
```

**Dependencies:**
- GitHub authentication (SSH or PAT)
- Manual action required from user

**Exit Criteria:**
- ✅ Repository pushed to GitHub
- ✅ Main branch exists
- ✅ Ready for development

**Git Checkpoint:** `first commit` ✅

---

## PHASE 1: PROJECT FOUNDATION
**Duration:** ~2 hours
**Goal:** Clean template from CartUpliftAI, ready for Decisions

### Task 1.1: Copy Template Files from CartUpliftAI
**Files to copy:**
- Root config: `package.json`, `vercel.json`, `tsconfig.json`, `vite.config.ts`
- Shopify: `shopify.app.toml`, `shopify.web.toml`
- Code quality: `.gitignore`, `.prettierrc.json`, `.editorconfig`, `eslint.config.js`
- Types: `env.d.ts`, `.graphqlrc.ts`
- API: `api/index.js`
- Core: `app/db.server.ts`, `app/shopify.server.ts`, `app/entry.server.tsx`
- Utils: All files from `app/utils/` (logger, auth, env, webhookVerification, rateLimiter)
- Types: All files from `app/types/`

**Modifications:**
- `package.json`: Change name to "decisions", clean dependencies
- `shopify.app.toml`: Placeholder values (user will provide real ones)
- Remove all CartUplift branding/references

**Exit Criteria:**
- ✅ Clean template structure in place
- ✅ All CartUplift-specific code removed
- ✅ TypeScript compiles without errors

**Git Checkpoint:** `feat: initial project structure from template`

---

### Task 1.2: Create Decisions-Specific Prisma Schema
**Database: PostgreSQL**

**Models to create:**

```prisma
// Session - Required for Shopify auth (keep from template)
model Session { ... }

// Shop settings
model Shop {
  id                String   @id @default(cuid())
  shop              String   @unique  // mystore.myshopify.com
  assumedShippingCost Float  @default(3.50)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

// COGS storage
model COGS {
  id         String   @id @default(cuid())
  shop       String
  variantId  String   // Shopify variant ID
  costGbp    Float
  source     String   // "shopify" | "manual" | "csv"
  updatedAt  DateTime @updatedAt
  createdAt  DateTime @default(now())

  @@unique([shop, variantId])
  @@index([shop])
}

// Decision tracking
model Decision {
  id          String   @id @default(cuid())
  shop        String
  type        String   // "best_seller_loss" | "free_shipping_trap" | "discount_refund_hit"
  status      String   @default("active") // "active" | "done" | "ignored"

  // Decision payload (JSON)
  headline    String   // "£X / month at risk"
  actionTitle String   // "Stop pushing..."
  reason      String   // One-line explanation
  impact      Float    // £ value
  confidence  String   // "high" | "medium" | "low"

  // Supporting data for "See numbers" modal
  dataJson    Json     // { revenue, cogs, discounts, refunds, shipping, netProfit }

  // Metadata
  generatedAt DateTime @default(now())
  completedAt DateTime?
  ignoredAt   DateTime?

  @@index([shop, status])
  @@index([shop, generatedAt])
}

// Cache for aggregated data (avoid recomputing hourly)
model DataCache {
  id          String   @id @default(cuid())
  shop        String
  cacheKey    String   // e.g., "orders_last_30_days"
  dataJson    Json
  expiresAt   DateTime
  createdAt   DateTime @default(now())

  @@unique([shop, cacheKey])
  @@index([expiresAt])
}
```

**Exit Criteria:**
- ✅ Schema designed for Decisions v1 only
- ✅ No unnecessary models
- ✅ Indexes for performance

**Git Checkpoint:** `feat: add Prisma schema for Decisions v1`

---

### Task 1.3: Configure Shopify App
**User action required:**
1. Create new app in Shopify Partners Dashboard
2. Get `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET`
3. Note `client_id` from app settings

**Update `shopify.app.toml`:**
```toml
client_id = "[USER_PROVIDED]"
name = "Decisions"
application_url = "https://decisions-app.vercel.app"  # Will update after Vercel deploy
embedded = true
handle = "decisions"

[webhooks]
api_version = "2025-10"
  [[webhooks.subscriptions]]
  uri = "/webhooks/app/uninstalled"
  topics = ["app/uninstalled"]

[access_scopes]
scopes = "read_orders,read_products"  # READ-ONLY
use_legacy_install_flow = false

[auth]
redirect_urls = [
  "https://decisions-app.vercel.app/auth/callback",
  "https://decisions-app.vercel.app/auth/shopify/callback"
]
```

**Environment variables:**
```env
SHOPIFY_API_KEY=[USER_PROVIDED]
SHOPIFY_API_SECRET=[USER_PROVIDED]
SHOPIFY_APP_URL=https://decisions-app.vercel.app
SCOPES=read_orders,read_products
DATABASE_URL=postgresql://[USER_PROVIDED]
NODE_ENV=development
```

**Exit Criteria:**
- ✅ Shopify app created in Partners Dashboard
- ✅ Environment variables set locally
- ✅ `shopify.app.toml` configured

**Git Checkpoint:** `chore: configure Shopify app credentials`

---

## PHASE 2: CORE INFRASTRUCTURE
**Duration:** ~3 hours
**Goal:** OAuth, data ingestion, basic routes working

### Task 2.1: Implement OAuth & App Installation
**Files to modify:**
- `app/shopify.server.ts` - afterAuth hook

**afterAuth logic:**
```typescript
afterAuth: async ({ session, admin }) => {
  // 1. Create Shop record with default shipping cost
  await prisma.shop.upsert({
    where: { shop: session.shop },
    update: {},
    create: {
      shop: session.shop,
      assumedShippingCost: 3.50
    }
  });

  // 2. Trigger initial data ingestion (background job)
  await triggerDataIngestion(session.shop);

  logger.info("Decisions app installed", { shop: session.shop });
}
```

**Routes to create:**
- `app/routes/_index.tsx` - Landing page (simple, directs to install)
- `app/routes/app._index.tsx` - Main decisions dashboard (redirect from Shopify)

**Exit Criteria:**
- ✅ OAuth flow works
- ✅ App installs on dev store
- ✅ Shop record created in database
- ✅ Merchant sees placeholder dashboard

**Git Checkpoint:** `feat: implement OAuth and app installation`

---

### Task 2.2: Build Shopify Data Ingestion
**Create:** `app/models/shopifyData.server.ts`

**Functions to implement:**

1. **fetchOrders(shop, admin, days = 90)**
   - GraphQL query for orders (last 90 days)
   - Fields: id, name, createdAt, subtotalPriceSet, totalDiscountsSet, totalShippingPriceSet, refunds
   - Line items: variant.id, title, quantity, originalUnitPriceSet, discountedUnitPriceSet
   - Handle pagination
   - Return normalized data structure

2. **fetchProductCosts(shop, admin)**
   - GraphQL query for products/variants
   - Field: inventoryItem.unitCost
   - Store in COGS table with source="shopify"
   - Skip if unitCost is null/zero

3. **ingestShopifyData(shop)**
   - Fetch orders
   - Fetch product costs
   - Store in DataCache with 24hr expiry
   - Log metrics (orders fetched, variants found, etc.)

**Exit Criteria:**
- ✅ Can fetch last 90 days of orders
- ✅ Can fetch Shopify product costs
- ✅ Data cached for 24 hours
- ✅ Respects rate limits

**Git Checkpoint:** `feat: implement Shopify data ingestion`

---

## PHASE 3: COGS MANAGEMENT
**Duration:** ~2 hours
**Goal:** Manual overrides, CSV upload, precedence logic

### Task 3.1: COGS Retrieval Logic
**Create:** `app/models/cogs.server.ts`

**Function: getCostForVariant(shop, variantId)**
```typescript
// Priority: manual > csv > shopify
const cogs = await prisma.cOGS.findFirst({
  where: { shop, variantId },
  orderBy: [
    { source: 'desc' }  // Alphabetical: manual > csv > shopify
  ]
});
return cogs?.costGbp ?? null;
```

**Exit Criteria:**
- ✅ Precedence logic implemented
- ✅ Returns null if no cost found
- ✅ Never guesses cost from price

**Git Checkpoint:** `feat: implement COGS retrieval with precedence`

---

### Task 3.2: Manual COGS Editor UI
**Create:** `app/routes/app.costs.tsx`

**UI Components:**
- Search bar for product/variant (by title or SKU)
- Table showing: Product | Variant | Current Cost | Source
- Inline edit for cost value
- Save button → updates COGS with source="manual"

**Copy:**
"We use product cost to spot where you're losing money. Estimates are fine."

**Exit Criteria:**
- ✅ Can search and edit costs
- ✅ Manual costs override Shopify/CSV
- ✅ Changes saved to database

**Git Checkpoint:** `feat: add manual COGS editor`

---

### Task 3.3: CSV Upload for COGS
**Create:** `app/routes/app.costs.upload.tsx`

**CSV Format:**
```csv
variant_id,cost_gbp
12345678901234,15.50
23456789012345,22.00
```

**Logic:**
- Parse CSV
- Validate: variant_id is numeric, cost_gbp is positive number
- Match against existing variants
- Insert/update COGS with source="csv"
- Report: X matched, Y skipped

**Exit Criteria:**
- ✅ CSV upload works
- ✅ Validation errors shown clearly
- ✅ Matched/skipped report displayed

**Git Checkpoint:** `feat: add CSV COGS upload`

---

## PHASE 4: PROFIT CALCULATION ENGINE
**Duration:** ~3 hours
**Goal:** Accurate, testable profit calculations

### Task 4.1: Core Profit Calculation
**Create:** `app/models/profitCalculator.server.ts`

**Function: calculateOrderProfits(orders, cogsMap, shippingCost)**

```typescript
interface OrderProfit {
  orderId: string;
  lineItems: {
    variantId: string;
    productTitle: string;
    quantity: number;
    revenue: number;  // After discounts
    cogs: number | null;
    refundAmount: number;
    estimatedShipping: number;
    netProfit: number | null;  // null if COGS unknown
  }[];
  totalRevenue: number;
  totalCOGS: number;
  totalRefunds: number;
  totalShipping: number;
  netProfit: number | null;
}
```

**Logic:**
1. For each line item:
   - Revenue = (originalPrice - discounts) × quantity
   - COGS = getCostForVariant(variantId) × quantity (or null)
   - Refund = allocate refund proportionally or use line-level data
   - Shipping = max(shippingCost - shippingCharged, 0) / lineItemCount
2. Net profit = revenue - COGS - refunds - shipping

**Exit Criteria:**
- ✅ Deterministic calculations
- ✅ Handles missing COGS gracefully (null)
- ✅ Shipping estimated correctly
- ✅ Refunds allocated properly

**Git Checkpoint:** `feat: implement profit calculation engine`

---

### Task 4.2: Aggregate Metrics
**Function: aggregateVariantMetrics(orderProfits, days = 30)**

```typescript
interface VariantMetrics {
  variantId: string;
  productTitle: string;
  unitsSold: number;
  orderCount: number;
  revenue: number;
  cogs: number | null;
  discounts: number;
  refunds: number;
  shipping: number;
  netProfit: number | null;
}
```

**Group by:**
- Last 30 days by variant
- Weekly breakdown (for confidence scoring)

**Exit Criteria:**
- ✅ Per-variant aggregates correct
- ✅ Weekly breakdowns for trend analysis
- ✅ Order subtotal bands for free shipping

**Git Checkpoint:** `feat: add variant metrics aggregation`

---

## PHASE 5: DECISION RULES IMPLEMENTATION
**Duration:** ~4 hours
**Goal:** All 3 decision types working per spec

### Task 5.1: Decision Type A - Best-Seller Loss
**Create:** `app/models/decisions/bestSellerLoss.server.ts`

**Function: generateBestSellerLossDecisions(variantMetrics)**

```typescript
// Eligibility
for (variant of variantMetrics) {
  if (variant.unitsSold < 20 && variant.orderCount < 30) continue;
  if (variant.cogs === null) continue;
  if (variant.netProfit > -50) continue;

  // Confidence
  const weeklyProfits = getWeeklyBreakdown(variant);
  const lossWeeks = weeklyProfits.filter(w => w.netProfit < 0).length;

  let confidence;
  if (variant.orderCount >= 50 && lossWeeks >= 3) {
    confidence = "high";
  } else if (variant.orderCount >= 30) {
    confidence = "medium";
  } else {
    continue; // Not enough confidence
  }

  yield {
    type: "best_seller_loss",
    headline: `£${Math.abs(variant.netProfit)} / month at risk`,
    actionTitle: `Stop pushing ${variant.productTitle} until margin is fixed`,
    reason: `${variant.productTitle} made £${variant.revenue} but lost £${Math.abs(variant.netProfit)} after refunds (£${variant.refunds}) and shipping (£${variant.shipping}).`,
    impact: Math.abs(variant.netProfit),
    confidence,
    dataJson: {
      revenue: variant.revenue,
      cogs: variant.cogs,
      discounts: variant.discounts,
      refunds: variant.refunds,
      shipping: variant.shipping,
      netProfit: variant.netProfit
    }
  };
}
```

**Exit Criteria:**
- ✅ Eligibility rules exact per spec
- ✅ Confidence scoring works
- ✅ Copy matches spec format

**Git Checkpoint:** `feat: implement Decision Type A (best-seller loss)`

---

### Task 5.2: Decision Type B - Free-Shipping Trap
**Create:** `app/models/decisions/freeShippingTrap.server.ts`

**Function: generateFreeShippingTrapDecision(orders)**

```typescript
// 1. Identify free shipping orders
const freeShippingOrders = orders.filter(o => o.shippingCharged === 0);
if (freeShippingOrders.length / orders.length < 0.20) return null;

// 2. Infer threshold (modal or 90th percentile)
const subtotals = freeShippingOrders.map(o => o.subtotal).sort();
const threshold = percentile(subtotals, 90);

// 3. Find trap band (threshold - £5 to threshold)
const trapOrders = orders.filter(o =>
  o.subtotal >= threshold - 5 &&
  o.subtotal <= threshold &&
  o.shippingCharged === 0
);

if (trapOrders.length < 30) return null;

// 4. Calculate trap band profit
const trapProfit = calculateOrdersProfits(trapOrders).totalNetProfit;
if (trapProfit >= 0) return null;

// 5. Confidence
const pct = (trapOrders.length / orders.length * 100).toFixed(0);
let confidence;
if (orders.length >= 80 && trapOrders.length / orders.length >= 0.25) {
  confidence = "high";
} else if (trapOrders.length >= 30) {
  confidence = "medium";
} else {
  return null;
}

return {
  type: "free_shipping_trap",
  headline: `£${Math.abs(trapProfit)} / month at risk`,
  actionTitle: "Adjust free shipping threshold or exclude low-margin items",
  reason: `${pct}% of orders sit just below your free-shipping threshold (~£${threshold}), costing ~£${Math.abs(trapProfit)} last month.`,
  impact: Math.abs(trapProfit),
  confidence,
  dataJson: { /* trap band metrics */ }
};
```

**Exit Criteria:**
- ✅ Threshold inference accurate
- ✅ Trap band detection correct
- ✅ Only shows when genuinely problematic

**Git Checkpoint:** `feat: implement Decision Type B (free-shipping trap)`

---

### Task 5.3: Decision Type C - Discount-Refund Double Hit
**Create:** `app/models/decisions/discountRefundHit.server.ts`

**Function: generateDiscountRefundDecision(orders)**

```typescript
// 1. Split orders
const discountedOrders = orders.filter(o => o.totalDiscounts > 0);
const fullPriceOrders = orders.filter(o => o.totalDiscounts === 0);

if (discountedOrders.length < 50 || fullPriceOrders.length < 50) return null;

// 2. Calculate refund rates
const discountRefundRate = (discountedOrders.filter(o => o.refunds > 0).length / discountedOrders.length) * 100;
const fullRefundRate = (fullPriceOrders.filter(o => o.refunds > 0).length / fullPriceOrders.length) * 100;

// 3. Eligibility
const rateMultiplier = discountRefundRate / fullRefundRate;
const absoluteDiff = discountRefundRate - fullRefundRate;

if (rateMultiplier < 1.5 || absoluteDiff < 5) return null;

// 4. Calculate impact
const avgOrderValue = discountedOrders.reduce((sum, o) => sum + o.revenue, 0) / discountedOrders.length;
const refundFraction = discountRefundRate / 100;
const impact = absoluteDiff * discountedOrders.length * avgOrderValue * refundFraction / 100;

// 5. Confidence
let confidence;
if (discountedOrders.length >= 150 && fullPriceOrders.length >= 150) {
  confidence = "high";
} else if (discountedOrders.length >= 50 && fullPriceOrders.length >= 50) {
  confidence = "medium";
} else {
  return null;
}

return {
  type: "discount_refund_hit",
  headline: `£${impact.toFixed(0)} / month opportunity`,
  actionTitle: "Stop discounting until refund driver is fixed",
  reason: `Discounted orders refund at ${discountRefundRate.toFixed(1)}% vs ${fullRefundRate.toFixed(1)}% full price, driving ~£${impact.toFixed(0)} in losses.`,
  impact,
  confidence,
  dataJson: { /* discount vs full price metrics */ }
};
```

**Exit Criteria:**
- ✅ Refund rate calculation accurate
- ✅ Impact formula matches spec
- ✅ Only shows with sufficient data

**Git Checkpoint:** `feat: implement Decision Type C (discount-refund hit)`

---

### Task 5.4: Decision Ranking & Selection
**Create:** `app/models/decisionEngine.server.ts`

**Function: generateTopDecisions(shop)**

```typescript
async function generateTopDecisions(shop: string) {
  // 1. Get cached data or fetch fresh
  const data = await getOrFetchData(shop);

  // 2. Generate all eligible decisions
  const candidates = [
    ...generateBestSellerLossDecisions(data.variantMetrics),
    generateFreeShippingTrapDecision(data.orders),
    generateDiscountRefundDecision(data.orders)
  ].filter(Boolean);

  // 3. Rank by impact (descending)
  candidates.sort((a, b) => b.impact - a.impact);

  // 4. Take top 3
  const topDecisions = candidates.slice(0, 3);

  // 5. Save to database
  for (const decision of topDecisions) {
    await prisma.decision.create({
      data: {
        shop,
        ...decision,
        status: "active"
      }
    });
  }

  return topDecisions;
}
```

**Exit Criteria:**
- ✅ All decision types attempted
- ✅ Ranked by impact
- ✅ Top 3 saved to database
- ✅ Returns empty array if no decisions qualify

**Git Checkpoint:** `feat: implement decision ranking and selection`

---

## PHASE 6: USER INTERFACE
**Duration:** ~3 hours
**Goal:** Clean, spec-compliant UI with Polaris

### Task 6.1: Main Dashboard
**Create:** `app/routes/app._index.tsx`

**Layout:**
```tsx
<Page title="Top profit decisions this week">
  {decisions.length === 0 ? (
    <EmptyState>
      <p>Not enough evidence yet. Check back after more orders.</p>
    </EmptyState>
  ) : (
    <Layout>
      {decisions.map(decision => (
        <DecisionCard
          decision={decision}
          onMarkDone={handleMarkDone}
          onIgnore={handleIgnore}
          onSeeNumbers={handleSeeNumbers}
        />
      ))}
    </Layout>
  )}

  <Collapsible title="Completed decisions">
    {/* List completed decisions */}
  </Collapsible>

  <Collapsible title="Ignored decisions">
    {/* List ignored decisions */}
  </Collapsible>
</Page>
```

**DecisionCard Component:**
```tsx
<Card>
  <Text variant="headingMd" as="h2">{decision.headline}</Text>
  <Badge status={confidenceColor}>{decision.confidence}</Badge>

  <Text variant="headingSm" as="h3">{decision.actionTitle}</Text>
  <Text>{decision.reason}</Text>

  <ButtonGroup>
    <Button onClick={onMarkDone}>Mark as done</Button>
    <Button onClick={onIgnore}>Ignore</Button>
    <Button onClick={onSeeNumbers}>See numbers</Button>
  </ButtonGroup>
</Card>
```

**Exit Criteria:**
- ✅ Matches spec layout exactly
- ✅ Shows up to 3 decisions
- ✅ Empty state for insufficient data
- ✅ Completed/ignored sections collapsible

**Git Checkpoint:** `feat: build main dashboard UI`

---

### Task 6.2: "See Numbers" Modal
**Component: NumbersModal**

```tsx
<Modal open={isOpen} onClose={onClose} title="Supporting data">
  <Table>
    <thead>
      <tr>
        <th>Metric</th>
        <th>Last 30 days</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>Revenue</td><td>£{data.revenue}</td></tr>
      <tr><td>COGS</td><td>£{data.cogs}</td></tr>
      <tr><td>Discounts</td><td>£{data.discounts}</td></tr>
      <tr><td>Refunds</td><td>£{data.refunds}</td></tr>
      <tr><td>Estimated shipping</td><td>£{data.shipping}</td></tr>
      <tr><td><strong>Net profit</strong></td><td><strong>£{data.netProfit}</strong></td></tr>
    </tbody>
  </Table>
</Modal>
```

**Exit Criteria:**
- ✅ Simple table, no charts
- ✅ Shows data from decision.dataJson

**Git Checkpoint:** `feat: add see numbers modal`

---

### Task 6.3: COGS Management UI
**Already implemented in Phase 3**
- Manual editor: `app/routes/app.costs.tsx`
- CSV upload: `app/routes/app.costs.upload.tsx`

Add navigation link in app layout.

**Exit Criteria:**
- ✅ Accessible from main nav
- ✅ Copy matches spec

**Git Checkpoint:** `feat: integrate COGS UI into navigation`

---

## PHASE 7: BACKGROUND JOBS & AUTOMATION
**Duration:** ~2 hours
**Goal:** Daily recomputation, caching, rate limits

### Task 7.1: Background Job Infrastructure
**Create:** `app/jobs/recomputeDecisions.server.ts`

```typescript
export async function recomputeDecisions(shop: string) {
  logger.info("Recomputing decisions", { shop });

  // 1. Fetch fresh data from Shopify
  await ingestShopifyData(shop);

  // 2. Clear old active decisions
  await prisma.decision.deleteMany({
    where: { shop, status: "active" }
  });

  // 3. Generate new decisions
  const decisions = await generateTopDecisions(shop);

  logger.info("Decisions recomputed", { shop, count: decisions.length });
}
```

**Exit Criteria:**
- ✅ Can trigger manually
- ✅ Deletes old active decisions before creating new ones
- ✅ Logs execution

**Git Checkpoint:** `feat: add decision recomputation job`

---

### Task 7.2: Cron Jobs via Vercel
**Update `vercel.json`:**

```json
{
  "buildCommand": "npm run vercel-build",
  "crons": [
    {
      "path": "/api/cron/daily-decisions",
      "schedule": "0 2 * * *"
    }
  ],
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/index"
    }
  ]
}
```

**Create:** `app/routes/api.cron.daily-decisions.tsx`

```typescript
export async function loader({ request }: LoaderFunctionArgs) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all shops
  const shops = await prisma.shop.findMany();

  // Recompute for each shop
  for (const shop of shops) {
    await recomputeDecisions(shop.shop);
  }

  return json({ success: true, count: shops.length });
}
```

**Exit Criteria:**
- ✅ Runs daily at 2am
- ✅ Recomputes all shops
- ✅ Protected by secret

**Git Checkpoint:** `feat: add daily cron job for decision recomputation`

---

### Task 7.3: On-Demand Refresh
**Add to dashboard:**

```tsx
<Button onClick={handleRefresh}>Refresh decisions now</Button>
```

**Action:**
```typescript
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  await recomputeDecisions(session.shop);
  return json({ success: true });
}
```

**Exit Criteria:**
- ✅ Merchants can manually trigger refresh
- ✅ Shows loading state

**Git Checkpoint:** `feat: add manual decision refresh`

---

## PHASE 8: TESTING & VALIDATION
**Duration:** ~3 hours
**Goal:** Unit tests, self-check script, validation

### Task 8.1: Unit Tests
**Create:** `app/models/__tests__/profitCalculator.test.ts`

**Test cases:**
- Net profit calculation with known inputs
- COGS null handling
- Refund allocation
- Shipping cost estimation

**Create:** `app/models/__tests__/decisions.test.ts`

**Test cases:**
- Best-seller loss eligibility
- Free shipping threshold inference
- Discount vs non-discount refund comparison
- Confidence scoring

**Exit Criteria:**
- ✅ All critical calculations tested
- ✅ Tests pass
- ✅ No NaN or negative where invalid

**Git Checkpoint:** `test: add unit tests for calculations and decisions`

---

### Task 8.2: Self-Check Script
**Create:** `scripts/self-check.ts`

```typescript
import { generateTopDecisions } from "../app/models/decisionEngine.server";

async function selfCheck() {
  console.log("Running self-check...");

  const testShop = process.env.TEST_SHOP;
  if (!testShop) {
    console.error("TEST_SHOP env var required");
    process.exit(1);
  }

  // Generate decisions
  const decisions = await generateTopDecisions(testShop);

  // Assertions
  for (const decision of decisions) {
    assert(!isNaN(decision.impact), "Impact must not be NaN");
    assert(decision.impact > 0, "Impact must be positive");
    assert(decision.confidence in ["high", "medium"], "Invalid confidence");
    assert(decision.headline.includes("£"), "Headline must include £");
  }

  console.log(`✅ Self-check passed. ${decisions.length} decisions generated.`);
}

selfCheck();
```

**Add to package.json:**
```json
"scripts": {
  "self-check": "tsx scripts/self-check.ts"
}
```

**Exit Criteria:**
- ✅ Script runs without errors
- ✅ Validates decision quality
- ✅ Logs results

**Git Checkpoint:** `test: add self-check validation script`

---

## PHASE 9: DOCUMENTATION & DEPLOYMENT
**Duration:** ~1 hour
**Goal:** Complete README, deploy to Vercel, test on dev store

### Task 9.1: Write README.md
**Create comprehensive README:**

```markdown
# Decisions v1

Show Shopify merchants the top 3 profit decisions they should take right now.

## What Decisions v1 does

Decisions analyzes your last 90 days of Shopify orders and identifies up to 3 high-impact profit opportunities:

- **Best-seller loss:** Popular products losing money after refunds/shipping
- **Free-shipping trap:** Orders clustering just below free-shipping threshold
- **Discount-refund double hit:** Discounted orders refunding at much higher rates

Each decision includes a clear £ impact, specific action, and confidence level.

## How to run locally

1. Clone repository:
   ```bash
   git clone https://github.com/adedayo14/decisions.git
   cd decisions
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Fill in Shopify credentials
   ```

4. Set up database:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. Run development server:
   ```bash
   npm run dev
   ```

## Required environment variables

```
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=
SCOPES=read_orders,read_products
DATABASE_URL=postgresql://...
CRON_SECRET=  # For Vercel cron jobs
```

## How to install on Shopify dev store

1. Create app in Shopify Partners Dashboard
2. Deploy to Vercel
3. Update `shopify.app.toml` with production URL
4. Run `npm run deploy` to sync Shopify config
5. Install on dev store via Partners dashboard

## Known limitations

- Shipping costs are estimates (assumed £3.50/order, editable)
- No attribution to marketing channels (ads, etc.)
- COGS must be manually entered or uploaded if not in Shopify
- Requires 30+ days of order history for meaningful insights
- Does not account for inventory costs or opportunity costs

## Tech stack

- Remix + Vite
- Shopify App Remix
- Prisma + PostgreSQL
- Vercel (serverless deployment)
- Shopify Polaris (UI)

## License

Private - internal use only
```

**Exit Criteria:**
- ✅ README complete with all required sections
- ✅ Clear setup instructions
- ✅ Limitations documented

**Git Checkpoint:** `docs: add comprehensive README`

---

### Task 9.2: Deploy to Vercel
**User actions required:**

1. Create Vercel project
2. Connect GitHub repo
3. Add environment variables in Vercel dashboard
4. Deploy

**Vercel auto-deploy on push to main**

**Exit Criteria:**
- ✅ App deployed to Vercel
- ✅ Production URL available
- ✅ Environment variables configured

**Manual step - pause for user**

---

### Task 9.3: Update Shopify App Configuration
**User actions:**

1. Update `shopify.app.toml` with production URL
2. Run `npm run deploy` to sync config with Shopify

**Exit Criteria:**
- ✅ Shopify app points to production URL
- ✅ OAuth callbacks configured

**Manual step - pause for user**

---

### Task 9.4: Final Testing on Dev Store
**Testing checklist:**

1. Install app on Shopify dev store
2. Verify OAuth works
3. Load dashboard - confirm decisions appear OR "Not enough evidence yet"
4. Test manual COGS entry
5. Test CSV upload
6. Test "Mark as done" / "Ignore"
7. Test "See numbers" modal
8. Trigger manual refresh
9. Check copy is UK English, short, direct
10. Verify no errors in logs

**Exit Criteria:**
- ✅ At least one "aha" decision appears with sufficient data
- ✅ "Not enough evidence yet" shows when appropriate
- ✅ All UI interactions work
- ✅ No console errors

**Git Checkpoint:** `chore: final testing complete`

---

## PHASE 10: FINAL DELIVERY
**Duration:** 30 min
**Goal:** Push final state, confirm all requirements met

### Final Checklist

**Spec Compliance:**
- [ ] Read-only scopes only (read_orders, read_products)
- [ ] Single screen: "Top profit decisions this week"
- [ ] Up to 3 decision cards
- [ ] Each card has: headline, action, reason, confidence, buttons
- [ ] "See numbers" modal with minimal table
- [ ] Completed/ignored sections (collapsed)
- [ ] No charts, dashboards, chat, or extra settings
- [ ] COGS: Shopify > CSV > manual precedence
- [ ] Shipping: £3.50 default, editable
- [ ] All 3 decision types implemented per spec
- [ ] Eligibility rules exact
- [ ] Confidence scoring exact
- [ ] Impact calculations correct
- [ ] "Not enough evidence yet" shows when appropriate
- [ ] Copy is UK English, short, direct

**Git Compliance:**
- [ ] Repository initialized before code
- [ ] Commits after each milestone
- [ ] All code pushed to GitHub
- [ ] Clear commit messages
- [ ] No large uncommitted changes

**Testing:**
- [ ] Unit tests for calculations pass
- [ ] Self-check script passes
- [ ] Tested on dev store
- [ ] At least one "aha" decision verified

**Documentation:**
- [ ] README.md complete
- [ ] Known limitations documented
- [ ] Setup instructions clear

**Exit Criteria:**
- ✅ All checklist items complete
- ✅ App delivers genuine "aha" moments
- ✅ Ready for merchant use

**Git Checkpoint:** `chore: v1 complete and tested`

---

## COMMIT STRATEGY

**Commit after:**
1. Initial template setup
2. Prisma schema complete
3. OAuth working
4. Data ingestion complete
5. COGS management complete
6. Profit calculations implemented
7. Each decision type (3 commits)
8. Decision ranking/selection
9. Main UI complete
10. COGS UI complete
11. Background jobs complete
12. Unit tests complete
13. Self-check script complete
14. README complete
15. Final testing

**Minimum 15 commits with clear messages**

---

## DEPENDENCIES & BLOCKERS

**User Actions Required:**
1. Confirm GitHub authentication (SSH or PAT)
2. Create Shopify app in Partners Dashboard
3. Provide SHOPIFY_API_KEY, SHOPIFY_API_SECRET, client_id
4. Set up PostgreSQL database (Vercel Postgres or Neon)
5. Create Vercel project
6. Add environment variables to Vercel
7. Create development store for testing

**External Dependencies:**
- GitHub repository access
- Shopify Partners account
- Vercel account
- PostgreSQL database

---

## SUCCESS CRITERIA

**v1 is complete when:**
✅ Merchant installs app on dev store
✅ Sees exactly 3 decisions (or "Not enough evidence yet")
✅ Each decision has clear £ impact and specific action
✅ Merchant says: "This caught something I hadn't noticed"
✅ All code pushed to GitHub with clear commits
✅ README documents limitations and setup
✅ Unit tests pass
✅ Self-check script validates decision quality

---

## TIMELINE ESTIMATE

- Phase 0: 15 min (Git setup)
- Phase 1: 2 hours (Foundation)
- Phase 2: 3 hours (Infrastructure)
- Phase 3: 2 hours (COGS)
- Phase 4: 3 hours (Calculations)
- Phase 5: 4 hours (Decision rules)
- Phase 6: 3 hours (UI)
- Phase 7: 2 hours (Jobs)
- Phase 8: 3 hours (Testing)
- Phase 9: 1 hour (Docs + Deploy)
- Phase 10: 30 min (Final check)

**Total: ~24 hours of focused development**

---

## READY TO START

I'm ready to begin implementation. Please confirm:

1. **GitHub authentication is ready** (SSH or PAT available)
2. **You have created the Shopify app** in Partners Dashboard (or ready to do so)
3. **Database URL is available** (or I should help set up Vercel Postgres)

Once confirmed, I will:
1. Initialize Git repository
2. Push to GitHub
3. Begin Phase 1 (template setup)

**Awaiting your go-ahead!** 🚀
