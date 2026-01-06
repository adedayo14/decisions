import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useLocation, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Box,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Banner,
  Divider,
  Collapsible,
  DataTable,
  EmptyState,
  Select,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { getCachedData } from "../services/data-cache.server";
import type { VariantCostData } from "../services/shopify-data.server";
import { useEffect, useState, useCallback } from "react";
import { buildOutcomeMetricsLine } from "../utils/decision-ui";
import styles from "../styles/decisions.css?url";

const MIN_ORDERS_FOR_DECISIONS = 30;

export const links = () => [{ rel: "stylesheet", href: styles }];

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
  let missingCogsCount = 0;

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

    const cachedVariants = await getCachedData<VariantCostData[]>(
      shop,
      "variant_costs"
    );
    if (cachedVariants && cachedVariants.length > 0) {
      const variantIds = cachedVariants.map((variant) => variant.variantId);
      const cogsRows = await prisma.cOGS.findMany({
        where: {
          shop,
          variantId: { in: variantIds },
        },
        select: { variantId: true },
      });
      const cogsSet = new Set(cogsRows.map((row) => row.variantId));
      missingCogsCount = variantIds.filter((id) => !cogsSet.has(id)).length;
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
    missingCogsCount,
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
    minImpactThreshold,
    currencySymbol,
    doneDecisionsCount,
    improvedDecisionsCount,
    evaluatedOutcomesCount,
    missingCogsCount,
    filters,
  } =
    useLoaderData<typeof loader>();
  const refreshFetcher = useFetcher();
  const decisionFetcher = useFetcher();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [expandedDecisions, setExpandedDecisions] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);

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

    // Shorten "raise price by" to just the amount with +
    const priceMatch = alternative.match(/raise price by (.*?) per unit/);
    if (priceMatch) {
      return { primary, alternative: `Alternative: +${priceMatch[1]} per unit` };
    }

    return { primary, alternative: alternative ? `Alternative: ${alternative}` : null };
  };

  const formatReason = (reason: string) => {
    if (!reason) return reason;
    let simplified = reason.replace(/\([^)]*\)/g, "");
    simplified = simplified.replace(/[£$€]\s?\d[\d,]*(\.\d{1,2})?/g, "");
    simplified = simplified.replace(/\s{2,}/g, " ").trim();
    if (!simplified) return reason;
    if (!simplified.endsWith(".")) return `${simplified}.`;
    return simplified;
  };

  const getCurrentExposureImpact = () => {
    if (decisions.length === 0) return `${currencySymbol}0/month at risk`;
    return formatImpactHeadline(decisions[0].impact);
  };

  const getStatusValue = () => {
    if (improvedDecisionsCount > 0) {
      return "Improving";
    }
    if (doneDecisionsCount > 0) {
      return `Evaluating outcomes from ${doneDecisionsCount} action${doneDecisionsCount === 1 ? "" : "s"}.`;
    }
    return "Monitoring";
  };

  const getCadenceLine = () => {
    if (!lastAnalyzedAt) {
      return "Next automatic refresh in 1 day.";
    }
    const analyzedAt = new Date(lastAnalyzedAt);
    const daysSince = Math.max(
      0,
      Math.round((Date.now() - analyzedAt.getTime()) / (1000 * 60 * 60 * 24))
    );
    return `Last analysed ${daysSince} day${daysSince === 1 ? "" : "s"} ago.`;
  };

  const getFreshnessValue = () => {
    if (!lastAnalyzedAt) {
      return "Next automatic refresh in 1 day.";
    }
    const analyzedAt = new Date(lastAnalyzedAt);
    const daysSince = Math.max(
      0,
      Math.round((Date.now() - analyzedAt.getTime()) / (1000 * 60 * 60 * 24))
    );
    return `${daysSince} day${daysSince === 1 ? "" : "s"} ago.`;
  };

  const getDecisionContextLabel = (type: string) => {
    switch (type) {
      case "best_seller_loss":
        return "Best-seller loss (ghost winner)";
      case "free_shipping_trap":
        return "Free-shipping trap";
      case "discount_refund_hit":
        return "Discount-refund hit";
      default:
        return "Decision";
    }
  };

  const getImpactLabel = (confidence: string) => {
    switch (confidence) {
      case "high":
        return "High impact";
      case "medium":
        return "Medium impact";
      case "low":
        return "Low impact";
      default:
        return "Impact";
    }
  };

  const formatConfidenceLabel = (confidence: string) => {
    if (!confidence) return "Unknown";
    return confidence.charAt(0).toUpperCase() + confidence.slice(1);
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

  const formatCurrency = (value: number) => {
    return `${currencySymbol}${Math.abs(value).toFixed(2)}`;
  };

  const formatSignedCurrency = (value: number) => {
    const formatted = `${currencySymbol}${Math.abs(value).toFixed(2)}`;
    return value < 0 ? `-${formatted}` : formatted;
  };

  const getNumbersTable = (decision: any) => {
    const data = decision.dataJson || {};
    const netProfit = Number(data.netProfit ?? 0);
    const netProfitText = formatSignedCurrency(netProfit);
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
          Confidence: {formatConfidenceLabel(decision.confidence)}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          Note: Refunds are counted when processed, not when originally ordered. Shipping is estimated per order using your assumption and split across items.
        </Text>
      </BlockStack>
    );
  };

  const alertsCount = decisions.reduce(
    (total, decision) => total + (decision.dataJson?.alertsCount ?? 0),
    0
  );
  const hasAlerts = alertsCount > 0;
  const showExposureCard = decisions.length > 1;

  return (
    <Page
      title="Decisions"
      subtitle="We monitor margins continuously and only interrupt when the numbers justify it."
      fullWidth
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
          </BlockStack>

          {/* v2: Filters and Sorting */}
          {!shouldAutoRefresh && (
            <BlockStack gap="400">
              <div className={`overviewRow ${showExposureCard ? "" : "overviewRow--single"}`}>
                {showExposureCard && (
                  <Card className="exposureCard">
                    <div className="cardInner">
                      <Text as="p" variant="bodySm" tone="subdued" className="eyebrow">
                        Current exposure
                      </Text>
                      <div className="exposureAmount">
                        <span className="exposureValue">{getCurrentExposureImpact()}</span>
                      </div>
                      <div className="exposureDivider" />
                      <div className="exposureMeta">
                        <span>Threshold: {currencySymbol}{minImpactThreshold.toFixed(0)}/month</span>
                        <span>Scope: Actions only</span>
                      </div>
                    </div>
                  </Card>
                )}
                <Card>
                  <div className="cardInner">
                    <div className="monitorHead">
                      <Text as="p" variant="bodySm" tone="subdued" className="eyebrow">
                        Monitor
                      </Text>
                      <span className={`pill ${hasAlerts ? "alert" : ""}`}>
                        {alertsCount} alert{alertsCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="monitorAlertBox">
                      {!hasAlerts && (
                        <>
                          <Text as="p" variant="headingSm">
                            No changes detected
                          </Text>
                          <Text as="p" variant="bodyMd" tone="subdued">
                            No change since the last check.
                          </Text>
                        </>
                      )}
                      {hasAlerts && (
                        <>
                          <Text as="p" variant="headingSm">
                            New alerts
                          </Text>
                          <Text as="p" variant="bodyMd" tone="subdued">
                            Something changed since the last check.
                          </Text>
                          <Button variant="plain" onClick={() => setShowAlerts(true)}>
                            View alerts
                          </Button>
                        </>
                      )}
                    </div>
                    <div className="monitorRows">
                      <div className="monitorRow">
                        <span className="monitorLabel">Status</span>
                        <span className="monitorValue">{getStatusValue()}</span>
                      </div>
                      <div className="monitorRow">
                        <span className="monitorLabel">Last analysed</span>
                        <span className="monitorValue">{getFreshnessValue()}</span>
                      </div>
                      <div className="monitorRow">
                        <span className="monitorLabel">Data coverage</span>
                        <span className="monitorValue">
                          COGS missing for {missingCogsCount} product{missingCogsCount === 1 ? "" : "s"} (excluded).{" "}
                          <Button variant="plain" url={settingsUrl}>
                            Add COGS
                          </Button>
                        </span>
                      </div>
                      <div className="monitorRow monitorRow--muted">
                        <span className="monitorLabel">Log</span>
                        <span className="monitorValue">90 days</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" wrap={false}>
                    <Text as="p" variant="bodySm" tone="subdued">
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
                    <BlockStack gap="300">
                      <div className="filtersGrid">
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
                    </BlockStack>
                  </Collapsible>
                </BlockStack>
              </Card>
            </BlockStack>
          )}

          {!shouldAutoRefresh && <Box paddingBlockStart="300" />}

          {decisions.length === 0 ? (
            <Card>
              <EmptyState
                heading={isRefreshing ? "Analysing data" : "No actions worth taking"}
                image=""
                action={{
                  content: "Refresh analysis",
                  onAction: () => refreshFetcher.submit({}, { method: "post", action: refreshAction }),
                  loading: isRefreshing,
                }}
                secondaryAction={{
                  content: "Settings",
                  url: settingsUrl,
                }}
              >
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {isRefreshing
                      ? "Analysing your orders..."
                      : lastAnalyzedAt && orderCount > 0
                      ? `We analysed ${orderCount} orders from the last 90 days and found no material profit leaks.`
                      : "We have not analysed your data yet."}
                  </Text>
                  {!isRefreshing && lastAnalyzedAt && (
                    <Text as="p" variant="bodyMd" tone="subdued">
                      This is a healthy state. We will surface new actions automatically if this changes.
                    </Text>
                  )}
                  {!isRefreshing && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Only decisions worth at least {currencySymbol}{minImpactThreshold.toFixed(0)}/month are shown. You can change this in Settings.
                    </Text>
                  )}
                </BlockStack>
              </EmptyState>
            </Card>
          ) : (
            <BlockStack gap="400">
              {decisions.slice(0, 3).map((decision) => {
                const { primary, alternative } = splitAlternativeAction(decision.actionTitle);

                return (
                  <Card key={decision.id}>
                    <div className="cardInner decisionCard">
                      <div className="decisionTop">
                        <Text as="p" variant="bodySm" tone="subdued" className="decisionContext">
                          {getDecisionContextLabel(decision.type)}
                        </Text>
                        <span className={`impactPill impactPill--${decision.confidence}`}>
                          {getImpactLabel(decision.confidence)}
                        </span>
                      </div>
                    <Text as="p" variant="headingXl" className="decisionAmount">
                      {formatImpactHeadline(decision.impact)}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued" className="decisionConfidence">
                      Confidence: {formatConfidenceLabel(decision.confidence)}
                    </Text>
                    <Text as="p" variant="headingLg" className="decisionTitle">
                      {primary}
                    </Text>
                      {alternative && (
                        <Text as="p" variant="bodySm" tone="subdued">
                          {alternative}
                        </Text>
                      )}
                      <Text as="p" variant="bodyMd" tone="subdued" className="decisionReason">
                        {formatReason(decision.reason)}
                      </Text>
                      {decision.dataJson?.whyNowMessage && (
                        <Text as="p" variant="bodySm" tone="subdued" className="decisionWhyNow">
                          Why now: {decision.dataJson.whyNowMessage || "This worsened in the last 30 days."}
                        </Text>
                      )}

                      {decision.outcome?.status && decision.outcome.status !== "tracking" && (
                        <BlockStack gap="100">
                          {decision.outcome?.storyLine && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              {decision.outcome.storyLine.replace("Profit/order:", "Profit per order")}
                            </Text>
                          )}
                          {decision.outcome?.metricsLine &&
                            decision.outcome.metricsLine.includes("Shipping loss/order") && (
                              <Text as="p" variant="bodySm" tone="subdued">
                                {decision.outcome.metricsLine
                                  .split(" · ")
                                  .find((line: string) => line.startsWith("Shipping loss/order"))
                                  ?.replace("Shipping loss/order:", "Shipping loss per order")}
                              </Text>
                            )}
                          {decision.outcome?.status === "improved" && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              Outcome: improved over {decision.dataJson?.windowDays ?? 30} days.
                            </Text>
                          )}
                          {decision.outcome?.status === "no_change" && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              Outcome: no clear change yet.
                            </Text>
                          )}
                          {decision.outcome?.status === "worsened" && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              Outcome: worsened over {decision.dataJson?.windowDays ?? 30} days.
                            </Text>
                          )}
                        </BlockStack>
                      )}

                      {decision.outcome?.status === "tracking" && (
                        <Text as="p" variant="bodySm" tone="subdued">
                          {decision.outcome.message}
                        </Text>
                      )}

                      <Divider />

                      <div className="decisionActions">
                        <Button variant="primary" onClick={() => handleMarkDone(decision.id)}>
                          Mark as done
                        </Button>
                        <Button
                          variant="plain"
                          onClick={() => toggleNumbers(decision.id)}
                          disclosure={expandedDecisions.has(decision.id) ? "up" : "down"}
                        >
                          See numbers
                        </Button>
                        <Button variant="plain" onClick={() => handleMarkIgnored(decision.id)}>
                          Ignore
                        </Button>
                      </div>

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
                    </div>
                  </Card>
                );
              })}
            </BlockStack>
          )}

          {hasAlerts && showAlerts && (
            <BlockStack gap="400">
              <Card>
                <div className="cardInner alertsCard">
                  <Text as="p" variant="headingMd">
                    Alerts
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Changes logged in the last 90 days. Alerts do not require action.
                  </Text>
                </div>
              </Card>
            </BlockStack>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
