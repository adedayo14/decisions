# Revised Build Plan: Shopify App Starter → Decisions v1

## Strategy: Build Reusable Template First

### Phase 1: Create `shopify-app-starter` (Generic Template)
**Repository:** `shopify-app-starter`
**Purpose:** Clean, reusable Shopify embedded app template for future projects

**What it includes:**
- ✅ Complete Vercel + Remix + Prisma setup
- ✅ Shopify OAuth & session management
- ✅ Basic admin layout with Polaris
- ✅ GDPR webhook handlers
- ✅ Environment configuration
- ✅ Minimal Prisma schema (Session + Shop only)
- ✅ Placeholder routes
- ✅ Clean README with setup instructions

**What it does NOT include:**
- ❌ Any business logic
- ❌ App-specific features
- ❌ CartUplift code
- ❌ Decisions code

**Git:**
```bash
# Create starter template
cd ~/shopify-app-starter
git init
git add .
git commit -m "feat: initial shopify app starter template"
git remote add origin https://github.com/adedayo14/shopify-app-starter.git
git push -u origin main
```

---

### Phase 2: Create `decisions` from Starter
**Repository:** `decisions`
**Purpose:** Decisions v1 app using the starter as foundation

**Steps:**
1. Copy `shopify-app-starter` to `decisions` directory
2. Initialize separate Git repo
3. Customize for Decisions features
4. Push to `https://github.com/adedayo14/decisions.git`

---

## EXECUTION PLAN

### STEP 1: Test GitHub Connection
**Task:** Verify SSH/PAT authentication works

```bash
ssh -T git@github.com
# Expected: "Hi adedayo14! You've successfully authenticated..."
```

**If fails:** Ask for GitHub PAT

---

### STEP 2: Build `shopify-app-starter` Template

**Directory structure:**
```
shopify-app-starter/
├── api/
│   └── index.js                    # Vercel serverless handler
├── app/
│   ├── components/
│   │   └── AppLayout.tsx           # Basic Polaris layout
│   ├── routes/
│   │   ├── _index.tsx              # Landing page
│   │   ├── app._index.tsx          # Main app dashboard (placeholder)
│   │   ├── webhooks.app.uninstalled.tsx
│   │   ├── webhooks.customers.data_request.tsx
│   │   ├── webhooks.customers.redact.tsx
│   │   └── webhooks.shop.redact.tsx
│   ├── types/
│   │   ├── common.ts
│   │   ├── prisma.ts
│   │   └── app-bridge-utils.d.ts
│   ├── utils/
│   │   ├── auth.server.ts
│   │   ├── env.server.ts
│   │   ├── logger.server.ts
│   │   ├── rateLimiter.server.ts
│   │   └── webhookVerification.server.ts
│   ├── db.server.ts
│   ├── entry.server.tsx
│   ├── shopify.server.ts
│   └── routes.ts
├── prisma/
│   └── schema.prisma               # Minimal: Session + Shop only
├── public/
├── .env.example
├── .gitignore
├── .prettierrc.json
├── eslint.config.js
├── package.json                    # name: "shopify-app-starter"
├── README.md                       # Generic setup instructions
├── shopify.app.toml                # Placeholder values
├── shopify.web.toml
├── tsconfig.json
├── vercel.json
└── vite.config.ts
```

**Minimal `prisma/schema.prisma`:**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Required for Shopify session storage
model Session {
  id            String    @id
  shop          String
  state         String
  isOnline      Boolean   @default(false)
  scope         String?
  expires       DateTime?
  accessToken   String
  userId        BigInt?
  firstName     String?
  lastName      String?
  email         String?
  accountOwner  Boolean   @default(false)
  locale        String?
  collaborator  Boolean?  @default(false)
  emailVerified Boolean?  @default(false)
}

// Generic shop settings
model Shop {
  id        String   @id @default(cuid())
  shop      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**`package.json` (name only):**
```json
{
  "name": "shopify-app-starter",
  "version": "1.0.0",
  "private": true,
  ...
}
```

**`README.md` for starter:**
```markdown
# Shopify App Starter Template

A production-ready Shopify embedded admin app template.

## Tech Stack
- Remix + Vite
- Shopify App Remix
- Prisma + PostgreSQL
- Vercel deployment
- TypeScript

## What's Included
- OAuth & session management
- GDPR compliance webhooks
- Basic admin UI with Polaris
- Environment configuration
- Database setup with Prisma

## Quick Start

1. Copy this template:
   ```bash
   cp -r shopify-app-starter my-app
   cd my-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` from `.env.example`

4. Set up database:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. Run locally:
   ```bash
   npm run dev
   ```

## Customization

1. Update `shopify.app.toml` with your app details
2. Extend `prisma/schema.prisma` for your features
3. Add routes in `app/routes/`
4. Build your app logic!

## Environment Variables

```
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=
SCOPES=read_products
DATABASE_URL=postgresql://...
```

## Deployment

Deploy to Vercel:
```bash
vercel --prod
```

Update Shopify config:
```bash
npm run deploy
```
```

---

### STEP 3: Create `decisions` from Starter

**Copy starter and customize:**

1. Copy template:
   ```bash
   cp -r shopify-app-starter decisions
   cd decisions
   ```

2. Update `package.json`:
   ```json
   {
     "name": "decisions",
     "version": "1.0.0",
     ...
   }
   ```

3. Extend Prisma schema with Decisions models:
   - COGS
   - Decision
   - DataCache

4. Add Decisions routes:
   - `app/routes/app._index.tsx` - Decision dashboard
   - `app/routes/app.costs.tsx` - COGS editor
   - `app/routes/app.costs.upload.tsx` - CSV upload
   - `app/routes/api.cron.daily-decisions.tsx` - Background job

5. Add business logic:
   - `app/models/shopifyData.server.ts` - Data ingestion
   - `app/models/profitCalculator.server.ts` - Profit calcs
   - `app/models/decisions/*.server.ts` - Decision rules
   - `app/models/decisionEngine.server.ts` - Orchestration

6. Initialize separate Git repo:
   ```bash
   echo "# decisions" >> README.md
   git init
   git add .
   git commit -m "feat: initial decisions app from starter template"
   git remote add origin https://github.com/adedayo14/decisions.git
   git push -u origin main
   ```

---

## STEP-BY-STEP EXECUTION

### Part A: Build Starter Template (1-2 hours)

1. **Test GitHub auth** ✓
2. **Create `shopify-app-starter` directory**
3. **Copy files from CartUpliftAI** (cleaned up)
4. **Remove all business logic**
5. **Create minimal schema**
6. **Write generic README**
7. **Test builds locally**
8. **Git init + push to `shopify-app-starter` repo**

**Pause here - confirm starter looks good**

---

### Part B: Create Decisions App (18-20 hours)

1. **Copy starter to `decisions`**
2. **Initialize decisions repo**
3. **Push initial commit**
4. **Guide you to create Shopify app** (client_id)
5. **Set up Neon database** (you provide URL)
6. **Extend Prisma schema**
7. **Implement Decisions features** (per original spec)
8. **Test locally**
9. **Deploy to Vercel**
10. **Test on dev store**

---

## CONFIRMATION CHECKLIST

Before I start, confirm:

- [x] GitHub SSH authentication should work (I'll test it)
- [ ] You want me to create **shopify-app-starter** first (separate repo)
- [ ] Then create **decisions** using that starter
- [ ] You'll create Shopify app when I ask
- [ ] You'll provide Neon database URL when needed

## REPOSITORIES THAT WILL BE CREATED

1. `https://github.com/adedayo14/shopify-app-starter`
   - Generic template
   - Reusable for future apps

2. `https://github.com/adedayo14/decisions`
   - Decisions v1
   - Built from starter

---

## READY TO START?

**I will now:**

1. ✅ Test GitHub connection
2. ✅ Create `shopify-app-starter` directory
3. ✅ Build clean template from CartUpliftAI
4. ✅ Push to GitHub
5. ⏸️ **PAUSE** - show you the starter and confirm it's good
6. ✅ Copy starter → `decisions`
7. ✅ Customize for Decisions
8. ✅ Push decisions repo
9. ⏸️ **PAUSE** - ask you to create Shopify app
10. ✅ Continue with implementation

**Shall I proceed with Step 1 (test GitHub auth)?** 🚀
