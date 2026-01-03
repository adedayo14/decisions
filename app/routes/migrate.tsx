import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { prisma } from "../db.server";

/**
 * Database Migration Endpoint
 *
 * SECURITY: This endpoint should be protected in production.
 * Set MIGRATION_SECRET in Vercel environment variables and require it as a query param.
 *
 * Usage:
 *   https://decisions-seven.vercel.app/migrate?secret=YOUR_MIGRATION_SECRET
 *
 * This creates database tables using raw SQL (works in serverless environments)
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

    // Create tables using raw SQL (Prisma schema converted to SQL)
    const migrations = [
      // Session table (required for Shopify session storage)
      `CREATE TABLE IF NOT EXISTS "Session" (
        "id" TEXT PRIMARY KEY,
        "shop" TEXT NOT NULL,
        "state" TEXT NOT NULL,
        "isOnline" BOOLEAN NOT NULL DEFAULT false,
        "scope" TEXT,
        "expires" TIMESTAMP,
        "accessToken" TEXT NOT NULL,
        "userId" BIGINT,
        "firstName" TEXT,
        "lastName" TEXT,
        "email" TEXT,
        "accountOwner" BOOLEAN NOT NULL DEFAULT false,
        "locale" TEXT,
        "collaborator" BOOLEAN DEFAULT false,
        "emailVerified" BOOLEAN DEFAULT false
      )`,

      // Shop table
      `CREATE TABLE IF NOT EXISTS "Shop" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "shop" TEXT UNIQUE NOT NULL,
        "currency" TEXT NOT NULL DEFAULT 'GBP',
        "currencySymbol" TEXT NOT NULL DEFAULT '£',
        "assumedShippingCost" DOUBLE PRECISION NOT NULL DEFAULT 3.50,
        "minImpactThreshold" DOUBLE PRECISION NOT NULL DEFAULT 50,
        "lastOrderCount" INTEGER,
        "lastAnalyzedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )`,

      // COGS table
      `CREATE TABLE IF NOT EXISTS "COGS" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "shop" TEXT NOT NULL,
        "variantId" TEXT NOT NULL,
        "costGbp" DOUBLE PRECISION NOT NULL,
        "source" TEXT NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE("shop", "variantId")
      )`,

      // Create indexes for COGS
      `CREATE INDEX IF NOT EXISTS "COGS_shop_idx" ON "COGS"("shop")`,
      `CREATE INDEX IF NOT EXISTS "COGS_shop_source_idx" ON "COGS"("shop", "source")`,

      // Decision table
      `CREATE TABLE IF NOT EXISTS "Decision" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "shop" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'active',
        "headline" TEXT NOT NULL,
        "actionTitle" TEXT NOT NULL,
        "reason" TEXT NOT NULL,
        "impact" DOUBLE PRECISION NOT NULL,
        "confidence" TEXT NOT NULL,
        "dataJson" JSONB NOT NULL,
        "runId" TEXT,
        "decisionKey" TEXT NOT NULL DEFAULT '',
        "resurfacedAt" TIMESTAMP,
        "generatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "completedAt" TIMESTAMP,
        "ignoredAt" TIMESTAMP
      )`,

      // Create indexes for Decision
      `CREATE INDEX IF NOT EXISTS "Decision_shop_status_idx" ON "Decision"("shop", "status")`,
      `CREATE INDEX IF NOT EXISTS "Decision_shop_generatedAt_idx" ON "Decision"("shop", "generatedAt")`,
      `CREATE INDEX IF NOT EXISTS "Decision_shop_type_status_idx" ON "Decision"("shop", "type", "status")`,
      `CREATE INDEX IF NOT EXISTS "Decision_shop_runId_idx" ON "Decision"("shop", "runId")`,
      `CREATE INDEX IF NOT EXISTS "Decision_shop_decisionKey_idx" ON "Decision"("shop", "decisionKey")`,

      // DecisionRun table (history)
      `CREATE TABLE IF NOT EXISTS "DecisionRun" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "shop" TEXT NOT NULL,
        "generatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "orderCount" INTEGER NOT NULL,
        "windowDays" INTEGER NOT NULL DEFAULT 90,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS "DecisionRun_shop_generatedAt_idx" ON "DecisionRun"("shop", "generatedAt")`,

      // DecisionOutcome table (v3)
      `CREATE TABLE IF NOT EXISTS "DecisionOutcome" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "decisionId" TEXT NOT NULL UNIQUE,
        "baselineMetrics" JSONB NOT NULL,
        "postMetrics" JSONB,
        "outcomeStatus" TEXT,
        "evaluatedAt" TIMESTAMP,
        "windowDays" INTEGER NOT NULL DEFAULT 30,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS "DecisionOutcome_decisionId_idx" ON "DecisionOutcome"("decisionId")`,

      // DataCache table
      `CREATE TABLE IF NOT EXISTS "DataCache" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "shop" TEXT NOT NULL,
        "cacheKey" TEXT NOT NULL,
        "dataJson" JSONB NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE("shop", "cacheKey")
      )`,

      // Create indexes for DataCache
      `CREATE INDEX IF NOT EXISTS "DataCache_shop_idx" ON "DataCache"("shop")`,
      `CREATE INDEX IF NOT EXISTS "DataCache_expiresAt_idx" ON "DataCache"("expiresAt")`,

      // Backfill columns for existing tables
      `ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'GBP'`,
      `ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "currencySymbol" TEXT NOT NULL DEFAULT '£'`,
      `ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "minImpactThreshold" DOUBLE PRECISION NOT NULL DEFAULT 50`,
      `ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "lastOrderCount" INTEGER`,
      `ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "lastAnalyzedAt" TIMESTAMP`,
      `ALTER TABLE "Decision" ADD COLUMN IF NOT EXISTS "runId" TEXT`,
      `ALTER TABLE "Decision" ADD COLUMN IF NOT EXISTS "decisionKey" TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE "Decision" ADD COLUMN IF NOT EXISTS "resurfacedAt" TIMESTAMP`,
    ];

    const results = [];
    for (const sql of migrations) {
      try {
        await prisma.$executeRawUnsafe(sql);
        results.push({ sql: sql.substring(0, 50) + "...", status: "ok" });
      } catch (error) {
        // Log error but continue (table might already exist)
        console.log("[migrate] Error executing SQL:", error);
        results.push({
          sql: sql.substring(0, 50) + "...",
          status: "error",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    console.log("[migrate] Migration completed");

    return json({
      status: "success",
      message: "Database migration completed successfully",
      results,
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
