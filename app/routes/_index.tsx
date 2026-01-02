import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  return json({ shop });
}

export default function Index() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Welcome to Your Shopify App</h1>
      {shop ? (
        <p>Install this app on {shop}</p>
      ) : (
        <p>This is a Shopify embedded admin app.</p>
      )}
    </div>
  );
}
