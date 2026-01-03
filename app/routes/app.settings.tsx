import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Button,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { useState, useEffect } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const shopSettings = await prisma.shop.findUnique({
    where: { shop },
    select: {
      assumedShippingCost: true,
    },
  });

  return json({
    assumedShippingCost: shopSettings?.assumedShippingCost ?? 3.50,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const assumedShippingCost = parseFloat(formData.get("assumedShippingCost") as string);

  if (isNaN(assumedShippingCost) || assumedShippingCost < 0) {
    return json({ error: "Invalid shipping cost" }, { status: 400 });
  }

  await prisma.shop.update({
    where: { shop },
    data: { assumedShippingCost },
  });

  return json({ success: true });
};

export default function Settings() {
  const { assumedShippingCost } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [shippingCost, setShippingCost] = useState(assumedShippingCost.toString());
  const [showSuccess, setShowSuccess] = useState(false);

  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "success" in fetcher.data) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  }, [fetcher.state, fetcher.data]);

  const handleSave = () => {
    fetcher.submit(
      { assumedShippingCost: shippingCost },
      { method: "post" }
    );
  };

  return (
    <Page
      title="Settings"
      backAction={{ url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {showSuccess && (
              <Banner tone="success">
                Settings saved successfully!
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Cost Assumptions
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  These settings help calculate profit for decisions that involve shipping costs.
                </Text>

                <TextField
                  label="Assumed shipping cost per order"
                  type="number"
                  value={shippingCost}
                  onChange={setShippingCost}
                  prefix="£"
                  helpText="Average cost you pay to ship an order. Used when calculating Best-Seller Loss and Free-Shipping Trap decisions."
                  autoComplete="off"
                />

                <Button
                  variant="primary"
                  onClick={handleSave}
                  loading={isSaving}
                >
                  Save Settings
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  COGS (Cost of Goods Sold)
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  COGS is managed directly in Shopify. Products without COGS are excluded from profit calculations.
                </Text>

                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    To add costs in Shopify:
                  </Text>
                  <Text as="p" variant="bodyMd">
                    1. Go to <strong>Products</strong> in your Shopify Admin
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. Select a product and click on a variant
                  </Text>
                  <Text as="p" variant="bodyMd">
                    3. Set <strong>"Cost per item"</strong> (what you pay to acquire/make it)
                  </Text>
                  <Text as="p" variant="bodyMd">
                    4. Save the product
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    After adding costs, return to Decisions and the app will automatically include those products in profit analysis.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
