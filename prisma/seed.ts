import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seeds a demo project so the app has something to look at before Clerk users
 * exist. Safe to re-run: it upserts a placeholder user and skips if the demo
 * project is already present.
 */
async function main() {
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@apollo.local" },
    update: {},
    create: {
      clerkUserId: "seed_demo_user",
      email: "demo@apollo.local",
      name: "Demo User",
      role: "admin",
    },
  });

  const existing = await prisma.project.findFirst({
    where: { name: "Demo Project" },
  });
  if (existing) {
    console.log("Demo project already exists — skipping.");
    return;
  }

  const project = await prisma.project.create({
    data: {
      name: "Demo Project",
      description: "Sample data to explore Apollo.",
      members: { create: { userId: demoUser.id } },
    },
  });

  const auth = await prisma.testSuite.create({
    data: { projectId: project.id, name: "Authentication" },
  });
  const login = await prisma.testSuite.create({
    data: { projectId: project.id, parentSuiteId: auth.id, name: "Login" },
  });

  await prisma.testCase.create({
    data: {
      suiteId: login.id,
      title: "User can log in with valid credentials",
      preconditions: "A registered account exists.",
      steps: [
        { action: "Navigate to the login page", expected: "Login form is shown" },
        { action: "Enter valid email and password", expected: "Fields accept input" },
        { action: "Click Sign in", expected: "User is redirected to dashboard" },
      ],
      expectedResult: "User reaches the dashboard authenticated.",
      priority: "high",
      type: "smoke",
      tags: ["auth", "critical-path"],
      createdById: demoUser.id,
    },
  });

  await prisma.testCase.create({
    data: {
      suiteId: login.id,
      title: "Login is rejected with wrong password",
      steps: [
        { action: "Enter valid email, wrong password", expected: "" },
        { action: "Click Sign in", expected: "Inline error shown, no redirect" },
      ],
      priority: "medium",
      type: "functional",
      tags: ["auth", "negative"],
      createdById: demoUser.id,
    },
  });

  console.log("Seeded demo project:", project.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
