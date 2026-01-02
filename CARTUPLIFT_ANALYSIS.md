# CartUpliftAI - App Architecture Analysis

**Date:** January 2, 2026
**Purpose:** Study CartUpliftAI structure to build new Shopify app 'decisions'

---

## 1. Tech Stack Overview

### Core Framework
- **Framework:** Remix (v2.16.7)
- **Runtime:** Node.js >= 20.0.0
- **Package Manager:** npm
- **Language:** TypeScript
- **Build Tool:** Vite (v6.2.2)
- **Deployment:** Vercel (using @vercel/remix adapter)

### Key Dependencies
- `@shopify/shopify-app-remix` (v3.7.0) - Shopify app authentication & API
- `@shopify/polaris` (v12.0.0) - Shopify design system
- `@shopify/app-bridge-react` (v4.1.6) - Embedded app integration
- `@prisma/client` (v6.16.2) - Database ORM
- `@shopify/shopify-app-session-storage-prisma` (v6.0.0) - Session management
- `@sentry/remix` (v10.15.0) - Error tracking
- `resend` (v6.3.0) - Email service

---

## 2. Project Structure

```
CartUpliftAI/
├── api/
│   └── index.js                    # Vercel serverless handler
├── app/
│   ├── components/                 # React components
│   ├── config/
│   │   ├── billing.server.ts       # Billing configuration
│   │   └── constants.ts            # App constants
│   ├── constants/                  # App-wide constants
│   ├── models/                     # Data models & server logic
│   │   ├── cartAnalytics.server.ts
│   │   ├── settings.server.ts
│   │   └── bundleInsights.server.ts
│   ├── routes/                     # Remix routes (pages)
│   │   ├── _index.tsx              # Landing page
│   │   ├── admin.*.tsx             # Admin routes
│   │   └── webhooks.*.tsx          # Webhook handlers
│   ├── styles/                     # CSS files
│   ├── types/                      # TypeScript types
│   ├── utils/                      # Utility functions
│   │   ├── auth.server.ts
│   │   ├── logger.server.ts
│   │   ├── env.server.ts
│   │   └── rateLimiter.server.ts
│   ├── db.server.ts               # Prisma client setup
│   ├── entry.server.tsx           # Server entry point
│   ├── shopify.server.ts          # Shopify app configuration
│   └── routes.ts                  # Route configuration
├── extensions/
│   └── cart-uplift/               # Shopify theme extension
│       ├── assets/
│       ├── blocks/
│       ├── locales/
│       ├── src/
│       └── shopify.extension.toml
├── prisma/
│   └── schema.prisma              # Database schema (PostgreSQL)
├── public/                         # Static assets
├── scripts/                        # Utility scripts
├── package.json
├── vite.config.ts
├── vercel.json                    # Vercel configuration
├── shopify.app.toml               # Shopify app configuration
├── shopify.web.toml               # Shopify web configuration
└── tsconfig.json
```

---

## 3. Configuration Files Analysis

### 3.1 vercel.json
```json
{
  "buildCommand": "npm run vercel-build",
  "crons": [...],                  // Scheduled tasks for ML & cleanup
  "headers": [...],                // Cache headers for assets
  "rewrites": [{
    "source": "/(.*)",
    "destination": "/api/index"    // Route all requests to Remix
  }]
}
```

**Key Features:**
- Custom build command: `npm run vercel-build`
- Cron jobs for data cleanup, ML learning, profile updates
- All routes rewritten to `/api/index` (Remix handler)
- Static asset caching (31536000s = 1 year)

### 3.2 shopify.app.toml
```toml
client_id = "ba2c932cf6717c8fb6207fcc8111fe70"
name = "CartUplift"
application_url = "https://cartuplift.com/"
embedded = true

[webhooks]
api_version = "2025-10"
# Webhooks: customers/data_request, customers/redact, shop/redact,
#           orders/create, app_subscriptions/update, app/uninstalled

[access_scopes]
scopes = "read_orders,read_products,read_themes"

[auth]
redirect_urls = [
  "https://cartuplift.com/auth/callback",
  "https://cartuplift.com/auth/shopify/callback",
  "https://cartuplift.com/api/auth/callback"
]

[app_proxy]
url = "https://cartuplift.com/apps/proxy"
subpath = "cart-uplift"
prefix = "apps"
```

**Key Features:**
- Embedded app mode
- OAuth redirect URLs
- App proxy for storefront integration
- GDPR compliance webhooks
- API version: 2025-10

### 3.3 vite.config.ts
```typescript
export default defineConfig({
  plugins: [
    remix({
      presets: [vercelPreset()],    // Vercel adapter
      ignoredRouteFiles: ["**/.*"],
      future: { ... }
    }),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
    target: "es2022",
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react", "@shopify/polaris"],
  },
})
```

**Key Features:**
- Vercel preset for deployment
- ES2022 target
- Path aliases via tsconfig
- Optimized deps for Shopify packages

### 3.4 package.json Scripts
```json
{
  "build": "prisma generate && remix vite:build",
  "vercel-build": "prisma generate && remix vite:build",
  "postinstall": "prisma generate",
  "dev": "shopify app dev",
  "setup": "prisma generate && prisma db push",
  "start": "remix-serve ./build/server/index.js"
}
```

---

## 4. Database Architecture (Prisma + PostgreSQL)

### Key Models:
1. **Session** - Shopify session storage
2. **Settings** - App configuration per shop
   - App embed activation tracking
   - Feature toggles (recommendations, bundles, analytics)
   - Theme customization (colors, text)
   - ML/privacy settings
   - Onboarding progress
3. **Bundle** - Product bundle management
4. **BundleProduct** - Products within bundles
5. **Subscription** - Billing & plan management
6. **TrackingEvent** - User behavior tracking
7. **MLUserProfile** - ML personalization data
8. **MLProductSimilarity** - Product recommendations
9. **AnalyticsEvent** - Dashboard analytics
10. **LifetimeMetrics** - All-time performance tracking

**Database Provider:** PostgreSQL (production)
**Connection:** Prisma with connection pooling for serverless

---

## 5. Shopify App Setup (shopify.server.ts)

```typescript
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  isEmbeddedApp: true,
  hooks: {
    afterAuth: async ({ session, admin }) => {
      // Register webhooks
      // Fetch shop email
      // Auto-create starter ML bundle
    }
  }
})
```

**Key Features:**
- Prisma session storage
- App Store distribution
- Post-installation hooks
- Automatic webhook registration

---

## 6. Vercel Deployment Setup

### api/index.js (Serverless Handler)
```javascript
import { createRequestHandler } from "@vercel/remix";
import * as build from "../build/server/index.js";

export const config = {
  runtime: "nodejs",  // Required for Prisma
};

export default createRequestHandler({
  build,
  mode: process.env.NODE_ENV || "production",
});
```

**Purpose:** Entry point for Vercel serverless functions

---

## 7. Key Features Implemented

### A. Authentication & Security
- OAuth 2.0 via Shopify App Remix
- Session management with Prisma
- HMAC webhook verification
- Rate limiting
- GDPR compliance webhooks

### B. Billing System
- Subscription plans (starter, growth, pro)
- Trial period management
- Order-based billing tracking
- Shopify AppSubscription API integration

### C. App Extension (Storefront)
- Theme app extension in `extensions/cart-uplift/`
- Blocks for cart drawer/page integration
- Asset optimization
- Multi-language support (locales)

### D. Machine Learning Features
- User profile tracking (privacy-aware)
- Product similarity computation
- Recommendation engine
- A/B testing framework

### E. Analytics & Insights
- Dashboard with metrics
- Bundle performance tracking
- Conversion attribution
- Lifetime metrics

---

## 8. Environment Variables Required

```env
# Shopify
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=
SCOPES=read_orders,read_products,read_themes

# Database
DATABASE_URL=postgresql://...

# Optional
NODE_ENV=production
SHOP_CUSTOM_DOMAIN=
```

---

## 9. Files to Copy for 'decisions' App

### Essential Configuration Files
1. ✅ `vercel.json` - Modify cron jobs, keep structure
2. ✅ `shopify.app.toml` - Update client_id, name, URLs, scopes
3. ✅ `shopify.web.toml` - Keep as-is
4. ✅ `vite.config.ts` - Keep Vercel preset setup
5. ✅ `tsconfig.json` - Keep as-is
6. ✅ `package.json` - Update name, copy dependencies & scripts
7. ✅ `.gitignore`, `.prettierrc.json`, `.editorconfig`

### Core App Files
8. ✅ `api/index.js` - Vercel handler (copy as-is)
9. ✅ `app/db.server.ts` - Prisma client setup
10. ✅ `app/shopify.server.ts` - Shopify config (modify afterAuth hook)
11. ✅ `app/entry.server.tsx` - Server entry point
12. ✅ `prisma/schema.prisma` - Customize for decisions app

### Utility Files
13. ✅ `app/utils/logger.server.ts` - Logger setup
14. ✅ `app/utils/env.server.ts` - Environment validation
15. ✅ `app/utils/auth.server.ts` - Auth helpers
16. ✅ `app/utils/webhookVerification.server.ts`
17. ✅ `app/utils/rateLimiter.server.ts`

### Route Templates
18. ✅ `app/routes/_index.tsx` - Landing page
19. ✅ `app/routes/admin.tsx` - Admin layout
20. ✅ `app/routes/webhooks.*.tsx` - Webhook handlers

### Types & Config
21. ✅ `app/types/` - TypeScript definitions
22. ✅ `env.d.ts` - Environment type definitions

---

## 10. Deployment Workflow

1. **Local Development:**
   ```bash
   npm install
   npm run dev  # Uses Shopify CLI
   ```

2. **Database Setup:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

3. **Vercel Deployment:**
   - Connect GitHub repo to Vercel
   - Add environment variables in Vercel dashboard
   - Deploy automatically on git push
   - Vercel runs: `npm run vercel-build`

4. **Shopify App Store Submission:**
   - Update shopify.app.toml with production URLs
   - Deploy app configuration: `npm run deploy`
   - Submit for review via Shopify Partners dashboard

---

## 11. Critical Notes for 'decisions' App

### Must Change:
- [ ] `shopify.app.toml`: client_id, name, application_url, handle
- [ ] `package.json`: name, author
- [ ] `prisma/schema.prisma`: Customize models for decisions features
- [ ] `app/shopify.server.ts`: Update afterAuth logic
- [ ] Environment variables: New Shopify API credentials

### Keep As-Is:
- ✅ Vercel deployment structure (api/index.js + vercel.json)
- ✅ Vite config with Vercel preset
- ✅ Database setup (Prisma + PostgreSQL)
- ✅ Shopify authentication flow
- ✅ Webhook verification logic
- ✅ Session management

### Optional Enhancements:
- Sentry for error tracking (already configured)
- Email service (Resend) for notifications
- Cron jobs for background tasks
- A/B testing framework

---

## 12. Next Steps for Building 'decisions'

1. Create new Shopify app in Partners dashboard
2. Copy base configuration files from CartUpliftAI
3. Update all Shopify-specific identifiers
4. Design database schema for decisions features
5. Build core routes and components
6. Set up Vercel project
7. Configure environment variables
8. Test locally with Shopify CLI
9. Deploy to Vercel
10. Submit to Shopify App Store

---

**Status:** ✅ Analysis Complete
**Ready for:** Building decisions app using this template

