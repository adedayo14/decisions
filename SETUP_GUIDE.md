# Decisions - Shopify App Setup Guide

A Shopify embedded admin app that analyzes order data and generates profit-improvement recommendations.

## 🏗️ Architecture Overview

- **Frontend**: Remix v2.16.7 + Shopify Polaris UI
- **Backend**: Remix loaders/actions with Shopify Admin API
- **Database**: PostgreSQL (Neon) via Prisma ORM
- **Deployment**: Vercel Serverless
- **Authentication**: Shopify OAuth with new embedded auth strategy

---

## 📋 Prerequisites

- **Shopify Partner Account**: https://partners.shopify.com
- **Development Store**: Create a test store in Partners
- **Node.js**: v18+ (project uses v19.4.0)
- **Package Manager**: yarn or npm
- **Neon PostgreSQL**: Free account at https://neon.tech
- **Vercel Account**: For deployment

---

## 🚀 Setup Steps

### Step 1: Clone and Install

```bash
git clone <your-repo-url>
cd decisions
yarn install
```

### Step 2: Create Shopify App

1. Go to https://partners.shopify.com
2. Navigate to **Apps** → **Create app** → **Create app manually**
3. Fill in:
   - **App name**: Decisions
   - **App URL**: `https://your-app.vercel.app` (temporary, update after deployment)
   - **Allowed redirection URL(s)**:
     - `https://your-app.vercel.app/auth/callback`
     - `https://your-app.vercel.app/auth/shopify/callback`
     - `https://your-app.vercel.app/api/auth/callback`

4. After creation, copy:
   - **Client ID** (also called API key)
   - **Client Secret** (click to reveal)

### Step 3: Update shopify.app.toml

Edit `shopify.app.toml`:

```toml
client_id = "YOUR_CLIENT_ID_HERE"
name = "Decisions"
application_url = "https://your-app.vercel.app"
embedded = true

[access_scopes]
scopes = "read_orders,read_products"
use_legacy_install_flow = false

[auth]
redirect_urls = [
  "https://your-app.vercel.app/auth/callback",
  "https://your-app.vercel.app/auth/shopify/callback",
  "https://your-app.vercel.app/api/auth/callback"
]
```

### Step 4: Create Neon PostgreSQL Database

1. Go to https://neon.tech and create account
2. Create new project: **decisions-db**
3. Copy connection string (format):
   ```
   postgresql://user:password@host.neon.tech/dbname?sslmode=require
   ```

### Step 5: Setup Environment Variables

Create `.env` file:

```bash
# Shopify App Credentials
SHOPIFY_API_KEY="YOUR_CLIENT_ID"
SHOPIFY_API_SECRET="YOUR_CLIENT_SECRET"

# Database
DATABASE_URL="postgresql://user:password@host.neon.tech/dbname?sslmode=require"

# App URLs
SHOPIFY_APP_URL="https://your-app.vercel.app"

# Optional - only needed for /migrate endpoint protection
MIGRATION_SECRET="generate-random-string-here"
```

**Important Notes**:
- `SESSION_SECRET` is NOT required (we use Prisma session storage)
- For local development, use `http://localhost:3000` for SHOPIFY_APP_URL
- Never commit `.env` to git

### Step 6: Initialize Database

Run Prisma migrations locally:

```bash
npx prisma generate
npx prisma db push
```

This creates 5 tables:
- `Session` - Shopify session storage
- `Shop` - Store settings (shipping thresholds, etc.)
- `COGS` - Product variant costs
- `Decision` - Generated recommendations
- `DataCache` - 24-hour cache for Shopify data

### Step 7: Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts:
# - Link to existing project? No
# - Project name: decisions
# - Which directory? ./
# - Override settings? No

# Production deployment
vercel --prod
```

### Step 8: Configure Vercel Environment Variables

1. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Add all variables from `.env`:
   - `SHOPIFY_API_KEY`
   - `SHOPIFY_API_SECRET`
   - `DATABASE_URL`
   - `SHOPIFY_APP_URL` (use your Vercel URL)
   - `MIGRATION_SECRET` (optional)

3. Redeploy:
```bash
vercel --prod
```

### Step 9: Deploy App Configuration to Shopify

After Vercel deployment, sync your configuration:

```bash
# Update shopify.app.toml with your Vercel URL first
npx shopify app deploy --force --no-release
npx shopify app release --version=<version-name> --force
```

### Step 10: Install App to Development Store

```bash
npx shopify app dev
```

**During installation, you should see ONLY**:
- ✅ **View orders** - All order details for the last 60 days
- ✅ **View products** - Products or collections

**If you see extra permissions** like "View personal data":
1. Uninstall app from your store
2. Redeploy config: `npx shopify app deploy --force`
3. Reinstall the app

---

## 🔧 Template Architecture Details

### Critical Files (Already Configured)

#### Authentication Routes ✅
- `app/routes/auth.tsx` - Main OAuth callback handler
- `app/routes/auth.session-token.tsx` - Embedded app session token handler

**Why important**: Without these, you get 410/500 errors on app load.

#### Route Configuration ✅
- `app/routes.ts` - Manual route registration for Remix v3

**Why important**: With `v3_routeConfig: true`, all routes MUST be registered here or they return 404.

```typescript
export default [
  index("routes/_index.tsx"),

  // Auth routes (required for Shopify OAuth)
  route("auth", "routes/auth.tsx"),
  route("auth/session-token", "routes/auth.session-token.tsx"),

  // App routes (authenticated)
  layout("routes/app.tsx", [
    route("app", "routes/app._index.tsx"),
    route("app/decision", "routes/app.decision.tsx"),
    route("app/refresh", "routes/app.refresh.tsx"),
  ]),

  // ... other routes
] satisfies RouteConfig;
```

#### Frontend Pattern ✅
- `app/routes/app._index.tsx` uses `useFetcher()` NOT `useSubmit()`

**Why important**: New embedded auth strategy requires `useFetcher()` for proper session token handling.

```typescript
// ✅ CORRECT - Uses useFetcher
const refreshFetcher = useFetcher();
const handleRefresh = () => {
  refreshFetcher.submit({}, { method: "post", action: "/app/refresh" });
};

// ❌ WRONG - Don't use useSubmit
const submit = useSubmit();
submit({}, { method: "post", action: "/app/refresh" });
```

#### Graceful Scope Handling ✅
- `app/services/data-ingestion.server.ts` has try/catch for missing scopes

**Why important**: If `read_products` scope is missing, app continues with manual COGS instead of crashing.

```typescript
try {
  variantCosts = await getVariantCostData(shop, admin, forceRefresh);
  const cogsResult = await syncCOGSFromShopify(shop, variantCosts);
} catch (error) {
  console.warn("[data-ingestion] Could not fetch variant costs - missing read_products scope?", error);
  // Continue without variant cost data
}
```

#### Environment Validation ✅
- `app/utils/env.server.ts` validates required environment variables at startup

**Why important**: Fail-fast with clear error messages instead of runtime failures.

---

## 🐛 Common Issues and Solutions

### Issue: "Application Error" on app load
**Cause**: Missing auth routes or routes not registered in routes.ts
**Fix**: Verify these files exist:
- `app/routes/auth.tsx`
- `app/routes/auth.session-token.tsx`
- Both registered in `app/routes.ts`

### Issue: 401 "shop: null" error
**Cause**: Using `useSubmit()` instead of `useFetcher()`
**Fix**: Change all form submissions to use `useFetcher()` pattern

### Issue: "Access denied for productVariants field"
**Cause**: App doesn't have `read_products` scope
**Fix**:
1. Verify `shopify.app.toml` has `scopes = "read_orders,read_products"`
2. Deploy: `npx shopify app deploy --force`
3. Uninstall and reinstall app on dev store

### Issue: Database migration fails in Vercel
**Cause**: Serverless environment restrictions
**Fix**: Run `npx prisma db push` locally against Neon database

### Issue: Wrong scopes on install screen
**Cause**: Existing installation preserves old scopes
**Fix**:
1. Uninstall app from store
2. Deploy config: `npx shopify app deploy --force`
3. Reinstall app

### Issue: Environment variables not working
**Cause**: Not set in Vercel or not redeployed
**Fix**:
1. Set all variables in Vercel Dashboard
2. Redeploy: `vercel --prod`

---

## 📊 Decision Rules Logic

The app generates 3 types of profit recommendations:

### 1. Best-Seller Loss Detection
- Finds products with high sales but negative profit margin
- Formula: `profit_margin = ((price - cogs - shipping) / price) * 100`
- Triggered when: margin < 20% and sales > 10 units

### 2. Free-Shipping Trap
- Identifies orders clustering below free shipping threshold
- Analyzes order value distribution in last 90 days
- Triggered when: >15% of orders within $10 below threshold

### 3. Discount-Refund Double Hit
- Finds discounted products with high refund rates
- Tracks items sold with discounts AND later refunded
- Triggered when: refund rate > 25% and avg discount > 10%

---

## 🧪 Testing the App

After installation:

1. Click **"Refresh Decisions"** to:
   - Fetch orders from last 90 days
   - Fetch product variant costs
   - Generate profit recommendations

2. You should see decisions displayed with:
   - Headline (e.g., "Best-seller losing money")
   - Action title (e.g., "Raise price by $X")
   - Reason (detailed explanation)
   - Confidence level (high/medium/low)

3. Test actions:
   - **Mark as Done** - Archives the decision
   - **Ignore** - Hides the decision

---

## 🔍 Monitoring and Debugging

### Vercel Logs
```bash
vercel logs <deployment-url>
```

### Check App Status
```bash
npx shopify app info
npx shopify app versions list
```

### Database Access
```bash
npx prisma studio
```

### Clear Cache
Access the app and click "Refresh Decisions" to force fresh data fetch

---

## 🚀 Development Workflow

### Local Development
```bash
# Start Remix dev server
npm run dev

# In another terminal, tunnel to Shopify
npx shopify app dev
```

### Testing Changes
```bash
npm run build       # Build and check for errors
npm run typecheck   # Type checking
npm run lint        # Linting
```

### Deploying Updates
```bash
# Deploy to Vercel
vercel --prod

# If you changed shopify.app.toml
npx shopify app deploy --force --no-release
npx shopify app release --version=<version> --force
```

---

## 🔒 Security Considerations

1. **Environment Variables**: Never commit `.env` file
2. **Session Storage**: Uses Prisma (database) not cookies
3. **GDPR Webhooks**: Implemented for compliance
4. **Scope Minimization**: Only requests `read_orders,read_products`
5. **Migration Endpoint**: Protected by `MIGRATION_SECRET`

---

## 📚 API Rate Limits

- **Shopify Admin API**: 40 requests/second (GraphQL)
- **Neon PostgreSQL**: 10 concurrent connections (free tier)
- **Vercel Functions**: 10-second timeout (hobby), 60-second (pro)

The app uses:
- Cursor-based pagination for large datasets
- 24-hour cache to minimize API calls
- Graceful fallbacks for rate limit errors

---

## 📖 Further Reading

- **Shopify CLI**: https://shopify.dev/docs/apps/tools/cli
- **Remix**: https://remix.run/docs
- **Prisma**: https://www.prisma.io/docs
- **Vercel**: https://vercel.com/docs
- **Shopify App Bridge**: https://shopify.dev/docs/api/app-bridge

---

## ✅ Setup Checklist

- [ ] Cloned repository and ran `yarn install`
- [ ] Created Shopify app in Partners Dashboard
- [ ] Updated `shopify.app.toml` with client_id
- [ ] Created Neon database project
- [ ] Created `.env` file with all credentials
- [ ] Ran `npx prisma db push`
- [ ] Deployed to Vercel
- [ ] Set environment variables in Vercel
- [ ] Deployed app config to Shopify
- [ ] Installed app on dev store
- [ ] Verified scopes are correct
- [ ] Tested "Refresh Decisions" button
- [ ] Saw profit recommendations generated

---

## 🎯 Next Steps

After successful setup:

1. **Customize decision rules** in `app/services/decision-rules.server.ts`
2. **Adjust thresholds** for your use case
3. **Add more decision types** following existing patterns
4. **Implement action tracking** when merchants mark decisions as "Done"
5. **Add analytics** to track decision impact on profit

---

## 💬 Support

Having issues? Check:
1. Vercel logs for deployment errors
2. Browser console for frontend errors
3. Database connection with `npx prisma studio`
4. App configuration with `npx shopify app info`

**Common fixes solve 90% of issues**:
- Redeploy after changing environment variables
- Uninstall/reinstall after changing scopes
- Run `npx prisma db push` if database schema changed
