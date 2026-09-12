import {
  ScheduleWarning,
} from '../types';
import { FreeInterval, WorkCandidate, GoalCandidate } from './types';
import { getLocalEndOfWeek } from '../utils/dateUtils';

export interface FeasibilityResult {
  isFeasible: boolean;
  warnings: ScheduleWarning[];
}

/**
 * Formats a Date object into a readable local string like "Tue, Sep 15 5:00 PM".
 */
function formatDateTimeHuman(d: Date): string {
  return d.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Runs a comprehensive feasibility audit before scheduling.
 * 
 * 1. Checks past deadlines
 * 2. Checks non-splittable constraints (must have at least one contiguous open slot >= duration)
 * 3. Checks individual task shortfall (single task demand > capacity before its deadline)
 * 4. Evaluates cumulative deadline feasibility: For every distinct deadline with multiple items,
 *    computes the combined demand of all work due by that deadline vs the total eligible capacity before that deadline.
 * 5. Checks weekly goal feasibility against remaining free time in the current week.
 */
export function checkFeasibility(params: {
  workCandidates: WorkCandidate[];
  goalCandidates: GoalCandidate[];
  freeIntervals: FreeInterval[];
  currentTime: Date;
}): FeasibilityResult {
  const { workCandidates, goalCandidates, freeIntervals, currentTime } = params;
  const warnings: ScheduleWarning[] = [];

  const activeWork = workCandidates.filter((w) => w.unallocatedDuration > 0);

  // Helper to compute capacity before a specific timestamp
  function getCapacityBefore(cutoff: Date, schoolAllowed: boolean): number {
    let totalMinutes = 0;
    for (const slot of freeIntervals) {
      if (slot.start >= cutoff) break;
      if (!schoolAllowed && slot.isSchoolPeriod) continue;

      const slotEnd = slot.end < cutoff ? slot.end : cutoff;
      const mins = Math.max(0, Math.round((slotEnd.getTime() - slot.start.getTime()) / (60 * 1000)));
      totalMinutes += mins;
    }
    return totalMinutes;
  }

  // 1. Past Deadlines Check
  activeWork.forEach((item) => {
    if (item.deadlineDate <= currentTime) {
      warnings.push({
        id: `warn-past-deadline-${item.id}`,
        type: 'impossible_schedule',
        severity: 'error',
        targetId: item.id,
        targetName: item.name,
        shortfallMinutes: item.unallocatedDuration,
        message: `${item.name} deadline has already passed (${formatDateTimeHuman(item.deadlineDate)}).`,
        suggestedAction: 'Update the due date to allow scheduling.',
      });
    }
  });

  // 2. Non-Splittable Contiguous Slot Feasibility
  activeWork.forEach((item) => {
    if (item.splittable || item.deadlineDate <= currentTime) return;

    let maxContiguousSlot = 0;
    for (const slot of freeIntervals) {
      if (slot.start >= item.deadlineDate) break;
      if (!item.canDoAtSchool && slot.isSchoolPeriod) continue;

      const slotEnd = slot.end < item.deadlineDate ? slot.end : item.deadlineDate;
      const mins = Math.max(0, Math.round((slotEnd.getTime() - slot.start.getTime()) / (60 * 1000)));
      if (mins > maxContiguousSlot) {
        maxContiguousSlot = mins;
      }
    }

    if (maxContiguousSlot < item.unallocatedDuration) {
      warnings.push({
        id: `warn-nonsplittable-${item.id}`,
        type: 'impossible_schedule',
        severity: 'error',
        targetId: item.id,
        targetName: item.name,
        shortfallMinutes: item.unallocatedDuration - maxContiguousSlot,
        message: `"${item.name}" is marked non-splittable and requires a contiguous ${item.unallocatedDuration}m block, but the longest available open slot before ${formatDateTimeHuman(item.deadlineDate)} is only ${maxContiguousSlot}m.`,
        suggestedAction: 'Mark the task as splittable, or clear an uninterrupted time window on your calendar.',
      });
    }
  });

  // 3. Individual Task Capacity Check
  activeWork.forEach((item) => {
    if (item.deadlineDate <= currentTime) return;

    const usableCapacity = getCapacityBefore(item.deadlineDate, item.canDoAtSchool);
    if (item.unallocatedDuration > usableCapacity) {
      const shortfall = item.unallocatedDuration - usableCapacity;
      warnings.push({
        id: `warn-shortfall-${item.id}`,
        type: 'deadline_shortfall',
        severity: 'error',
        targetId: item.id,
        targetName: item.name,
        shortfallMinutes: shortfall,
        message: `${item.name} requires ${item.unallocatedDuration}m before ${formatDateTimeHuman(item.deadlineDate)}, but only ${usableCapacity}m of open time is available. Shortfall: ${shortfall}m.`,
        suggestedAction: item.canDoAtSchool
          ? 'Free up calendar time or adjust deadline.'
          : 'Free up after-school/weekend time or enable "Can do at school".',
      });
    }
  });

  // 4. Cumulative Multi-Task Deadline Feasibility
  // Evaluates competition when multiple assignments share a timeline up to a deadline
  const distinctDeadlineTimes = Array.from(
    new Set(activeWork.filter((w) => w.deadlineDate > currentTime).map((w) => w.deadlineDate.getTime()))
  ).sort((a, b) => a - b);

  for (const deadlineMs of distinctDeadlineTimes) {
    const deadlineDate = new Date(deadlineMs);
    const itemsDueByThen = activeWork.filter((w) => w.deadlineDate.getTime() <= deadlineMs);

    // Only run cumulative multi-item audit when 2 or more items compete
    if (itemsDueByThen.length > 1) {
      const totalDemand = itemsDueByThen.reduce((sum, w) => sum + w.unallocatedDuration, 0);
      const totalCapacity = getCapacityBefore(deadlineDate, true);

      const nonSchoolItems = itemsDueByThen.filter((w) => !w.canDoAtSchool);
      const nonSchoolDemand = nonSchoolItems.reduce((sum, w) => sum + w.unallocatedDuration, 0);
      const nonSchoolCapacity = getCapacityBefore(deadlineDate, false);

      if (totalDemand > totalCapacity) {
        const shortfall = totalDemand - totalCapacity;
        const itemNames = itemsDueByThen.map((w) => w.name).join(', ');
        warnings.push({
          id: `warn-cumulative-deadline-${deadlineMs}`,
          type: 'deadline_shortfall',
          severity: 'error',
          shortfallMinutes: shortfall,
          targetName: `Cumulative workload due by ${formatDateTimeHuman(deadlineDate)}`,
          message: `Multiple assignments due by ${formatDateTimeHuman(deadlineDate)} (${itemNames}) require ${totalDemand}m combined, but only ${totalCapacity}m of open calendar time is available. Shortfall: ${shortfall}m.`,
          suggestedAction: 'Reschedule competing events, negotiate due date extensions, or reduce workload.',
        });
      } else if (nonSchoolItems.length > 1 && nonSchoolDemand > nonSchoolCapacity) {
        const shortfall = nonSchoolDemand - nonSchoolCapacity;
        const itemNames = nonSchoolItems.map((w) => w.name).join(', ');
        warnings.push({
          id: `warn-nonschool-deadline-${deadlineMs}`,
          type: 'deadline_shortfall',
          severity: 'warning',
          shortfallMinutes: shortfall,
          targetName: `Non-school tasks due by ${formatDateTimeHuman(deadlineDate)}`,
          message: `Multiple home/after-school tasks due by ${formatDateTimeHuman(deadlineDate)} (${itemNames}) require ${nonSchoolDemand}m, but only ${nonSchoolCapacity}m of non-school time is available. Shortfall: ${shortfall}m.`,
          suggestedAction: 'Enable "Can do at school" for assignments that can be worked on in study hall, or clear evening events.',
        });
      }
    }
  }

  // 5. Weekly Goal Feasibility vs Remaining Week Free Time
  const endOfWeek = getLocalEndOfWeek(currentTime);

  let freeMinutesThisWeek = 0;
  for (const slot of freeIntervals) {
    if (slot.start >= endOfWeek) break;
    // Weekly goals cannot be scheduled in school periods
    if (slot.isSchoolPeriod) continue;
    const slotEnd = slot.end < endOfWeek ? slot.end : endOfWeek;
    const mins = Math.max(0, Math.round((slotEnd.getTime() - slot.start.getTime()) / (60 * 1000)));
    freeMinutesThisWeek += mins;
  }

  const homeworkDueThisWeek = activeWork
    .filter((w) => w.deadlineDate <= endOfWeek)
    .reduce((sum, w) => sum + w.unallocatedDuration, 0);

  const goalMinutesTargeted = goalCandidates.reduce(
    (sum, g) => sum + g.unallocatedWeeklyMinutes,
    0
  );

  const goalFreeCapacity = Math.max(0, freeMinutesThisWeek - homeworkDueThisWeek);

  if (goalMinutesTargeted > 0 && goalMinutesTargeted > goalFreeCapacity) {
    const goalShortfall = goalMinutesTargeted - goalFreeCapacity;
    warnings.push({
      id: 'warn-goal-capacity',
      type: 'goal_shortfall',
      severity: 'warning',
      targetName: 'Weekly Goals',
      shortfallMinutes: goalShortfall,
      message: `Weekly goals target ${goalMinutesTargeted}m, but only ${goalFreeCapacity}m of free time remains this week after required homework. Shortfall: ${goalShortfall}m.`,
      suggestedAction: 'Goals will be scheduled as capacity allows; consider lowering targets.',
    });
  }

  return {
    isFeasible: warnings.filter((w) => w.severity === 'error').length === 0,
    warnings,
  };
}
