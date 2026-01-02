import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  return json({
    shop: session.shop,
  });
}

export default function AppIndex() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <Page title="Dashboard">
      <Layout>
        <Layout.Section>
          <Card>
            <Text as="h2" variant="headingMd">
              Welcome to your Shopify app!
            </Text>
            <Text as="p" variant="bodyMd">
              Connected to: {shop}
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              Start building your app features here.
            </Text>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
