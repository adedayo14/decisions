import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Badge,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getActiveDecisions } from "../services/decision-rules.server";
import { useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  console.log("[app._index loader] Authenticated shop:", shop);

  // Load decisions with fallback - don't crash if DB has issues
  let decisions: Awaited<ReturnType<typeof getActiveDecisions>> = [];
  try {
    decisions = await getActiveDecisions(shop);
    console.log("[app._index loader] Found decisions:", decisions.length);
  } catch (error) {
    console.error("[app._index loader] Error loading decisions (non-fatal):", error);
    // Continue with empty decisions - user can try "Refresh" button
  }

  return json({
    shop,
    decisions: decisions.map((d) => ({
      id: d.id,
      type: d.type,
      headline: d.headline,
      actionTitle: d.actionTitle,
      reason: d.reason,
      impact: d.impact,
      confidence: d.confidence,
      generatedAt: d.generatedAt.toISOString(),
    })),
  });
};

export default function Index() {
  const { decisions } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    submit({}, { method: "post", action: "/app/refresh" });
  };

  const handleMarkDone = (decisionId: string) => {
    submit(
      { decisionId, action: "done" },
      { method: "post", action: "/app/decision" }
    );
  };

  const handleMarkIgnored = (decisionId: string) => {
    submit(
      { decisionId, action: "ignore" },
      { method: "post", action: "/app/decision" }
    );
  };

  const getDecisionIcon = (type: string) => {
    switch (type) {
      case "best_seller_loss":
        return "📉";
      case "free_shipping_trap":
        return "📦";
      case "discount_refund_hit":
        return "💸";
      default:
        return "💡";
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case "high":
        return <Badge tone="success">High confidence</Badge>;
      case "medium":
        return <Badge tone="attention">Medium confidence</Badge>;
      case "low":
        return <Badge>Low confidence</Badge>;
      default:
        return null;
    }
  };

  return (
    <Page
      title="Decisions"
      primaryAction={{
        content: refreshing ? "Refreshing..." : "Refresh Decisions",
        onAction: handleRefresh,
        loading: refreshing,
      }}
    >
      <Layout>
        <Layout.Section>
          {decisions.length === 0 ? (
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  No decisions yet
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  We're analyzing your Shopify data to find profit opportunities.
                  Click "Refresh Decisions" to generate recommendations.
                </Text>
              </BlockStack>
            </Card>
          ) : (
            <BlockStack gap="400">
              <Banner tone="info">
                <Text as="p" variant="bodyMd">
                  Showing the top {decisions.length} profit decision
                  {decisions.length > 1 ? "s" : ""} you should take right now.
                </Text>
              </Banner>

              {decisions.map((decision) => (
                <Card key={decision.id}>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="start">
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="h2" variant="headingLg">
                            {getDecisionIcon(decision.type)} {decision.headline}
                          </Text>
                          {getConfidenceBadge(decision.confidence)}
                        </InlineStack>
                        <Text as="p" variant="headingMd">
                          {decision.actionTitle}
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          {decision.reason}
                        </Text>
                      </BlockStack>
                    </InlineStack>

                    <InlineStack gap="200">
                      <Button
                        variant="primary"
                        onClick={() => handleMarkDone(decision.id)}
                      >
                        Mark as Done
                      </Button>
                      <Button onClick={() => handleMarkIgnored(decision.id)}>
                        Ignore
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              ))}
            </BlockStack>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
