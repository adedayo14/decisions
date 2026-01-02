# Files to Copy from CartUpliftAI to decisions

**Purpose:** Checklist of files to copy/adapt for the new 'decisions' Shopify app

---

## 1. Root Configuration Files (Copy & Modify)

| File | Action | Notes |
|------|--------|-------|
| `package.json` | ✅ Copy & Modify | Change `name` to "decisions", update `author`, keep dependencies |
| `vercel.json` | ✅ Copy & Modify | Update cron jobs for decisions-specific tasks |
| `shopify.app.toml` | ✅ Copy & Modify | **CRITICAL:** Update client_id, name, handle, URLs, scopes |
| `shopify.web.toml` | ✅ Copy as-is | No changes needed |
| `vite.config.ts` | ✅ Copy as-is | Vercel preset configuration |
| `tsconfig.json` | ✅ Copy as-is | TypeScript configuration |
| `.gitignore` | ✅ Copy as-is | Standard ignores |
| `.prettierrc.json` | ✅ Copy as-is | Code formatting |
| `.prettierignore` | ✅ Copy as-is | Format ignores |
| `.editorconfig` | ✅ Copy as-is | Editor config |
| `.npmrc` | ✅ Copy as-is | NPM config |
| `env.d.ts` | ✅ Copy as-is | Environment types |
| `.graphqlrc.ts` | ✅ Copy as-is | GraphQL config |
| `eslint.config.js` | ✅ Copy as-is | Linting config |

---

## 2. API Directory (Vercel Serverless Handler)

| File | Action | Notes |
|------|--------|-------|
| `api/index.js` | ✅ Copy as-is | Vercel Remix handler - NO changes needed |

---

## 3. App Core Files

| File | Action | Notes |
|------|--------|-------|
| `app/db.server.ts` | ✅ Copy as-is | Prisma client setup with connection pooling |
| `app/shopify.server.ts` | ✅ Copy & Modify | Update `afterAuth` hook for decisions-specific logic |
| `app/entry.server.tsx` | ✅ Copy & Modify | May need to adjust Sentry/logging config |
| `app/routes.ts` | ✅ Copy & Modify | Define routes for decisions app |
| `app/globals.d.ts` | ✅ Copy as-is | Global type definitions |

---

## 4. Prisma Database

| File | Action | Notes |
|------|--------|-------|
| `prisma/schema.prisma` | ✅ Copy & Modify | **CRITICAL:** Design custom schema for decisions features |

**Keep from CartUplift:**
- Session model (required for Shopify auth)
- Settings model (adapt fields for decisions)

**Remove/Replace:**
- Bundle, BundleProduct models (CartUplift-specific)
- ML models (unless needed)
- Analytics models (customize for decisions)

---

## 5. Utilities (app/utils/)

| File | Action | Notes |
|------|--------|-------|
| `app/utils/logger.server.ts` | ✅ Copy as-is | Server logging utility |
| `app/utils/env.server.ts` | ✅ Copy & Modify | Add decisions-specific env vars |
| `app/utils/auth.server.ts` | ✅ Copy as-is | Auth helpers |
| `app/utils/webhookVerification.server.ts` | ✅ Copy as-is | HMAC verification |
| `app/utils/rateLimiter.server.ts` | ✅ Copy as-is | Rate limiting |
| `app/utils/auth-helper.ts` | ✅ Copy as-is | Client-side auth helpers |
| `app/utils/formatters.ts` | ✅ Copy if needed | Formatting utilities |
| `app/utils/startup.server.ts` | ✅ Copy & Modify | Startup initialization logic |
| `app/utils/db-migration.server.ts` | ⚠️ Optional | Only if using DB migrations |

---

## 6. Types (app/types/)

| File | Action | Notes |
|------|--------|-------|
| `app/types/common.ts` | ✅ Copy & Modify | Common type definitions |
| `app/types/prisma.ts` | ✅ Copy & Modify | Prisma type helpers |
| `app/types/app-bridge-utils.d.ts` | ✅ Copy as-is | App Bridge types |
| `app/types/billing.ts` | ✅ Copy if needed | Billing types (if using subscriptions) |

---

## 7. Routes (app/routes/)

### Essential Routes to Copy:

| File | Action | Notes |
|------|--------|-------|
| `app/routes/_index.tsx` | ✅ Copy & Modify | Landing page - customize for decisions |
| `app/routes/admin.tsx` | ✅ Copy & Modify | Admin layout wrapper |
| `app/routes/admin.dashboard.tsx` | ✅ Copy & Modify | Main dashboard - **heavily customize** |
| `app/routes/admin.settings.tsx` | ✅ Copy & Modify | Settings page - adapt for decisions |

### Webhook Routes to Copy:

| File | Action | Notes |
|------|--------|-------|
| `app/routes/webhooks.app.uninstalled.tsx` | ✅ Copy as-is | Required for cleanup |
| `app/routes/webhooks.customers.data_request.tsx` | ✅ Copy as-is | GDPR compliance |
| `app/routes/webhooks.customers.redact.tsx` | ✅ Copy as-is | GDPR compliance |
| `app/routes/webhooks.shop.redact.tsx` | ✅ Copy as-is | GDPR compliance |
| `app/routes/webhooks.app.scopes_update.tsx` | ✅ Copy as-is | Handle scope changes |
| Other webhook routes | ⚠️ Copy if needed | `orders/create`, `app_subscriptions/update` |

### Auth Routes (Usually auto-handled by Shopify App Remix):
- These are typically managed by the framework, no need to copy manually

---

## 8. Config (app/config/)

| File | Action | Notes |
|------|--------|-------|
| `app/config/constants.ts` | ✅ Copy & Modify | App-wide constants - customize |
| `app/config/billing.server.ts` | ✅ Copy if needed | Billing plans config (if using subscriptions) |

---

## 9. Components (app/components/)

| File | Action | Notes |
|------|--------|-------|
| `app/components/*` | ⚠️ Selective | Copy reusable components (error boundaries, nav links) |

**Suggested to copy:**
- `OnboardingErrorBoundary.tsx` - Error handling
- `AppNavLink.tsx` - Navigation helper

**Skip CartUplift-specific components:**
- BundleTable, InsightCard, etc. (build custom for decisions)

---

## 10. Styles (app/styles/)

| File | Action | Notes |
|------|--------|-------|
| `app/styles/*.css` | ⚠️ Optional | Copy if using similar UI patterns |

**Recommendation:** Start fresh with Polaris components, add custom styles as needed

---

## 11. Models (app/models/)

| File | Action | Notes |
|------|--------|-------|
| `app/models/*.server.ts` | ⚠️ Skip for now | CartUplift-specific business logic - build custom |

---

## 12. Extensions (Optional - Storefront Integration)

| File | Action | Notes |
|------|--------|-------|
| `extensions/cart-uplift/` | ⚠️ Skip initially | Only if decisions needs storefront extension |

**If needed later:**
- Copy structure and create `extensions/decisions/`
- Update `shopify.extension.toml`

---

## 13. Documentation Files (Optional)

| File | Action | Notes |
|------|--------|-------|
| `README.md` | ✅ Copy & Modify | Update for decisions app |
| `DEPLOYMENT.md` | ✅ Copy as-is | Deployment guide |
| Other `.md` files | ⚠️ Optional | Reference as needed |

---

## 14. Scripts (Optional)

| Directory | Action | Notes |
|-----------|--------|-------|
| `scripts/*` | ⚠️ Skip initially | CartUplift-specific scripts - build as needed |

---

## 15. Public Assets

| Directory | Action | Notes |
|-----------|--------|-------|
| `public/*` | ⚠️ Custom | Add decisions-specific assets (logo, favicon, etc.) |

---

## Copy Priority Checklist

### Phase 1: Essential Setup (Copy First)
- [x] `package.json`
- [x] `vercel.json`
- [x] `shopify.app.toml` ⚠️ **MODIFY IMMEDIATELY**
- [x] `shopify.web.toml`
- [x] `vite.config.ts`
- [x] `tsconfig.json`
- [x] `.gitignore`, `.prettierrc.json`, `.editorconfig`
- [x] `api/index.js`

### Phase 2: Core App Infrastructure
- [x] `app/db.server.ts`
- [x] `app/shopify.server.ts` ⚠️ **MODIFY afterAuth**
- [x] `app/entry.server.tsx`
- [x] `prisma/schema.prisma` ⚠️ **REDESIGN for decisions**
- [x] All files in `app/utils/`
- [x] All files in `app/types/`

### Phase 3: Routes & Features
- [x] `app/routes/_index.tsx`
- [x] `app/routes/admin.tsx`
- [x] GDPR webhook routes
- [x] `app/routes/admin.dashboard.tsx` ⚠️ **CUSTOMIZE**
- [x] `app/routes/admin.settings.tsx` ⚠️ **CUSTOMIZE**

### Phase 4: Polish & Customize
- [ ] Custom components for decisions features
- [ ] Custom styles
- [ ] Custom business logic in models
- [ ] Extension (if needed)

---

## Environment Variables to Set

```env
# Shopify App Credentials (Get from Shopify Partners Dashboard)
SHOPIFY_API_KEY=your_new_app_key
SHOPIFY_API_SECRET=your_new_app_secret
SHOPIFY_APP_URL=https://decisions.yourname.com
SCOPES=read_products,write_products,read_orders,write_orders  # Customize

# Database (PostgreSQL on Vercel/Neon)
DATABASE_URL=postgresql://user:pass@host/decisions_db

# Environment
NODE_ENV=production

# Optional
SENTRY_DSN=  # If using error tracking
RESEND_API_KEY=  # If using email service
```

---

## Quick Start Commands

```bash
# 1. Create project directory
mkdir decisions
cd decisions

# 2. Copy files from CartUpliftAI (manual or script)
# ... copy files according to checklist above ...

# 3. Install dependencies
npm install

# 4. Set up database
npx prisma generate
npx prisma db push

# 5. Start development server
npm run dev

# 6. Deploy to Vercel
vercel --prod
```

---

**Status:** ✅ Checklist Ready
**Next:** Start copying Phase 1 files and set up basic project structure
