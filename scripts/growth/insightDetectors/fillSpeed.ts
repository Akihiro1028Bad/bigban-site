/** D5: 開催何日前に満枠になったかの更新を検出する。 */
import { jstYmdOfIso, programParticipationReservations } from "../reservationAggregates";
import type { Detector } from "../insightEngine";
import type { CanonicalProgram } from "../labolaNormalize";

const DAY_MS = 24 * 60 * 60 * 1000;

interface FilledProgram {
  program: CanonicalProgram;
  capacity: number;
  filledAt: string;
  filledOn: string;
  daysBeforeHeld: number;
}

type DetectorInsight = ReturnType<Detector>[number];

function daysBetween(laterYmd: string, earlierYmd: string): number {
  return Math.round((new Date(`${laterYmd}T00:00:00Z`).getTime() - new Date(`${earlierYmd}T00:00:00Z`).getTime()) / DAY_MS);
}

function filledProgram(context: Parameters<Detector>[0], program: CanonicalProgram): FilledProgram | null {
  if (program.capacity === null || program.capacity <= 0) return null;
  const reservations = programParticipationReservations(context.bundle, program).sort((left, right) => left.bookedAt.localeCompare(right.bookedAt));
  const capacityReservation = reservations[program.capacity - 1];
  if (capacityReservation === undefined) return null;
  const filledAt = capacityReservation.bookedAt;
  const filledOn = jstYmdOfIso(filledAt);
  // 開催開始以降の到達は遅延入力などを含み得るため、満枠到達速度として通知しない。
  if (filledAt >= `${program.heldOn}T${program.start}:00+09:00`) return null;
  // 受付開始時刻を持たないため、開催何日前に満枠かを到達速度の指標にする。
  return { program, capacity: program.capacity, filledAt, filledOn, daysBeforeHeld: daysBetween(program.heldOn, filledOn) };
}

export const fillSpeed: Detector = (context) => {
  const filled = context.bundle.programs.map((program) => filledProgram(context, program)).filter((value): value is FilledProgram => value !== null)
    .sort((left, right) => left.filledAt.localeCompare(right.filledAt) || left.program.heldOn.localeCompare(right.program.heldOn) || left.program.start.localeCompare(right.program.start));
  const bestByName = new Map<string, number>();
  return filled.flatMap((current): DetectorInsight[] => {
    const previousBest = bestByName.get(current.program.name);
    const isCurrentWeek = current.filledOn >= context.current.start && current.filledOn <= context.current.end;
    const insight = previousBest === undefined
      ? { id: `d5:first:${current.program.name}`, detector: "D5" as const, severity: "info" as const, title: "満枠到達速度", body: "初の満枠", evidence: { n: current.capacity, daysBeforeHeld: current.daysBeforeHeld, previousBest: null }, label: "観察" as const }
      : current.daysBeforeHeld > previousBest
        ? { id: `d5:fastest:${current.program.name}`, detector: "D5" as const, severity: "notice" as const, title: "満枠到達速度", body: "満枠が過去最速", evidence: { n: current.capacity, daysBeforeHeld: current.daysBeforeHeld, previousBest }, label: "観察" as const }
        : null;
    bestByName.set(current.program.name, Math.max(previousBest ?? current.daysBeforeHeld, current.daysBeforeHeld));
    return isCurrentWeek && insight !== null ? [insight] : [];
  });
};
