# Vercel Deployment Guide for Decisions

## ✅ Latest Push
**Commit:** `f207ae0` - Added Remix root layout (fixes build error)

The build error is now fixed! Vercel should be able to build successfully.

---

## 🚀 Deploy to Vercel (5 minutes)

### Step 1: Connect GitHub to Vercel

1. Go to https://vercel.com
2. Sign in (use GitHub account)
3. Click **"Add New..."** → **"Project"**
4. Find **`decisions`** repository in the list
5. Click **"Import"**

---

### Step 2: Configure Build Settings

Vercel should auto-detect Remix. Verify these settings:

- **Framework Preset:** Remix
- **Root Directory:** `./` (leave blank)
- **Build Command:** `npm run vercel-build`
- **Output Directory:** `build` (auto-detected)

---

### Step 3: Set Up Neon Database (Do This First!)

**IMPORTANT:** Set up database BEFORE deploying!

1. Go to https://neon.tech
2. Sign in / Create account
3. Click **"Create Project"**
4. Settings:
   - **Name:** `decisions`
   - **PostgreSQL version:** 16 (latest)
   - **Region:** Choose closest to you
5. Click **"Create Project"**
6. **Copy the connection string** (starts with `postgresql://`)

---

### Step 4: Add Environment Variables in Vercel

**CRITICAL:** Add these BEFORE clicking Deploy!

Click **"Environment Variables"** and add:

```bash
# Shopify (placeholder for now - we'll update after getting URL)
SHOPIFY_API_KEY=placeholder
SHOPIFY_API_SECRET=placeholder
SHOPIFY_APP_URL=https://your-vercel-url.vercel.app

# Scopes
SCOPES=read_orders,read_products

# Database (from Step 3)
DATABASE_URL=postgresql://your_neon_connection_string_here

# Environment
NODE_ENV=production
```

**Note:** We'll update the Shopify values after creating the app in Partners Dashboard.

---

### Step 5: Deploy!

1. Click **"Deploy"**
2. Wait for build (2-3 minutes)
3. Build should succeed now ✅

---

### Step 6: Get Your Vercel URL

After deployment completes:

1. You'll see: **"Congratulations!"**
2. Copy your deployment URL (looks like: `https://decisions-xxxx.vercel.app`)
3. **Save this URL** - we need it for Shopify app config

---

## 📋 Next Steps After Deployment

### 1. Update shopify.app.toml

Replace `https://decisions-app.vercel.app` with your actual Vercel URL in:
- `application_url`
- All `redirect_urls`

### 2. Create Shopify App

1. Go to https://partners.shopify.com
2. Create new app
3. Use your actual Vercel URL
4. Get Client ID and API Secret

### 3. Update Vercel Environment Variables

Go back to Vercel → Settings → Environment Variables:

- Update `SHOPIFY_API_KEY` with actual Client ID
- Update `SHOPIFY_API_SECRET` with actual secret
- Update `SHOPIFY_APP_URL` with your Vercel URL

Then **redeploy** (Deployments tab → click "..." → Redeploy)

### 4. Push Database Schema

From your local machine:

```bash
# Make sure .env has your DATABASE_URL
npx prisma db push
```

This creates all the tables in Neon.

---

## 🎯 Expected Vercel URL Format

Your URL will look like one of these:
- `https://decisions-xxxx.vercel.app` (auto-generated)
- `https://decisions-adedayo14.vercel.app` (if you set custom)

---

## ⚠️ Troubleshooting

### Build fails with "Missing root route file"
✅ FIXED in commit `f207ae0`

### Build fails with environment variable errors
- Make sure `DATABASE_URL` is set in Vercel
- Placeholder values for SHOPIFY_API_KEY are OK for first deploy

### Database connection errors
- Verify Neon connection string is correct
- Make sure DATABASE_URL includes `?sslmode=require` if needed

---

## 📊 Deployment Checklist

- [ ] Neon database created
- [ ] DATABASE_URL copied
- [ ] Vercel project created from GitHub
- [ ] Environment variables added in Vercel
- [ ] First deployment succeeded
- [ ] Vercel URL copied
- [ ] shopify.app.toml updated with real URL
- [ ] Shopify app created in Partners Dashboard
- [ ] Vercel env vars updated with real Shopify credentials
- [ ] Redeployed after updating env vars
- [ ] Database schema pushed (`npx prisma db push`)

---

**Once deployment is live, let me know your Vercel URL and I'll help you update the config files!**
