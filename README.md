# Shopify App Starter

A production-ready Shopify embedded admin app template built with modern tools and best practices.

## 🚀 Tech Stack

- **Framework:** [Remix](https://remix.run) with Vite
- **Shopify Integration:** [@shopify/shopify-app-remix](https://shopify.dev/docs/api/shopify-app-remix)
- **Database:** PostgreSQL with [Prisma ORM](https://www.prisma.io/)
- **UI:** [Shopify Polaris](https://polaris.shopify.com/)
- **Deployment:** [Vercel](https://vercel.com) (serverless)
- **Language:** TypeScript

## ✨ Features

- ✅ Complete OAuth flow & session management
- ✅ Embedded app with App Bridge integration
- ✅ GDPR compliance webhooks (data request, redact)
- ✅ App lifecycle management (install, uninstall)
- ✅ Serverless deployment ready
- ✅ TypeScript for type safety
- ✅ Clean, minimal codebase

## 📋 Prerequisites

Before you begin, ensure you have:

1. **Node.js** >= 20.0.0
2. **Shopify Partners Account** - [Create one](https://partners.shopify.com/signup)
3. **Development Store** - Create via Partners Dashboard
4. **PostgreSQL Database** - Use [Neon](https://neon.tech), [Vercel Postgres](https://vercel.com/storage/postgres), or any provider

## 🏗️ Quick Start

### 1. Use this template

```bash
# Clone or copy this repository
cp -r shopify-app-starter my-awesome-app
cd my-awesome-app

# Install dependencies
npm install
```

### 2. Create a Shopify App

1. Go to [Shopify Partners Dashboard](https://partners.shopify.com)
2. Click "Apps" → "Create app"
3. Choose "Create app manually"
4. Note down your **API key** and **API secret**

### 3. Set up environment variables

```bash
# Copy the example file
cp .env.example .env

# Edit .env and fill in your values
```

### 4. Configure your app

Update `shopify.app.toml` with:
- Your `client_id` (from Partners Dashboard)
- Your app `name`
- Your app `handle`
- Required `scopes` (e.g., `read_products,read_orders`)
- Your deployment URL (or use placeholder for now)

### 5. Set up the database

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

### 6. Start development

```bash
npm run dev
```

This will:
- Start the Remix dev server
- Launch Shopify CLI
- Create a tunnel to your local app
- Open your browser to install the app

## 📦 Project Structure

```
shopify-app-starter/
├── api/
│   └── index.js              # Vercel serverless handler
├── app/
│   ├── routes/               # Remix routes
│   │   ├── _index.tsx        # Public landing page
│   │   ├── app._index.tsx    # Main app dashboard
│   │   └── webhooks.*.tsx    # GDPR & lifecycle webhooks
│   ├── components/           # React components
│   ├── utils/                # Utilities (logger, auth, etc.)
│   ├── types/                # TypeScript types
│   ├── db.server.ts          # Prisma client
│   ├── shopify.server.ts     # Shopify app configuration
│   └── routes.ts             # Route configuration
├── prisma/
│   └── schema.prisma         # Database schema
├── public/                   # Static assets
├── shopify.app.toml          # Shopify app config
├── shopify.web.toml          # Shopify CLI config
├── vercel.json               # Vercel deployment config
└── vite.config.ts            # Vite bundler config
```

## 🛠️ Customization

### Add Database Models

Edit `prisma/schema.prisma`:

```prisma
model YourModel {
  id        String   @id @default(cuid())
  shop      String
  // Add your fields here
  createdAt DateTime @default(now())
}
```

Then run:
```bash
npx prisma db push
npx prisma generate
```

### Add Routes

Create new files in `app/routes/`:

```tsx
// app/routes/app.settings.tsx
import { Page } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  await authenticate.admin(request);
  return json({});
}

export default function Settings() {
  return <Page title="Settings">Your settings here</Page>;
}
```

Update `app/routes.ts`:
```tsx
route("app/settings", "routes/app.settings.tsx"),
```

### Customize afterAuth Hook

Edit `app/shopify.server.ts`:

```typescript
hooks: {
  afterAuth: async ({ session, admin }) => {
    // Your custom logic after merchant installs
    // Example: Fetch shop data, initialize settings, etc.
  },
}
```

## 🚀 Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import project in [Vercel](https://vercel.com/new)
3. Add environment variables in Vercel dashboard
4. Deploy!

### Update Shopify Configuration

```bash
# Update shopify.app.toml with your Vercel URL
# Then sync with Shopify
npm run deploy
```

## 📚 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SHOPIFY_API_KEY` | Your Shopify app API key | ✅ |
| `SHOPIFY_API_SECRET` | Your Shopify app API secret | ✅ |
| `SHOPIFY_APP_URL` | Your app's public URL | ✅ |
| `SCOPES` | Comma-separated Shopify scopes | ✅ |
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `NODE_ENV` | Environment (development/production) | ✅ |
| `SHOP_CUSTOM_DOMAIN` | Custom domain for dev store | ❌ |

## 🧪 Testing Locally

1. Install app on development store via Shopify CLI
2. Access via: `https://admin.shopify.com/store/your-store/apps/your-app-handle`
3. Test all features in the embedded admin

## 📖 Learn More

- [Shopify App Development Docs](https://shopify.dev/docs/apps)
- [Remix Documentation](https://remix.run/docs)
- [Shopify Polaris Components](https://polaris.shopify.com/components)
- [Prisma Documentation](https://www.prisma.io/docs)

## 🤝 Contributing

This is a template repository. Feel free to customize and extend it for your needs!

## 📄 License

MIT License - Use freely for your Shopify apps

---

**Built with ❤️ for the Shopify developer community**
# decisions
