/** D5: 開催何日前に満枠になったかの更新を検出する。 */
import { jstYmdOfIso, programParticipationReservations } from "../reservationAggregates";
import type { Detector } from "../insightEngine";
import type { CanonicalProgram } from "../labolaNormalize";

const DAY_MS = 24 * 60 * 60 * 1000;

interface FilledProgram {
  program: CanonicalProgram;
  filledAt: string;
  daysBeforeHeld: number;
}

type DetectorInsight = ReturnType<Detector>[number];

function daysBetween(laterYmd: string, earlierYmd: string): number {
  return Math.max(0, Math.round((new Date(`${laterYmd}T00:00:00Z`).getTime() - new Date(`${earlierYmd}T00:00:00Z`).getTime()) / DAY_MS));
}

function filledProgram(context: Parameters<Detector>[0], program: CanonicalProgram): FilledProgram | null {
  if (program.capacity === null || program.capacity <= 0) return null;
  const reservations = programParticipationReservations(context.bundle, program).sort((left, right) => left.bookedAt.localeCompare(right.bookedAt));
  const capacityReservation = reservations[program.capacity - 1];
  if (capacityReservation === undefined) return null;
  const filledAt = jstYmdOfIso(capacityReservation.bookedAt);
  // 受付開始時刻を持たないため、開催何日前に満枠かを到達速度の指標にする。
  return { program, filledAt, daysBeforeHeld: daysBetween(program.heldOn, filledAt) };
}

export const fillSpeed: Detector = (context) => {
  const filled = context.bundle.programs.map((program) => filledProgram(context, program)).filter((value): value is FilledProgram => value !== null);
  return filled
    .filter((current) => current.filledAt >= context.current.start && current.filledAt <= context.current.end)
    .flatMap((current): DetectorInsight[] => {
      const prior = filled.filter((candidate) => candidate.program.name === current.program.name && candidate.filledAt < context.current.start);
      if (prior.length === 0) return [{ id: `d5:first:${current.program.name}:${current.program.heldOn}`, detector: "D5", severity: "info" as const, title: "満枠到達速度", body: "初の満枠", evidence: { n: current.program.capacity as number, daysBeforeHeld: current.daysBeforeHeld, previousBest: null }, label: "観察" as const }];
      const previousBest = Math.max(...prior.map((candidate) => candidate.daysBeforeHeld));
      if (current.daysBeforeHeld <= previousBest) return [];
      return [{ id: `d5:fastest:${current.program.name}:${current.program.heldOn}`, detector: "D5", severity: "notice" as const, title: "満枠到達速度", body: "満枠が過去最速", evidence: { n: current.program.capacity as number, daysBeforeHeld: current.daysBeforeHeld, previousBest }, label: "観察" as const }];
    });
};
