import { type LoaderFunctionArgs } from "@remix-run/node";

export const loader = (_args: LoaderFunctionArgs) => {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "public, max-age=86400",
    },
  });
};
