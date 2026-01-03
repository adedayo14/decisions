# Decisions - Setup Guide

## ✅ What's Done So Far

1. ✅ Shopify app starter template created
2. ✅ Decisions repository initialized
3. ✅ Prisma schema extended with Decisions models
4. ✅ Dependencies installed (`npm install` completed)
5. ✅ Shopify app configured (name, scopes, webhooks)

**Latest commits:**
- `fed77cb` - Configure Decisions app settings
- `6169da1` - Extend Prisma schema for Decisions v1
- `b1d7f1d` - Initial decisions app from starter template

---

## 🔧 What You Need To Do Now

### Step 1: Create Shopify App (5 minutes)

1. Go to https://partners.shopify.com
2. Click **Apps** → **Create app** → **Create app manually**
3. Fill in:
   - **App name:** Decisions
   - **App URL:** https://decisions-app.vercel.app (we'll update after Vercel deploy)

4. After creating, **copy these values:**
   - **Client ID** (also called API key)
   - **API secret key** (click to reveal)

5. **Update `/Users/dayo/decisions/shopify.app.toml`:**
   ```toml
   client_id = "paste_your_client_id_here"
   ```

---

### Step 2: Set Up Neon Database (5 minutes)

1. Go to https://neon.tech
2. Sign in (or create account)
3. Click **Create Project**
4. Fill in:
   - **Name:** decisions
   - **Region:** Choose closest to you
5. Click **Create Project**
6. **Copy the connection string** (starts with `postgresql://`)

---

### Step 3: Create `.env` File

Create `/Users/dayo/decisions/.env` with these values:

```bash
# Shopify App Credentials (from Step 1)
SHOPIFY_API_KEY=your_client_id_here
SHOPIFY_API_SECRET=your_api_secret_here
SHOPIFY_APP_URL=http://localhost:3000  # For local dev

# Scopes (read-only)
SCOPES=read_orders,read_products

# Database (from Step 2)
DATABASE_URL=postgresql://your_neon_connection_string

# Environment
NODE_ENV=development
```

---

### Step 4: Set Up Database

Run these commands:

```bash
# Generate Prisma client (if not already done)
npx prisma generate

# Push schema to Neon database
npx prisma db push
```

Expected output:
```
✔ Your database is now in sync with your Prisma schema
✔ Generated Prisma Client
```

---

### Step 5: Test Locally (Optional but Recommended)

```bash
npm run dev
```

This will:
- Start Shopify CLI
- Create a tunnel to localhost
- Let you test the app installation

---

## 📋 Quick Checklist

- [ ] Created Shopify app in Partners Dashboard
- [ ] Got Client ID and API secret
- [ ] Updated `shopify.app.toml` with client_id
- [ ] Created Neon database project
- [ ] Got DATABASE_URL connection string
- [ ] Created `.env` file with all values
- [ ] Ran `npx prisma db push`
- [ ] Database tables created successfully

---

## 🚀 Once Setup Is Complete

**Let me know and I'll continue building:**

1. Shopify data ingestion (fetch orders, products, refunds)
2. Profit calculation engine
3. 3 decision rules (best-seller loss, free-shipping trap, discount-refund)
4. Decision dashboard UI
5. COGS management (manual editor + CSV upload)
6. Background jobs
7. Deploy to Vercel
8. Test on dev store

---

## ❓ Need Help?

If you get stuck:
- **Shopify app creation:** https://shopify.dev/docs/apps/tools/cli/create
- **Neon setup:** https://neon.tech/docs/get-started-with-neon
- **Prisma setup:** https://www.prisma.io/docs/getting-started

Just share any errors and I'll help fix them!
