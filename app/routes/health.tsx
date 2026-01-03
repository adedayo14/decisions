import { json } from "@remix-run/node";
import { prisma } from "../db.server";

export async function loader() {
  try {
    // Test database connection and check if tables exist
    await prisma.$connect();

    const sessionCount = await prisma.session.count();
    const shopCount = await prisma.shop.count();

    return json({
      status: "healthy",
      database: "connected",
      tables: {
        sessions: sessionCount,
        shops: shopCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return json(
      {
        status: "error",
        database: "connection_failed",
        error: error instanceof Error ? error.message : "Unknown error",
        hint: "Database tables may not be initialized. Run: npx prisma db push",
      },
      { status: 500 }
    );
  }
}
