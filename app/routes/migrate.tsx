import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Database Migration Endpoint
 *
 * SECURITY: This endpoint should be protected in production.
 * Set MIGRATION_SECRET in Vercel environment variables and require it as a query param.
 *
 * Usage:
 *   https://decisions-seven.vercel.app/migrate?secret=YOUR_MIGRATION_SECRET
 *
 * This runs `prisma db push` to create/update database tables based on schema.prisma
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  // Check for migration secret in production
  const expectedSecret = process.env.MIGRATION_SECRET;

  if (expectedSecret && secret !== expectedSecret) {
    return json(
      {
        status: "error",
        message: "Unauthorized. Set ?secret=YOUR_MIGRATION_SECRET query parameter",
        hint: "Configure MIGRATION_SECRET in Vercel environment variables"
      },
      { status: 401 }
    );
  }

  try {
    console.log("[migrate] Starting database migration...");

    // Run prisma db push to sync schema to database
    const { stdout, stderr } = await execAsync("npx prisma db push --accept-data-loss");

    console.log("[migrate] Migration stdout:", stdout);
    if (stderr) {
      console.log("[migrate] Migration stderr:", stderr);
    }

    return json({
      status: "success",
      message: "Database migration completed successfully",
      output: stdout,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[migrate] Migration failed:", error);

    return json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        hint: "Check Vercel logs for details. Ensure DATABASE_URL is set correctly.",
        error: error instanceof Error ? error.stack : String(error),
      },
      { status: 500 }
    );
  }
}
