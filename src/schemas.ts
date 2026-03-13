import { z } from "zod";

// gray-matter parses YAML dates as Date objects — coerce to ISO string
const dateField = z.union([z.string(), z.date()]).transform((v) =>
  v instanceof Date ? v.toISOString().split("T")[0] : v
);

export const DraftSchema = z.object({
  id: z.string(),
  project: z.string(),
  created: dateField,
  updated: dateField,
  priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  tags: z.array(z.string()).default([]),
  supersedes: z.string().optional(),
});

export const PrdSchema = z.object({
  id: z.string(),
  project: z.string(),
  created: dateField,
  updated: dateField,
  tags: z.array(z.string()).default([]),
});

export const VisionSchema = z.object({
  id: z.string(),
  status: z.enum(["draft", "validated", "active", "paused", "archived"]),
  created: dateField,
  updated: dateField,
  tags: z.array(z.string()).default([]),
});

export const PlanSchema = z.object({
  id: z.string(),
  project: z.string(),
  created: dateField,
});

export const ReviewSchema = z.object({
  decision: z.enum([
    "approved",
    "back-to-delivery",
    "back-to-planning",
    "back-to-discovery",
  ]),
});

export const CycleSchema = z.object({
  type: z.enum([
    "framing",
    "research",
    "analysis",
    "spike",
    "mockup",
    "interview",
  ]),
  date: dateField,
  initiative: z.string().optional(),
});

export const SCHEMAS: Record<string, z.ZodObject<z.ZodRawShape>> = {
  "draft.md": DraftSchema,
  "prd.md": PrdSchema,
  "vision.md": VisionSchema,
  "plan.md": PlanSchema,
  "review.md": ReviewSchema,
  "cycle.md": CycleSchema,
};

export const DOCUMENT_TYPES = Object.keys(SCHEMAS);

export type Draft = z.infer<typeof DraftSchema>;
export type Prd = z.infer<typeof PrdSchema>;
export type Vision = z.infer<typeof VisionSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type Cycle = z.infer<typeof CycleSchema>;
