import { issueSession, issueStepUp, type StepUpScope } from "@/lib/growth/authSession";

const TEST_SESSION_SECRET = "test-session-signing-secret";

export function growthAuthHeaders(
  passphrase: string | null,
  scope?: StepUpScope
): Record<string, string> {
  process.env.APPROVE_SESSION_SECRET = TEST_SESSION_SECRET;
  const headers: Record<string, string> = { "x-growth-request": "1" };
  if (passphrase === null) return headers;
  if (passphrase !== process.env.APPROVE_SECRET) {
    headers.cookie = "growth_session=invalid";
    return headers;
  }
  const session = issueSession(TEST_SESSION_SECRET, { sid: "test-sid" });
  const cookies = [`growth_session=${session.token}`];
  if (scope) {
    const stepUp = issueStepUp(TEST_SESSION_SECRET, "test-sid", scope);
    cookies.push(`${stepUp.cookieName}=${stepUp.token}`);
  }
  headers.cookie = cookies.join("; ");
  return headers;
}
