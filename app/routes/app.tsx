import { Outlet, useLoaderData, useRouteError, Links, Meta, Scripts } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import "@shopify/polaris/build/esm/styles.css";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
  });
}

export default function AppLayout() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  return (
    <html>
      <head>
        <title>Error - Decisions</title>
        <Meta />
        <Links />
      </head>
      <body>
        <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
          <h1>Application Error</h1>
          <p>Something went wrong. Please try again.</p>
          {process.env.NODE_ENV === "development" && (
            <pre>{error instanceof Error ? error.message : String(error)}</pre>
          )}
        </div>
        <Scripts />
      </body>
    </html>
  );
}
