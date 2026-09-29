// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FormDefinition, QuestionDefinition, QuestionType } from "@/lib/forms/definitions";
import { defaultAnalyticsType, defaultValidation } from "@/lib/forms/definitions";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import { PublicForm } from "@/components/feedback/PublicForm";

/* ───────────────────────── Fixture ───────────────────────── */

function q(
  id: string,
  type: QuestionType,
  text: string,
  overrides: Partial<QuestionDefinition> = {},
): QuestionDefinition {
  const options =
    type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE" || type === "DROPDOWN"
      ? [
          { id: `${id}-a`, label: "Option A", value: "a", position: 0 },
          { id: `${id}-b`, label: "Option B", value: "b", position: 1 },
          { id: `${id}-c`, label: "Option C", value: "c", position: 2 },
        ]
      : [];
  return {
    id,
    key: id,
    position: 0,
    text,
    description: null,
    type,
    required: true,
    category: null,
    analyticsType: defaultAnalyticsType(type),
    comparableKey: null,
    validation: defaultValidation(type),
    analytics: { displayPriority: 100, showInSummary: true },
    options,
    ...overrides,
  };
}

const ALL_QUESTIONS: QuestionDefinition[] = [
  q("q-rating", "RATING", "How would you rate the onboarding?"),
  q("q-scale", "SCALE", "How likely are you to recommend Orizenn?"),
  q("q-yesno", "YES_NO", "Did you finish your first project?"),
  q("q-single", "SINGLE_CHOICE", "Which feature did you use most?"),
  q("q-multi", "MULTIPLE_CHOICE", "Which of these caused friction?"),
  q("q-dropdown", "DROPDOWN", "Which track are you on?"),
  q("q-short", "SHORT_TEXT", "One word for your experience?"),
  q("q-long", "LONG_TEXT", "What should we improve next?", { required: false }),
  q("q-number", "NUMBER", "How many hours did you spend?", { validation: { min: 0, max: 100 } }),
].map((question, i) => ({ ...question, position: i }));

function makeForm(overrides: Partial<FormDefinition["campaign"]> = {}, questions = ALL_QUESTIONS): FormDefinition {
  return {
    versionId: "v1",
    versionNumber: 3,
    introText: null,
    estimatedMinutes: 4,
    campaign: {
      id: "c1",
      name: "Winter Cohort Feedback",
      responseMode: "IDENTIFIED",
      respondentFields: ["name", "email", "college"],
      requireQuoteConsent: true,
      allowMultipleResponses: false,
      ...overrides,
    },
    questions,
  };
}

function okResponse(status = 201) {
  return new Response(JSON.stringify({ success: true, data: { submissionId: "s1", duplicate: false } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function radioButton(name: string) {
  return screen.getByRole("radio", { name });
}

/** Fill in every field so the form validates cleanly. */
function fillEverything() {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Asha Rao" } });
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "asha@example.edu" } });
  fireEvent.change(screen.getByLabelText(/^College/), { target: { value: "IIT Madras" } });

  fireEvent.click(radioButton("4 of 5"));
  fireEvent.click(radioButton("9 of 10"));

  const yesNo = screen.getByRole("radiogroup", { name: /Did you finish your first project/ });
  fireEvent.click(within(yesNo).getByLabelText("Yes"));

  const single = screen.getByRole("radiogroup", { name: /Which feature did you use most/ });
  fireEvent.click(within(single).getByLabelText("Option B"));

  const multi = screen.getByRole("group", { name: /Which of these caused friction/ });
  fireEvent.click(within(multi).getByLabelText("Option A"));
  fireEvent.click(within(multi).getByLabelText("Option C"));

  fireEvent.change(screen.getByLabelText(/Which track are you on/), { target: { value: "c" } });
  fireEvent.change(screen.getByLabelText(/One word for your experience/), { target: { value: "Clarifying" } });
  fireEvent.change(screen.getByLabelText(/How many hours did you spend/), { target: { value: "12" } });

  const consent = screen.getByRole("radiogroup", { name: /May we use your feedback anonymously/ });
  fireEvent.click(within(consent).getByLabelText("Yes"));
}

/* ───────────────────────── Tests ───────────────────────── */

describe("PublicForm", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    push.mockReset();
    fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    // jsdom does not implement scrolling; the component guards it but jsdom still logs.
    vi.stubGlobal("scrollTo", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the intro, every question label and the respondent fields", () => {
    render(<PublicForm form={makeForm()} slug="winter-2026" layout="scroll" />);

    expect(screen.getByRole("heading", { level: 1, name: "Winter Cohort Feedback" })).toBeInTheDocument();
    expect(screen.getByText("We want to understand what your experience actually looked like.")).toBeInTheDocument();
    expect(screen.getByText("4 minutes · 9 questions")).toBeInTheDocument();

    for (const question of ALL_QUESTIONS) {
      expect(screen.getByText(question.text)).toBeInTheDocument();
    }
    expect(screen.getByText("01 / 09")).toBeInTheDocument();
    expect(screen.getByText("09 / 09")).toBeInTheDocument();

    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^College/)).toBeInTheDocument();
    expect(screen.getByText(/May we use your feedback anonymously/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Feedback" })).toBeInTheDocument();
    expect(screen.queryByText("Your responses are anonymous.")).not.toBeInTheDocument();
  });

  it("blocks submission and shows errors when required answers are missing", async () => {
    render(<PublicForm form={makeForm()} slug="winter-2026" layout="scroll" />);

    fireEvent.click(screen.getByRole("button", { name: "Submit Feedback" }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((el) => el.textContent === "This question is required.")).toBe(true);
    expect(alerts.some((el) => el.textContent === "This field is required.")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();

    // The first invalid field (respondent name) receives focus.
    expect(screen.getByLabelText(/^Name/)).toHaveFocus();
  });

  it("marks a clicked rating as checked and exposes radiogroup semantics", () => {
    render(<PublicForm form={makeForm()} slug="winter-2026" layout="scroll" />);

    const group = screen.getByRole("radiogroup", { name: /How would you rate the onboarding/ });
    const four = within(group).getByRole("radio", { name: "4 of 5" });
    expect(four).toHaveAttribute("aria-checked", "false");

    fireEvent.click(four);
    expect(four).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: "3 of 5" })).toHaveAttribute("aria-checked", "false");
  });

  it("submits once even when the button is double-clicked, then navigates to success", async () => {
    render(<PublicForm form={makeForm()} slug="winter-2026" layout="scroll" />);
    fillEverything();

    const submit = screen.getByRole("button", { name: "Submit Feedback" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/f/winter-2026/success"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/public/forms/winter-2026/submit");
    const body = JSON.parse(String(init.body));
    expect(body.website).toBe("");
    expect(body.clientToken.length).toBeGreaterThanOrEqual(8);
    expect(body.respondent).toEqual({ name: "Asha Rao", email: "asha@example.edu", college: "IIT Madras" });
    expect(body.consentToQuote).toBe(true);
    expect(body.answers).toEqual({
      "q-rating": 4,
      "q-scale": 9,
      "q-yesno": true,
      "q-single": "b",
      "q-multi": ["a", "c"],
      "q-dropdown": "c",
      "q-short": "Clarifying",
      "q-number": 12,
    });
  });

  it("keeps answers and offers a retry when the request fails, reusing the client token", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<PublicForm form={makeForm()} slug="winter-2026" layout="scroll" />);
    fillEverything();

    fireEvent.click(screen.getByRole("button", { name: "Submit Feedback" }));
    const notice = await screen.findByText("We couldn't submit your response. Your answers are still on this page.");
    expect(notice).toBeInTheDocument();
    expect(screen.getByLabelText(/One word for your experience/)).toHaveValue("Clarifying");

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/f/winter-2026/success"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    const second = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect(second.clientToken).toBe(first.clientToken);
  });

  it("maps server-side field errors back onto the form", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Please correct the highlighted fields.",
            fields: { "answers.q-short": ["Please keep it under 300 characters."], "respondent.email": ["Enter a valid email."] },
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
    render(<PublicForm form={makeForm()} slug="winter-2026" layout="scroll" />);
    fillEverything();

    fireEvent.click(screen.getByRole("button", { name: "Submit Feedback" }));
    expect(await screen.findByText("Please keep it under 300 characters.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Submit Feedback" })).toBeEnabled();
  });

  it("shows the anonymity notice and hides identity fields only for ANONYMOUS campaigns", () => {
    render(<PublicForm form={makeForm({ responseMode: "ANONYMOUS" })} slug="anon" layout="scroll" />);

    expect(screen.getByText("Your responses are anonymous.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Email/)).not.toBeInTheDocument();
    // Non-identifying context is still collected when configured.
    expect(screen.getByLabelText(/^College/)).toBeInTheDocument();
  });

  it("switches to one question per step above eight questions and validates each step", () => {
    render(<PublicForm form={makeForm()} slug="winter-2026" />);

    // Respondent panel first; questions are not all on screen.
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.queryByText("How would you rate the onboarding?")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Form progress" })).toHaveAttribute("aria-valuenow", "1");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.queryByText("How would you rate the onboarding?")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Asha Rao" } });
    fireEvent.change(screen.getByLabelText(/^College/), { target: { value: "IIT Madras" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("How would you rate the onboarding?")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Form progress" })).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
  });

  it("renders in preview mode with submissions disabled and a builder link", () => {
    render(<PublicForm form={makeForm()} mode="preview" layout="scroll" />);

    expect(screen.getByText("Preview of v3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to builder" })).toHaveAttribute("href", "/admin/campaigns/c1/builder");
    expect(screen.getByRole("button", { name: "Preview — submissions are disabled" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Submit Feedback" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a live character counter for text questions", () => {
    render(<PublicForm form={makeForm()} slug="winter-2026" layout="scroll" />);
    const input = screen.getByLabelText(/One word for your experience/);
    expect(screen.getByText("0 / 300")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "Clear" } });
    expect(screen.getByText("5 / 300")).toBeInTheDocument();
    expect(screen.getByText("0 / 3000")).toBeInTheDocument();
  });
});
