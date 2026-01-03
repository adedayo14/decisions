import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
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
  Collapsible,
  DataTable,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getActiveDecisions } from "../services/decision-rules.server";
import { prisma } from "../db.server";
import { useEffect, useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  console.log("[app._index loader] Authenticated shop:", shop);

  // Load decisions with fallback - don't crash if DB has issues
  let decisions: Awaited<ReturnType<typeof getActiveDecisions>> = [];
  let orderCount = 0;
  let lastAnalyzedAt: string | null = null;
  let currencySymbol = "£"; // Default fallback

  try {
    decisions = await getActiveDecisions(shop);
    console.log("[app._index loader] Found decisions:", decisions.length);

    // Get shop stats and currency
    const shopData = await prisma.shop.findUnique({
      where: { shop },
      select: { lastOrderCount: true, lastAnalyzedAt: true, currencySymbol: true },
    });

    orderCount = shopData?.lastOrderCount ?? 0;
    lastAnalyzedAt = shopData?.lastAnalyzedAt?.toISOString() ?? null;
    currencySymbol = shopData?.currencySymbol ?? "£";
  } catch (error) {
    console.error("[app._index loader] Error loading decisions (non-fatal):", error);
    // Continue with empty decisions - user can try "Refresh" button
  }

  return json({
    shop,
    orderCount,
    lastAnalyzedAt,
    currencySymbol,
    decisions: decisions.map((d) => ({
      id: d.id,
      type: d.type,
      headline: d.headline,
      actionTitle: d.actionTitle,
      reason: d.reason,
      impact: d.impact,
      confidence: d.confidence,
      generatedAt: d.generatedAt.toISOString(),
      dataJson: d.dataJson,
    })),
  });
};

export default function Index() {
  const { decisions, orderCount, currencySymbol } = useLoaderData<typeof loader>();
  const refreshFetcher = useFetcher();
  const decisionFetcher = useFetcher();
  const [expandedDecisions, setExpandedDecisions] = useState<Set<string>>(new Set());

  const isRefreshing = refreshFetcher.state !== "idle";

  const toggleNumbers = (decisionId: string) => {
    setExpandedDecisions((prev) => {
      const next = new Set(prev);
      if (next.has(decisionId)) {
        next.delete(decisionId);
      } else {
        next.add(decisionId);
      }
      return next;
    });
  };

  // Automatic refresh when page loads with no decisions
  useEffect(() => {
    if (decisions.length === 0 && refreshFetcher.state === "idle" && !refreshFetcher.data) {
      // Automatically trigger refresh on initial load when no decisions exist
      refreshFetcher.submit({}, { method: "post", action: "/app/refresh" });
    }
  }, [decisions.length, refreshFetcher.state, refreshFetcher.data, refreshFetcher]);

  // Reload page after successful refresh
  useEffect(() => {
    if (refreshFetcher.state === "idle" && refreshFetcher.data) {
      // Refresh completed, reload decisions
      window.location.reload();
    }
  }, [refreshFetcher.state, refreshFetcher.data]);

  const handleMarkDone = (decisionId: string) => {
    decisionFetcher.submit(
      { decisionId, action: "done" },
      { method: "post", action: "/app/decision" }
    );
  };

  const handleMarkIgnored = (decisionId: string) => {
    decisionFetcher.submit(
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

  const formatCurrency = (value: number) => {
    return `${currencySymbol}${Math.abs(value).toFixed(2)}`;
  };

  const getNumbersTable = (decision: any) => {
    const data = decision.dataJson || {};

    const rows = [
      ["Revenue", formatCurrency(data.revenue || 0)],
      ["COGS", formatCurrency(data.cogs || 0)],
      ["Discounts", formatCurrency(data.discounts || 0)],
      ["Refunds", formatCurrency(data.refunds || 0)],
      ["Estimated shipping", formatCurrency(data.shipping || 0)],
      ["Net profit", data.netProfit < 0 ? `−${formatCurrency(data.netProfit)}` : formatCurrency(data.netProfit)],
    ];

    return (
      <DataTable
        columnContentTypes={["text", "numeric"]}
        headings={["Metric", "Last 90 days"]}
        rows={rows}
      />
    );
  };

  return (
    <Page
      title="Decisions"
      secondaryActions={[
        {
          content: "Settings",
          url: "/app/settings",
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          {decisions.length === 0 ? (
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  {isRefreshing ? "Analyzing your data..." : "No decisions yet"}
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  {isRefreshing
                    ? "We're analyzing your Shopify orders to find profit opportunities. This may take a moment..."
                    : orderCount > 0
                    ? `We analyzed ${orderCount} orders from the last 90 days but haven't found any profit opportunities yet. This is good - your margins look healthy!`
                    : "We haven't analyzed your data yet. We'll automatically check your orders when you first load the app."}
                </Text>
                {orderCount > 0 && !isRefreshing && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    For best results, we recommend having 100+ orders. Check back as you get more sales.
                  </Text>
                )}
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
                      <Button
                        onClick={() => toggleNumbers(decision.id)}
                        disclosure={expandedDecisions.has(decision.id) ? "up" : "down"}
                      >
                        See numbers
                      </Button>
                    </InlineStack>

                    <Collapsible
                      open={expandedDecisions.has(decision.id)}
                      id={`numbers-${decision.id}`}
                      transition={{ duration: "200ms", timingFunction: "ease-in-out" }}
                    >
                      <BlockStack gap="300">
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Detailed breakdown (last 90 days):
                        </Text>
                        {getNumbersTable(decision)}
                      </BlockStack>
                    </Collapsible>
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
