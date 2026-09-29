import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { questionDraftToCreateData } from "../src/lib/forms/clone";
import type { QuestionDraft } from "../src/lib/validation/question";
import { generateLinkSlug, generateCampaignSlug } from "../src/lib/utils/slug";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const q = (
  text: string,
  type: QuestionDraft["type"],
  category: string,
  extra: Partial<QuestionDraft> = {},
): QuestionDraft => ({
  text,
  type,
  required: type !== "LONG_TEXT",
  category,
  validation: type === "RATING" ? { min: 1, max: 5 } : type === "SCALE" ? { min: 0, max: 10 } : type === "LONG_TEXT" ? { maxLength: 3000 } : {},
  analytics: { displayPriority: 100, showInSummary: type !== "LONG_TEXT" },
  options: [],
  ...extra,
});

const usefulness = ["Not useful", "Slightly useful", "Neutral", "Useful", "Very useful"].map((label) => ({ label }));

const TEMPLATES: Array<{ name: string; description: string; questions: QuestionDraft[] }> = [
  {
    name: "Orizenn Standard Student Feedback",
    description: "Five questions covering value, discovery, friction and improvement.",
    questions: [
      q("How useful was the Orizenn analysis for your project?", "SINGLE_CHOICE", "Value", { options: usefulness, comparableKey: "analysis_usefulness" }),
      q("Did Orizenn show you something about your project that you did not already know?", "SINGLE_CHOICE", "Discovery", {
        options: [{ label: "Yes" }, { label: "No" }, { label: "Not sure" }],
        comparableKey: "revealed_new_info",
      }),
      q("How clearly do you understand your technical strengths after using Orizenn?", "SCALE", "Understanding", { comparableKey: "strengths_clarity" }),
      q("What, if anything, was confusing or difficult to understand?", "LONG_TEXT", "Friction", { required: false, comparableKey: "confusion_text" }),
      q("What would make the results more useful to you?", "LONG_TEXT", "Improvement", { required: false, comparableKey: "improvement_text" }),
    ],
  },
  {
    name: "MVP Product Feedback",
    description: "Usability, accuracy, trust and return intent for a new release.",
    questions: [
      q("How easy was it to get started with Orizenn?", "RATING", "Onboarding", { comparableKey: "onboarding_ease" }),
      q("How easy was it to find what you were looking for in the dashboard?", "RATING", "Usability", { comparableKey: "dashboard_ease" }),
      q("How accurate did the results feel compared to your own view of your project?", "RATING", "Accuracy", { comparableKey: "perceived_accuracy" }),
      q("Which parts of the results did you look at?", "MULTIPLE_CHOICE", "Behavior", {
        options: ["Capability summary", "Evidence links", "Gaps", "Recommendations", "Comparison with peers"].map((label) => ({ label })),
      }),
      q("Did anything feel wrong or unfair in the assessment?", "YES_NO", "Trust", { comparableKey: "felt_unfair" }),
      q("If yes, what felt wrong?", "LONG_TEXT", "Trust", { required: false }),
      q("How likely are you to use Orizenn again for a future project?", "SCALE", "Return Intent", { comparableKey: "return_intent" }),
    ],
  },
  {
    name: "Post-Analysis Improvement Feedback",
    description: "What students changed after seeing their results.",
    questions: [
      q("Did you change anything in your project after seeing the results?", "YES_NO", "Behavior", { comparableKey: "made_changes" }),
      q("Which parts of your project did you change?", "MULTIPLE_CHOICE", "Improvement", {
        required: false,
        options: ["Testing", "Validation", "Documentation", "Security", "Code structure", "Nothing yet"].map((label) => ({ label })),
        comparableKey: "changes_made",
      }),
      q("Roughly how many issues did you fix?", "NUMBER", "Improvement", { validation: { min: 0, max: 500 }, comparableKey: "issues_fixed" }),
      q("Did the changes improve your project?", "SINGLE_CHOICE", "Improvement", {
        options: ["Yes, clearly", "Somewhat", "Not really", "Too early to tell"].map((label) => ({ label })),
        comparableKey: "changes_improved",
      }),
      q("What was the most useful change you made?", "LONG_TEXT", "Improvement", { required: false }),
      q("Would you use Orizenn again?", "YES_NO", "Return Intent", { comparableKey: "would_use_again" }),
    ],
  },
];

async function main() {
  const rawEmail = process.env.SEED_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!rawEmail || !adminPassword) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before running the seed.");
  }
  if (adminPassword.length < 8) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 8 characters (the login form rejects shorter passwords).");
  }
  const adminEmail = rawEmail.toLowerCase();

  const workspace = await prisma.workspace.upsert({
    where: { slug: "orizenn" },
    update: {},
    create: { name: "Orizenn", slug: "orizenn" },
  });

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: "Orizenn Admin",
      email: adminEmail,
      role: "SUPER_ADMIN",
      passwordHash: await hash(adminPassword, 12),
    },
  });
  console.log(`✔ workspace ${workspace.slug}, super admin ${admin.email}`);

  for (const t of TEMPLATES) {
    const existing = await prisma.formTemplate.findFirst({ where: { workspaceId: workspace.id, name: t.name } });
    if (existing) continue;
    await prisma.formTemplate.create({
      data: { workspaceId: workspace.id, name: t.name, description: t.description, questionsJson: JSON.parse(JSON.stringify(t.questions)) },
    });
    console.log(`✔ template "${t.name}"`);
  }

  if (process.env.SEED_DEMO === "true") await seedDemo(workspace.id, admin.id);
}

/** Development-only demo campaign with a published form and synthetic responses. */
async function seedDemo(workspaceId: string, userId: string) {
  const name = "September Student Feedback (demo)";
  if (await prisma.campaign.findFirst({ where: { workspaceId, name } })) {
    console.log("· demo campaign already present");
    return;
  }
  const keys: string[] = [];
  const questionsData = TEMPLATES[0].questions.map((d, i) => {
    const data = questionDraftToCreateData(d, i, keys);
    keys.push(data.key);
    return data;
  });

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId,
      createdById: userId,
      name,
      slug: generateCampaignSlug(name),
      goal: "Understand whether students found Orizenn useful, accurate and easy to understand after the September release.",
      status: "ACTIVE",
      responseMode: "PSEUDONYMOUS",
      respondentFields: ["college", "branch", "year"],
      versions: {
        create: {
          versionNumber: 1,
          status: "PUBLISHED",
          publishedAt: new Date(),
          estimatedMinutes: 2,
          createdById: userId,
          questions: { create: questionsData },
        },
      },
    },
    include: { versions: { include: { questions: { include: { options: true }, orderBy: { position: "asc" } } } } },
  });
  const version = campaign.versions[0];
  await prisma.feedbackLink.create({
    data: { campaignId: campaign.id, formVersionId: version.id, slug: generateLinkSlug(name), status: "ACTIVE" },
  });

  const colleges = ["ABC College", "XYZ Institute", "PQR University"];
  const years = ["SE", "TE", "BE"];
  const confusions = [
    "I wasn't sure what Emerging meant in the capability terminology.",
    "The evidence explanation was hard to follow at first.",
    "Dashboard navigation between capabilities was confusing.",
    "Terminology like capability levels needed a legend.",
    "The recommendations section did not explain why.",
    "Nothing really, it was clear.",
  ];
  const improvements = [
    "Clearer explanation of capability results.",
    "Show more evidence for each capability.",
    "Add examples of what a strong project looks like.",
    "Make the dashboard navigation simpler.",
    "Explain the recommendations in more detail.",
  ];
  const rand = (n: number) => Math.floor(Math.random() * n);

  for (let i = 0; i < 40; i++) {
    const respondent = await prisma.respondent.create({
      data: { workspaceId, college: colleges[rand(3)], branch: "Computer", year: years[rand(3)] },
    });
    const submittedAt = new Date(Date.now() - rand(14) * 86_400_000 - rand(86_400_000));
    const sub = await prisma.submission.create({
      data: {
        campaignId: campaign.id,
        formVersionId: version.id,
        respondentId: respondent.id,
        clientToken: `demo-${campaign.id}-${i}`,
        status: "COMPLETED",
        submittedAt,
        startedAt: new Date(submittedAt.getTime() - (90 + rand(120)) * 1000),
        durationSeconds: 90 + rand(120),
        completionPercent: 100,
      },
    });
    const [useful, revealed, clarity, confusion, improvement] = version.questions;
    await prisma.answer.createMany({
      data: [
        { submissionId: sub.id, questionId: useful.id, textValue: useful.options[Math.min(4, 2 + rand(3))].value },
        { submissionId: sub.id, questionId: revealed.id, textValue: revealed.options[rand(3)].value },
        { submissionId: sub.id, questionId: clarity.id, numberValue: 5 + rand(6) },
        ...(rand(4) > 0 ? [{ submissionId: sub.id, questionId: confusion.id, textValue: confusions[rand(confusions.length)] }] : []),
        ...(rand(3) > 0 ? [{ submissionId: sub.id, questionId: improvement.id, textValue: improvements[rand(improvements.length)] }] : []),
      ],
    });
  }
  console.log(`✔ demo campaign "${name}" with 40 responses`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
