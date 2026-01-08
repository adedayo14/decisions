/**
 * Prisma Type Extensions
 * Properly typed interfaces for Prisma models and operations
 */

import type { PrismaClient, Prisma } from "@prisma/client";

// Re-export PrismaClient with proper typing
export type { PrismaClient };

// Type-safe database client
export type TypedPrismaClient = PrismaClient;

// Settings model types
export type SettingsModel = Prisma.SettingsGetPayload<Record<string, never>>;
export type SettingsCreateInput = Prisma.SettingsCreateInput;
export type SettingsUpdateInput = Prisma.SettingsUpdateInput;
export type SettingsUpsertArgs = Prisma.SettingsUpsertArgs;

// Extended Settings type with all potential fields (handles schema mismatches)
export type ExtendedSettings = SettingsModel & {
  // Fields that might not be in production DB yet
  enableTitleCaps?: boolean;
  enableEnhancedBundles?: boolean;
  showPurchaseCounts?: boolean;
  showRecentlyViewed?: boolean;
  showTestimonials?: boolean;
  showTrustBadges?: boolean;
  highlightHighValue?: boolean;
  enhancedImages?: boolean;
  animatedSavings?: boolean;
  highValueThreshold?: number;
  bundlePriority?: string;
  badgeHighValueText?: string;
  badgePopularText?: string;
  badgeTrendingText?: string;
  testimonialsList?: string;
};

// Bundle model types
export type BundleModel = Prisma.BundleGetPayload<Record<string, never>>;
export type BundleWithProducts = Prisma.BundleGetPayload<{
  include: { products: true };
}>;
export type BundleCreateInput = Prisma.BundleCreateInput;
export type BundleUpdateInput = Prisma.BundleUpdateInput;

// BundleProduct model types
export type BundleProductModel = Prisma.BundleProductGetPayload<Record<string, never>>;
export type BundleProductCreateInput = Prisma.BundleProductCreateInput;

// Experiment model types (A/B Testing)
export type ExperimentModel = Prisma.ExperimentGetPayload<Record<string, never>>;
export type ExperimentWithVariants = Prisma.ExperimentGetPayload<{
  include: { variants: true };
}>;
export type VariantModel = Prisma.VariantGetPayload<Record<string, never>>;
export type EventModel = Prisma.EventGetPayload<Record<string, never>>;

// Analytics model types
export type AnalyticsEventModel = Prisma.AnalyticsEventGetPayload<Record<string, never>>;
export type TrackingEventModel = Prisma.TrackingEventGetPayload<Record<string, never>>;

// ML model types
export type MLUserProfileModel = Prisma.MLUserProfileGetPayload<Record<string, never>>;
export type MLProductSimilarityModel = Prisma.MLProductSimilarityGetPayload<Record<string, never>>;
export type MLProductPerformanceModel = Prisma.MLProductPerformanceGetPayload<Record<string, never>>;
export type RecommendationAttributionModel = Prisma.RecommendationAttributionGetPayload<Record<string, never>>;

// Subscription model types
export type SubscriptionModel = Prisma.SubscriptionGetPayload<Record<string, never>>;
export type BilledOrderModel = Prisma.BilledOrderGetPayload<Record<string, never>>;

// Session model types
export type SessionModel = Prisma.SessionGetPayload<Record<string, never>>;

// Common Prisma operation types
export type WhereUniqueInput<T> = T extends "settings"
  ? Prisma.SettingsWhereUniqueInput
  : T extends "bundle"
  ? Prisma.BundleWhereUniqueInput
  : T extends "experiment"
  ? Prisma.ExperimentWhereUniqueInput
  : never;

// Database error types
export interface PrismaError extends Error {
  code?: string;
  meta?: Record<string, unknown>;
  clientVersion?: string;
}

// Helper type for unknown field errors
export interface UnknownFieldError {
  message: string;
  fields: string[];
}
