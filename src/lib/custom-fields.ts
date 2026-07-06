// Configured custom fields (shared by test cases and test cycles).
export type CustomFieldType = "select" | "text" | "user";
export type CustomFieldDef = {
  key: string;
  type: CustomFieldType;
  options?: string[];
};

export const CUSTOM_FIELDS: CustomFieldDef[] = [
  { key: "POD", type: "select", options: ["Cards", "Deposit", "Lending", "AI", "Payments", "N/A", "Customer", "Insights", "Rewards"] },
  { key: "Language", type: "select", options: ["EN", "BM", "CN"] },
  { key: "Data Dependency", type: "select", options: ["Yes", "No"] },
  { key: "Product Critical", type: "select", options: ["Yes", "No"] },
  { key: "Endpoints Usage", type: "select", options: ["Yes", "No"] },
  { key: "OS Dependent", type: "select", options: ["Yes", "No"] },
  { key: "Remarks", type: "text" },
  { key: "QA", type: "user" },
  { key: "Automation Feasibility", type: "select", options: ["Automatable", "Not Automatable", "Partially Automatable", "To Be Reviewed"] },
  { key: "Automation Status", type: "select", options: ["Not Started", "In Progress", "Automated", "Blocked", "Deprecated"] },
  { key: "Complexity", type: "select", options: ["Easy", "Complex", "Medium"] },
  { key: "Risk Tier", type: "select", options: ["Blocker", "Major", "Minor"] },
];
