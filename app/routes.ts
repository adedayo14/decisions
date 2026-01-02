import { type RouteConfig, index, route } from "@remix-run/route-config";

export default [
  // Public landing page
  index("routes/_index.tsx"),

  // Main app route (authenticated)
  route("app", "routes/app._index.tsx"),

  // GDPR Compliance Webhooks (required)
  route("webhooks/customers/data_request", "routes/webhooks.customers.data_request.tsx"),
  route("webhooks/customers/redact", "routes/webhooks.customers.redact.tsx"),
  route("webhooks/shop/redact", "routes/webhooks.shop.redact.tsx"),

  // App lifecycle webhook
  route("webhooks/app/uninstalled", "routes/webhooks.app.uninstalled.tsx"),

  // Add your custom routes here
] satisfies RouteConfig;
