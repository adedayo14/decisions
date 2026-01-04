import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useLocation, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Badge,
  InlineStack,
  Button,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "10");

  // Get decision runs
  const runs = await prisma.decisionRun.findMany({
    where: { shop },
    orderBy: { generatedAt: "desc" },
    take: limit,
  });

  // For each run, get its decisions
  const runsWithDecisions = await Promise.all(
    runs.map(async (run) => {
      const decisions = await prisma.decision.findMany({
        where: {
          shop,
          runId: run.id,
        },
        orderBy: { impact: "desc" },
      });

      return {
        id: run.id,
        generatedAt: run.generatedAt.toISOString(),
        orderCount: run.orderCount,
        windowDays: run.windowDays,
        decisionCount: decisions.length,
        decisions: decisions.map((d) => ({
          id: d.id,
          type: d.type,
          status: d.status,
          headline: d.headline,
          actionTitle: d.actionTitle,
          reason: d.reason,
          impact: d.impact,
          confidence: d.confidence,
          dataJson: d.dataJson,
          generatedAt: d.generatedAt.toISOString(),
        })),
      };
    })
  );

  const totalRuns = await prisma.decisionRun.count({
    where: { shop },
  });

  const shopSettings = await prisma.shop.findUnique({
    where: { shop },
    select: {
      currencySymbol: true,
    },
  });

  return json({
    runs: runsWithDecisions,
    totalRuns,
    limit,
    currencySymbol: shopSettings?.currencySymbol ?? "£",
  });
};

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDecisionTypeBadge(type: string) {
  switch (type) {
    case "best_seller_loss":
      return <Badge tone="critical">Best-seller loss</Badge>;
    case "free_shipping_trap":
      return <Badge tone="warning">Free shipping trap</Badge>;
    case "discount_refund_hit":
      return <Badge tone="attention">Discount-refund hit</Badge>;
    default:
      return <Badge>{type}</Badge>;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge tone="success">Open</Badge>;
    case "done":
      return <Badge>Done</Badge>;
    case "ignored":
      return <Badge tone="subdued">Ignored</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export default function History() {
  const { runs, totalRuns, limit, currencySymbol } = useLoaderData<typeof loader>();
  const location = useLocation();
  const search = location.search;

  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  const toggleRun = (runId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  return (
    <Page
      title="History"
      subtitle="Past analysis runs and decisions."
      backAction={{ url: `/app${search}` }}
      fullWidth
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <InlineStack gap="200" align="space-between">
                <Text as="p" variant="bodyMd" tone="subdued">
                  {runs.length} of {totalRuns} runs shown
                </Text>
                {runs.length < totalRuns && (
                  <Link to={`/app/history?limit=${limit + 10}${search}`}>
                    <Button>Load more</Button>
                  </Link>
                )}
              </InlineStack>
            </Card>

            {runs.length === 0 && (
              <Card>
                <Text as="p" variant="bodyMd" tone="subdued">
                  No runs yet. Analysis results appear here.
                </Text>
              </Card>
            )}

            {runs.map((run) => {
              const isExpanded = expandedRuns.has(run.id);

              return (
                <Card key={run.id}>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" wrap={false}>
                      <BlockStack gap="200">
                        <InlineStack gap="200">
                          <Text as="p" variant="headingMd">
                            {formatDate(run.generatedAt)}
                          </Text>
                          <Badge>{run.decisionCount} decisions</Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {run.orderCount} orders · {run.windowDays} day window
                        </Text>
                      </BlockStack>
                      <Button
                        onClick={() => toggleRun(run.id)}
                        variant="plain"
                      >
                        {isExpanded ? "Hide" : "Show"} decisions
                      </Button>
                    </InlineStack>

                    {isExpanded && (
                      <BlockStack gap="300">
                        {run.decisions.length === 0 && (
                          <Text as="p" variant="bodyMd" tone="subdued">
                            No decisions generated in this run.
                          </Text>
                        )}

                        {run.decisions.map((decision, index) => (
                          <div
                            key={decision.id}
                            style={{
                              padding: "12px",
                              borderLeft: index < 3 ? "3px solid #008060" : "3px solid #e3e3e3",
                              backgroundColor: index < 3 ? "#f6f6f7" : "transparent",
                            }}
                          >
                            <BlockStack gap="200">
                              <InlineStack gap="200" wrap={false} align="space-between">
                                <InlineStack gap="200">
                                  {getDecisionTypeBadge(decision.type)}
                                  {getStatusBadge(decision.status)}
                                  {index < 3 && <Badge tone="info">Top 3</Badge>}
                                </InlineStack>
                                <Text as="p" variant="bodyMd" fontWeight="semibold">
                                  {decision.headline}
                                </Text>
                              </InlineStack>

                              <Text as="p" variant="bodyMd" fontWeight="semibold">
                                {decision.actionTitle}
                              </Text>

                              <Text as="p" variant="bodySm" tone="subdued">
                                {decision.reason}
                              </Text>

                              <details>
                                <summary style={{ cursor: "pointer", fontSize: "12px", color: "#6d7175" }}>
                                  See numbers
                                </summary>
                                <div style={{ marginTop: "8px", fontSize: "12px", fontFamily: "monospace" }}>
                                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <tbody>
                                      {decision.dataJson.revenue !== undefined && (
                                        <tr>
                                          <td style={{ padding: "4px 0" }}>Revenue:</td>
                                          <td style={{ padding: "4px 0", textAlign: "right" }}>
                                            {currencySymbol}{decision.dataJson.revenue.toFixed(2)}
                                          </td>
                                        </tr>
                                      )}
                                      {decision.dataJson.cogs !== undefined && decision.dataJson.cogs > 0 && (
                                        <tr>
                                          <td style={{ padding: "4px 0" }}>COGS:</td>
                                          <td style={{ padding: "4px 0", textAlign: "right" }}>
                                            -{currencySymbol}{decision.dataJson.cogs.toFixed(2)}
                                          </td>
                                        </tr>
                                      )}
                                      {decision.dataJson.discounts !== undefined && decision.dataJson.discounts > 0 && (
                                        <tr>
                                          <td style={{ padding: "4px 0" }}>Discounts:</td>
                                          <td style={{ padding: "4px 0", textAlign: "right" }}>
                                            -{currencySymbol}{decision.dataJson.discounts.toFixed(2)}
                                          </td>
                                        </tr>
                                      )}
                                      {decision.dataJson.refunds !== undefined && decision.dataJson.refunds > 0 && (
                                        <tr>
                                          <td style={{ padding: "4px 0" }}>Refunds:</td>
                                          <td style={{ padding: "4px 0", textAlign: "right" }}>
                                            -{currencySymbol}{decision.dataJson.refunds.toFixed(2)}
                                          </td>
                                        </tr>
                                      )}
                                      {decision.dataJson.shipping !== undefined && decision.dataJson.shipping > 0 && (
                                        <tr>
                                          <td style={{ padding: "4px 0" }}>Shipping (est):</td>
                                          <td style={{ padding: "4px 0", textAlign: "right" }}>
                                            -{currencySymbol}{decision.dataJson.shipping.toFixed(2)}
                                          </td>
                                        </tr>
                                      )}
                                      <tr style={{ borderTop: "1px solid #e3e3e3" }}>
                                        <td style={{ padding: "4px 0", fontWeight: "bold" }}>Net profit:</td>
                                        <td
                                          style={{
                                            padding: "4px 0",
                                            textAlign: "right",
                                            fontWeight: "bold",
                                            color: decision.dataJson.netProfit >= 0 ? "#008060" : "#d72c0d",
                                          }}
                                        >
                                          {currencySymbol}{decision.dataJson.netProfit.toFixed(2)}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </details>
                            </BlockStack>
                          </div>
                        ))}
                      </BlockStack>
                    )}
                  </BlockStack>
                </Card>
              );
            })}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
