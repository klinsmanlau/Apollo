import { z } from "zod";

export const priorityEnum = z.enum(["low", "medium", "high", "critical"]);
export const caseTypeEnum = z.enum([
  "functional",
  "regression",
  "smoke",
  "integration",
  "performance",
  "security",
  "usability",
]);

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const suiteSchema = z.object({
  projectId: z.string().min(1),
  parentSuiteId: z.string().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Name is required").max(120),
});

// A single test step: an action and its expected outcome.
export const stepSchema = z.object({
  action: z.string().trim().min(1),
  expected: z.string().trim().optional().or(z.literal("")),
});

export const caseSchema = z.object({
  suiteId: z.string().min(1, "Pick a suite"),
  title: z.string().trim().min(1, "Title is required").max(200),
  preconditions: z.string().trim().max(4000).optional().or(z.literal("")),
  steps: z.array(stepSchema).default([]),
  expectedResult: z.string().trim().max(4000).optional().or(z.literal("")),
  priority: priorityEnum.default("medium"),
  type: caseTypeEnum.default("functional"),
  tags: z.array(z.string().trim().min(1)).default([]),
  externalRef: z.string().trim().max(100).optional().or(z.literal("")),
});

export type CaseInput = z.infer<typeof caseSchema>;
export type Step = z.infer<typeof stepSchema>;
