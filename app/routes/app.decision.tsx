import { type ActionFunctionArgs, redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { markDecisionDone, markDecisionIgnored } from "../services/decision-rules.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const decisionId = formData.get("decisionId") as string;
  const actionType = formData.get("action") as string;

  if (!decisionId || !actionType) {
    throw new Error("Missing decisionId or action");
  }

  if (actionType === "done") {
    await markDecisionDone(decisionId);
  } else if (actionType === "ignore") {
    await markDecisionIgnored(decisionId);
  }

  return redirect("/app");
};
