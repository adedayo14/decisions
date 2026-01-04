const EMPTY_RESPONSE_SNIPPET = "\"size\":0";

export function formatRefreshErrorMessage(raw: unknown): string {
  const message =
    typeof raw === "string"
      ? raw
      : raw instanceof Error
      ? raw.message
      : JSON.stringify(raw ?? "");

  if (message.includes(EMPTY_RESPONSE_SNIPPET)) {
    return "Refresh failed: Shopify returned an empty response. Please retry.";
  }

  return `Refresh failed: ${message}`;
}
