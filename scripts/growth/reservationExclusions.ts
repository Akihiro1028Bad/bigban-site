/** テスト予約の除外規則(純ロジック)。設定は assets/reservation-exclusions.json。 */
import { z } from "zod";

const rulesSchema = z.object({ emails: z.array(z.string()), nameContains: z.array(z.string()) });
export type ExclusionRules = z.infer<typeof rulesSchema>;

export function parseExclusionRules(json: string): ExclusionRules {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error("除外設定がJSONではありません"); }
  const parsed = rulesSchema.safeParse(value);
  if (!parsed.success) throw new Error(`除外設定の形式が不正です: ${parsed.error.message}`);
  return parsed.data;
}

export function isExcluded(target: { email: string; name: string }, rules: ExclusionRules): boolean {
  const email = target.email.trim().toLowerCase();
  if (email && rules.emails.some((entry) => entry.toLowerCase() === email)) return true;
  return rules.nameContains.some((fragment) => fragment && target.name.includes(fragment));
}
