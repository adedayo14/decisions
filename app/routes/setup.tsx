import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { prisma } from "../db.server";

/**
 * Setup route to verify database connectivity
 * Access this route after deployment to ensure Prisma is working
 */
export async function loader({ request: _request }: LoaderFunctionArgs) {
  try {
    // Test database connection
    await prisma.$connect();

    // Count sessions to verify tables exist
    const sessionCount = await prisma.session.count();

    return json({
      status: "ok",
      message: "Database connected successfully",
      sessionCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        hint: "Run 'npx prisma db push' to create database tables",
      },
      { status: 500 }
    );
  }
}
