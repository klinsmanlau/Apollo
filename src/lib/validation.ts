import { z } from "zod";

export const priorityEnum = z.enum(["low", "medium", "high"]);
export const caseTypeEnum = z.enum([
  "functional",
  "regression",
  "smoke",
  "integration",
  "performance",
  "security",
  "usability",
]);
export const caseStatusEnum = z.enum(["draft", "approved", "deprecated"]);
export const scriptTypeEnum = z.enum(["steps", "plain", "bdd"]);

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const suiteSchema = z.object({
  projectId: z.string().min(1),
  parentSuiteId: z.string().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Name is required").max(120),
});

// A single test step: an action, optional test data, and expected outcome.
export const stepSchema = z.object({
  action: z.string().trim().min(1),
  testData: z.string().trim().optional().or(z.literal("")),
  expected: z.string().trim().optional().or(z.literal("")),
});

export const caseSchema = z.object({
  suiteId: z.string().min(1, "Pick a suite"),
  title: z.string().trim().min(1, "Title is required").max(300),
  objective: z.string().trim().max(4000).optional().or(z.literal("")),
  preconditions: z.string().trim().max(4000).optional().or(z.literal("")),
  scriptType: scriptTypeEnum.default("steps"),
  steps: z.array(stepSchema).default([]),
  scriptBody: z.string().trim().max(20000).optional().or(z.literal("")),
  expectedResult: z.string().trim().max(4000).optional().or(z.literal("")),
  priority: priorityEnum.default("medium"),
  type: caseTypeEnum.default("functional"),
  status: caseStatusEnum.default("draft"),
  component: z.string().trim().max(200).optional().or(z.literal("")),
  ownerName: z.string().trim().max(200).optional().or(z.literal("")),
  estimatedTime: z.coerce.number().int().nonnegative().optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  coverage: z.array(z.string().trim().min(1)).default([]),
  externalRef: z.string().trim().max(100).optional().or(z.literal("")),
});

export type CaseInput = z.infer<typeof caseSchema>;
export type Step = z.infer<typeof stepSchema>;
