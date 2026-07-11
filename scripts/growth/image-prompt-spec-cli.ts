/** 画像設計AIの sidecar 提案を検証し、下書きspecへ安全に反映する薄いCLI。 */
import { readFile, writeFile } from "node:fs/promises";

import { applyImagePromptProposal } from "./imagePromptSpec";

async function main(): Promise<void> {
  const command = process.argv[2];
  const specPath = process.argv[3];
  const proposalPath = process.argv[4];
  if (command !== "apply" || !specPath || !proposalPath) {
    throw new Error("使い方: image-prompt-spec apply <spec.json> <proposal.json>");
  }
  const draft = JSON.parse(await readFile(specPath, "utf-8")) as unknown;
  const proposal = JSON.parse(await readFile(proposalPath, "utf-8")) as unknown;
  const next = applyImagePromptProposal(draft, proposal);
  await writeFile(specPath, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  process.stdout.write(`${specPath}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[growth:image-prompt-spec] ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
