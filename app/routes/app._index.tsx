import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useLocation, useSearchParams } from "@remix-run/react";
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
  EmptyState,
  ChoiceList,
  Select,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getActiveDecisions } from "../services/decision-rules.server";
import { prisma } from "../db.server";
import { useEffect, useState, useCallback } from "react";
import { buildOutcomeMetricsLine } from "../utils/decision-ui";

const MIN_ORDERS_FOR_DECISIONS = 30;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  console.log("[app._index loader] Authenticated shop:", shop);

  // Parse URL search params for filters
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") || "active";
  const typeFilter = url.searchParams.get("type") || "all";
  const confidenceFilter = url.searchParams.get("confidence") || "all";
  const sortBy = url.searchParams.get("sort") || "impact";

  // Load decisions with fallback - don't crash if DB has issues
  let decisions: any[] = [];
  let orderCount = 0;
  let lastAnalyzedAt: string | null = null;
  let currencySymbol = "£"; // Default fallback
  let cogsCount = 0;
  let minImpactThreshold = 50;
  let decisionOutcomes: any[] = [];
  let doneDecisionsCount = 0;
  let improvedDecisionsCount = 0;
  let evaluatedOutcomesCount = 0;

  try {
    // Build filter conditions
    const where: any = { shop };

    // Status filter
    if (statusFilter !== "all") {
      where.status = statusFilter;
    }

    // Type filter
    if (typeFilter !== "all") {
      where.type = typeFilter;
    }

    // Confidence filter
    if (confidenceFilter !== "all") {
      where.confidence = confidenceFilter;
    }

    // Build sort order
    const orderBy: any[] = [];
    if (sortBy === "impact") {
      orderBy.push({ impact: "desc" });
    } else if (sortBy === "confidence") {
      // Sort: high > medium > low
      orderBy.push({ confidence: "desc" });
      orderBy.push({ impact: "desc" });
    } else if (sortBy === "newest") {
      orderBy.push({ generatedAt: "desc" });
    }

    decisions = await prisma.decision.findMany({
      where,
      orderBy,
    });

    console.log("[app._index loader] Found decisions:", decisions.length);

    // Get shop stats and currency
    const shopData = await prisma.shop.findUnique({
      where: { shop },
      select: {
        lastOrderCount: true,
        lastAnalyzedAt: true,
        currencySymbol: true,
        minImpactThreshold: true,
      },
    });

    orderCount = shopData?.lastOrderCount ?? 0;
    lastAnalyzedAt = shopData?.lastAnalyzedAt?.toISOString() ?? null;
    currencySymbol = shopData?.currencySymbol ?? "£";
    minImpactThreshold = shopData?.minImpactThreshold ?? 50;

    cogsCount = await prisma.cOGS.count({ where: { shop } });

    if (decisions.length > 0) {
      decisionOutcomes = await prisma.decisionOutcome.findMany({
        where: {
          decisionId: { in: decisions.map((decision) => decision.id) },
        },
      });
    }

    doneDecisionsCount = await prisma.decision.count({
      where: { shop, status: "done" },
    });

    if (decisions.length > 0) {
      const decisionIdList = decisions.map((decision) => decision.id);
      improvedDecisionsCount = await prisma.decisionOutcome.count({
        where: {
          decisionId: { in: decisionIdList },
          outcomeStatus: "improved",
        },
      });
      evaluatedOutcomesCount = await prisma.decisionOutcome.count({
        where: {
          decisionId: { in: decisionIdList },
          evaluatedAt: { not: null },
        },
      });
    }
  } catch (error) {
    console.error("[app._index loader] Error loading decisions (non-fatal):", error);
    // Continue with empty decisions - user can try "Refresh" button
  }

  const outcomesByDecision = new Map(
    decisionOutcomes.map((outcome) => [outcome.decisionId, outcome])
  );

  const now = new Date();

  return json({
    shop,
    orderCount,
    lastAnalyzedAt,
    cogsCount,
    minOrdersRequired: MIN_ORDERS_FOR_DECISIONS,
    minImpactThreshold,
    currencySymbol,
    doneDecisionsCount,
    improvedDecisionsCount,
    evaluatedOutcomesCount,
    filters: {
      status: statusFilter,
      type: typeFilter,
      confidence: confidenceFilter,
      sort: sortBy,
    },
    decisions: decisions.map((d) => ({
      id: d.id,
      type: d.type,
      status: d.status,
      headline: d.headline,
      actionTitle: d.actionTitle,
      reason: d.reason,
      impact: d.impact,
      confidence: d.confidence,
      generatedAt: d.generatedAt.toISOString(),
      dataJson: d.dataJson,
      completedAt: d.completedAt?.toISOString() ?? null,
      outcome: (() => {
        const outcome = outcomesByDecision.get(d.id);
        if (!outcome || d.status !== "done") {
          return null;
        }

        const windowDays = outcome.windowDays ?? 30;
        if (!outcome.evaluatedAt || !outcome.postMetrics) {
          if (!d.completedAt) return null;
          const end = new Date(d.completedAt);
          end.setDate(end.getDate() + windowDays);
          const msRemaining = end.getTime() - now.getTime();
          const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
          return {
            status: "tracking",
            message: `Still tracking outcome (${daysRemaining} days remaining).`,
          };
        }

        const baseline = outcome.baselineMetrics as any;
        const post = outcome.postMetrics as any;
        const delta = (post.netProfitPerOrder ?? 0) - (baseline.netProfitPerOrder ?? 0);
        const baselineValue = baseline.netProfitPerOrder ?? 0;
        const postValue = post.netProfitPerOrder ?? 0;
        const formatSigned = (value: number) => {
          const formatted = `${currencySymbol}${Math.abs(value).toFixed(2)}`;
          return value < 0 ? `-${formatted}` : formatted;
        };
        const storyLine = `Profit/order: ${formatSigned(baselineValue)} → ${formatSigned(postValue)}`;
        const deltaSigned = `${delta < 0 ? "-" : ""}${currencySymbol}${Math.abs(delta).toFixed(2)}`;
        const outcomeLine = `After you acted, net profit per order changed by ${deltaSigned} over ${windowDays} days.`;
        const metricsLine = buildOutcomeMetricsLine(baseline, post, currencySymbol);

        if (outcome.outcomeStatus === "improved") {
          return {
            status: "improved",
            storyLine,
            metricsLine,
            message: outcomeLine,
          };
        }
        if (outcome.outcomeStatus === "worsened") {
          return {
            status: "worsened",
            storyLine,
            metricsLine,
            message: outcomeLine,
          };
        }
        return {
          status: "no_change",
          storyLine,
          metricsLine,
          message: outcomeLine,
        };
      })(),
    })),
  });
};

export default function Index() {
  const {
    decisions,
    orderCount,
    lastAnalyzedAt,
    cogsCount,
    minOrdersRequired,
    minImpactThreshold,
    currencySymbol,
    doneDecisionsCount,
    improvedDecisionsCount,
    evaluatedOutcomesCount,
    filters,
  } =
    useLoaderData<typeof loader>();
  const refreshFetcher = useFetcher();
  const decisionFetcher = useFetcher();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [expandedDecisions, setExpandedDecisions] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const isRefreshing = refreshFetcher.state !== "idle";
  const refreshError =
    refreshFetcher.data && "error" in refreshFetcher.data ? refreshFetcher.data.error : null;
  const search = location.search;
  const refreshAction = `/app/refresh${search}`;
  const settingsUrl = `/app/settings${search}`;
  const historyUrl = `/app/history${search}`;
  const shouldAutoRefresh = decisions.length === 0 && !lastAnalyzedAt;
  const showCogsWarning = !isRefreshing && cogsCount === 0 && decisions.length > 0;

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

  useEffect(() => {
    if (decisions.length === 0) return;
    if (typeof window === "undefined") return;
    const autoOpenKey = "decisionsNumbersAutoOpen_v3";
    const hasOpened = window.localStorage.getItem(autoOpenKey);
    if (hasOpened) return;
    setExpandedDecisions(new Set([decisions[0].id]));
    window.localStorage.setItem(autoOpenKey, "true");
  }, [decisions]);

  const getMomentumLine = () => {
    if (doneDecisionsCount > 0 && evaluatedOutcomesCount === 0) {
      return `You acted on ${doneDecisionsCount} decisions. Outcomes are still evaluating.`;
    }
    if (doneDecisionsCount > 0) {
      return `You acted on ${doneDecisionsCount} decisions, ${improvedDecisionsCount} improved.`;
    }
    return "No actions yet.";
  };

  const getMomentumBadge = () => {
    if (improvedDecisionsCount > 0) {
      return <Badge tone="success">Improving</Badge>;
    }
    if (doneDecisionsCount > 0) {
      return <Badge tone="attention">Evaluating</Badge>;
    }
    return <Badge tone="subdued">No actions yet</Badge>;
  };

  const formatImpactHeadline = (impact: number) => {
    const rounded = Math.round(impact);
    return `${currencySymbol}${rounded}/month at risk`;
  };

  const splitAlternativeAction = (actionTitle: string) => {
    const marker = " (or ";
    const idx = actionTitle.indexOf(marker);
    if (idx === -1) return { primary: actionTitle, alternative: null as string | null };

    const primary = actionTitle.slice(0, idx).trim();
    let alternative = actionTitle.slice(idx + marker.length).trim();

    if (alternative.endsWith(")")) alternative = alternative.slice(0, -1).trim();

    return { primary, alternative: alternative ? `Alternative: ${alternative}` : null };
  };

  const getRunBadges = () => {
    const badges: JSX.Element[] = [];
    badges.push(
      <Badge key="count" tone="subdued">
        {decisions.length} decision{decisions.length === 1 ? "" : "s"} surfaced
      </Badge>
    );
    if (filters.confidence !== "all") {
      badges.push(
        <Badge key="confidence" tone="subdued">
          {filters.confidence} confidence
        </Badge>
      );
    }
    return badges;
  };

  // Automatic refresh when page loads with no prior analysis
  useEffect(() => {
    if (shouldAutoRefresh && refreshFetcher.state === "idle" && !refreshFetcher.data) {
      // Automatically trigger refresh on initial load when no analysis exists
      refreshFetcher.submit({}, { method: "post", action: refreshAction });
    }
  }, [shouldAutoRefresh, refreshFetcher.state, refreshFetcher.data, refreshFetcher, refreshAction]);

  // Reload page after successful refresh
  useEffect(() => {
    if (refreshFetcher.state === "idle" && refreshFetcher.data && !refreshError) {
      // Refresh completed, reload decisions
      window.location.assign(`${location.pathname}${location.search}`);
    }
  }, [refreshFetcher.state, refreshFetcher.data, refreshError, location.pathname, location.search]);

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

  const handleFilterChange = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

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
    const netProfit = Number(data.netProfit ?? 0);
    const netProfitText =
      netProfit < 0 ? `-${formatCurrency(netProfit)}` : formatCurrency(netProfit);
    const netProfitTone = netProfit < 0 ? "critical" : "success";

    const rows = [
      ["Revenue", formatCurrency(data.revenue || 0)],
      ["COGS", formatCurrency(data.cogs || 0)],
      ["Discounts", formatCurrency(data.discounts || 0)],
      ["Refunds", formatCurrency(data.refunds || 0)],
      ["Estimated shipping", formatCurrency(data.shipping || 0)],
      ["Net profit", netProfitText],
    ];

    return (
      <BlockStack gap="200">
        {(data.runRateContext || data.salesPaceContext) && (
          <Banner tone="info">
            <Text as="p" variant="bodySm">
              {data.runRateContext || data.salesPaceContext}
            </Text>
          </Banner>
        )}
        {data.seasonalContext && (
          <Banner tone="warning">
            <Text as="p" variant="bodySm">
              {data.seasonalContext}
            </Text>
          </Banner>
        )}
        <Banner tone={netProfitTone}>
          <Text as="p" variant="bodySm">
            Net profit {netProfit < 0 ? "loss" : "gain"}: {netProfitText}
          </Text>
        </Banner>
        <DataTable
          columnContentTypes={["text", "numeric"]}
          headings={["Metric", "Last 90 days"]}
          rows={rows}
        />
        {decision.dataJson?.confidenceHistoryRate !== null &&
          decision.dataJson?.confidenceHistoryTotal >= 5 && (
            <Text as="p" variant="bodySm" tone="subdued">
              Decisions like this have improved outcomes ~{Math.round(decision.dataJson.confidenceHistoryRate * 100)}% of the time for your store.
            </Text>
          )}
        <Text as="p" variant="bodySm" tone="subdued">
          Note: Refunds are counted when processed, not when originally ordered. Shipping costs are estimated per order.
        </Text>
      </BlockStack>
    );
  };

  return (
    <Page
      title="Decisions"
      primaryAction={{
        content: isRefreshing ? "Analyzing..." : "Refresh analysis",
        onAction: () => refreshFetcher.submit({}, { method: "post", action: refreshAction }),
        loading: isRefreshing,
      }}
      secondaryActions={[
        {
          content: "History",
          url: historyUrl,
        },
        {
          content: "Settings",
          url: settingsUrl,
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="200">
            {refreshError && (
              <Banner tone="critical">
                <Text as="p" variant="bodyMd">
                  Refresh failed: {refreshError}
                </Text>
              </Banner>
            )}
            {showCogsWarning && (
              <Banner tone="warning">
                <Text as="p" variant="bodyMd">
                  No product costs found. Add costs in Shopify or upload a CSV to unlock profit-based
                  decisions.
                </Text>
              </Banner>
            )}
          </BlockStack>

          {/* v2: Filters and Sorting */}
          {!shouldAutoRefresh && (
            <BlockStack gap="300">
              <InlineStack gap="300" wrap={true}>
                <Card>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Momentum
                    </Text>
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="p" variant="bodyMd">
                        {getMomentumLine()}
                      </Text>
                      {getMomentumBadge()}
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Outcomes show only after the evaluation window. No claims, just Before → After.
                    </Text>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      This run
                    </Text>
                    <InlineStack gap="200" wrap={true}>
                      {getRunBadges()}
                      <Badge tone="subdued">
                        Minimum impact: {currencySymbol}{minImpactThreshold.toFixed(0)}/month
                      </Badge>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      If nothing meets your threshold, this page stays quiet by design.
                    </Text>
                  </BlockStack>
                </Card>
              </InlineStack>

              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" wrap={false}>
                    <Text as="h2" variant="headingMd">
                      Filters
                    </Text>
                    <Button
                      onClick={() => setShowFilters(!showFilters)}
                      disclosure={showFilters ? "up" : "down"}
                    >
                      {showFilters ? "Hide" : "Show"} filters
                    </Button>
                  </InlineStack>

                  <Collapsible
                    open={showFilters}
                    id="filters"
                    transition={{ duration: "200ms", timingFunction: "ease-in-out" }}
                  >
                    <BlockStack gap="400">
                      <InlineStack gap="400" wrap={true}>
                        <div style={{ minWidth: "200px" }}>
                          <Select
                            label="Status"
                            options={[
                              { label: "Open", value: "active" },
                              { label: "Done", value: "done" },
                              { label: "Ignored", value: "ignored" },
                              { label: "All", value: "all" },
                            ]}
                            value={filters.status}
                            onChange={(value) => handleFilterChange("status", value)}
                          />
                        </div>
                        <div style={{ minWidth: "200px" }}>
                          <Select
                            label="Type"
                            options={[
                              { label: "All types", value: "all" },
                              { label: "Best-seller loss", value: "best_seller_loss" },
                              { label: "Free shipping trap", value: "free_shipping_trap" },
                              { label: "Discount-refund hit", value: "discount_refund_hit" },
                            ]}
                            value={filters.type}
                            onChange={(value) => handleFilterChange("type", value)}
                          />
                        </div>
                        <div style={{ minWidth: "200px" }}>
                          <Select
                            label="Confidence"
                            options={[
                              { label: "All confidence", value: "all" },
                              { label: "High", value: "high" },
                              { label: "Medium", value: "medium" },
                              { label: "Low", value: "low" },
                            ]}
                            value={filters.confidence}
                            onChange={(value) => handleFilterChange("confidence", value)}
                          />
                        </div>
                        <div style={{ minWidth: "200px" }}>
                          <Select
                            label="Sort by"
                            options={[
                              { label: "Impact (highest first)", value: "impact" },
                              { label: "Confidence", value: "confidence" },
                              { label: "Newest first", value: "newest" },
                            ]}
                            value={filters.sort}
                            onChange={(value) => handleFilterChange("sort", value)}
                          />
                        </div>
                      </InlineStack>
                    </BlockStack>
                  </Collapsible>
                </BlockStack>
              </Card>

              <Text as="p" variant="bodySm" tone="subdued">
                Showing {decisions.length} decision{decisions.length > 1 ? "s" : ""}. Minimum impact: {currencySymbol}{minImpactThreshold.toFixed(0)}/month.
              </Text>
            </BlockStack>
          )}

          {decisions.length === 0 ? (
            <Card>
              <EmptyState
                heading={isRefreshing ? "Analyzing your data..." : "No decisions yet"}
                action={{
                  content: "Refresh analysis",
                  onAction: () => refreshFetcher.submit({}, { method: "post", action: refreshAction }),
                  loading: isRefreshing,
                }}
                secondaryAction={{
                  content: "Update settings",
                  url: settingsUrl,
                }}
              >
                <BlockStack gap="300">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {isRefreshing
                      ? "We're analyzing your Shopify orders to find profit opportunities. This may take a moment..."
                      : lastAnalyzedAt
                      ? `We analyzed ${orderCount} orders from the last 90 days but haven't found any profit opportunities yet.`
                      : "We haven't analyzed your data yet. We'll automatically check your orders when you first load the app."}
                  </Text>
                  {!isRefreshing && orderCount > 0 && orderCount < minOrdersRequired && (
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Not enough evidence yet. We need at least {minOrdersRequired} orders to spot
                      reliable patterns.
                    </Text>
                  )}
                  {!isRefreshing && orderCount >= minOrdersRequired && (
                    <Text as="p" variant="bodyMd" tone="subdued">
                      This is good news - your margins look healthy. We'll surface new opportunities
                      as your data grows.
                    </Text>
                  )}
                  {!isRefreshing && cogsCount === 0 && (
                    <Text as="p" variant="bodyMd" tone="subdued">
                      We couldn't find any product costs yet. Add costs in Shopify or upload a CSV
                      to unlock profit-based decisions.
                    </Text>
                  )}
                  {!isRefreshing && (
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Showing only decisions worth at least {currencySymbol}{minImpactThreshold.toFixed(0)}/month (change in Settings).
                    </Text>
                  )}
                  {orderCount > 0 && !isRefreshing && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      For best results, we recommend having 100+ orders. Check back as you get more
                      sales.
                    </Text>
                  )}
                </BlockStack>
              </EmptyState>
            </Card>
          ) : (
            <BlockStack gap="400">
              {decisions.map((decision) => (
                <Card key={decision.id}>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center" wrap={true}>
                      <Text as="h2" variant="headingLg">
                        {formatImpactHeadline(decision.impact)}
                      </Text>
                      {getConfidenceBadge(decision.confidence)}
                    </InlineStack>

                    {(() => {
                      const { primary, alternative } = splitAlternativeAction(decision.actionTitle);

                      return (
                        <BlockStack gap="200">
                          <Text as="p" variant="headingMd">
                            {primary}
                          </Text>
                          {alternative && (
                            <InlineStack gap="200" wrap={true}>
                              <Badge tone="subdued">{alternative}</Badge>
                            </InlineStack>
                          )}
                          <Text as="p" variant="bodyMd" tone="subdued">
                            {decision.reason}
                          </Text>

                          {decision.dataJson?.whyNowMessage && (
                            <InlineStack>
                              <Badge tone="attention">This got worse in the last 30 days</Badge>
                            </InlineStack>
                          )}

                          {decision.dataJson?.isResurfaced && decision.dataJson?.resurfacedFromImpact && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              You ignored this earlier. Impact grew from {formatCurrency(decision.dataJson.resurfacedFromImpact)} to{" "}
                              {formatCurrency(decision.impact)}.
                            </Text>
                          )}
                        </BlockStack>
                      );
                    })()}

                    {decision.outcome?.metricsLine && (
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" tone="subdued">
                          {decision.outcome.metricsLine}
                        </Text>

                        {decision.outcome?.status === "improved" && (
                          <Text as="p" variant="bodySm" tone="success">
                            Verdict: improved over {decision.dataJson?.windowDays ?? 30} days.
                          </Text>
                        )}
                        {decision.outcome?.status === "no_change" && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            Verdict: no clear change yet.
                          </Text>
                        )}
                        {decision.outcome?.status === "worsened" && (
                          <Text as="p" variant="bodySm" tone="critical">
                            Verdict: worsened over {decision.dataJson?.windowDays ?? 30} days.
                          </Text>
                        )}
                      </BlockStack>
                    )}

                    {decision.outcome?.status === "tracking" && (
                      <Text as="p" variant="bodySm" tone="subdued">
                        {decision.outcome.message}
                      </Text>
                    )}

                    <InlineStack gap="200" wrap={true}>
                      <Button variant="primary" onClick={() => handleMarkDone(decision.id)}>
                        Mark as done
                      </Button>

                      <Button variant="tertiary" onClick={() => handleMarkIgnored(decision.id)}>
                        Ignore
                      </Button>

                      <Button
                        variant="tertiary"
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
