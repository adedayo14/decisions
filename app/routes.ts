import { type RouteConfig, index, route, layout } from "@remix-run/route-config";

export default [
  // Public landing page
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

  // Utility routes
  route("health", "routes/health.tsx"),
  route("setup", "routes/setup.tsx"),
  route("migrate", "routes/migrate.tsx"),

  // GDPR Compliance Webhooks (required)
  route("webhooks/customers/data_request", "routes/webhooks.customers.data_request.tsx"),
  route("webhooks/customers/redact", "routes/webhooks.customers.redact.tsx"),
  route("webhooks/shop/redact", "routes/webhooks.shop.redact.tsx"),

  // App lifecycle webhook
  route("webhooks/app/uninstalled", "routes/webhooks.app.uninstalled.tsx"),
] satisfies RouteConfig;
