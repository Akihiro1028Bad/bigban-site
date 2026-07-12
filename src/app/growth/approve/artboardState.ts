import type { OutlineImage } from "@/app/growth/approve/outline";

export type ArtboardSlotState = "empty" | "specified" | "rough-ready" | "generating";

export function slotStateOf(
  image: OutlineImage | undefined,
  roughUrl: string | undefined,
  isRegenerating: boolean,
): ArtboardSlotState {
  if (isRegenerating) return "generating";
  if (roughUrl?.trim()) return "rough-ready";
  if (image) return "specified";
  return "empty";
}
