import { Priority, FocusRequirement } from '../types';
import { FreeInterval, WorkCandidate, GoalCandidate } from './types';
import { getLocalEndOfWeek } from '../utils/dateUtils';

export type UrgencyLevel = 'CRITICAL' | 'URGENT' | 'SHOULD_START_SOON' | 'SAFE_TO_DELAY';
export type GoalPacingStatus = 'AHEAD_OF_PACE' | 'ON_PACE' | 'BEHIND_PACE' | 'SEVERELY_BEHIND_PACE';

export interface WorkCapacityAnalysis {
  workId: string;
  cutoffTime: Date;
  usableFutureMinutes: number;
  usableOpportunityCount: number;
  maxSingleSlotMinutes: number;
  competingWorkMinutes: number;
  totalDemandMinutes: number;
  netHeadroomMinutes: number;
  headroomRatio: number;
  delayTomorrowHeadroomMinutes: number;
  delayTomorrowRatio: number;
  canSafelyDelay1Day: boolean;
  urgencyLevel: UrgencyLevel;
  urgencyScore: number;
  hoursUntilCutoff: number;
  daysUntilCutoff: number;
}

export interface GoalPacingAnalysis {
  goalId: string;
  weeklyTargetMinutes: number;
  completedMinutesThisWeek: number;
  unallocatedWeeklyMinutes: number;
  dayIndexInWeek: number; // 1 = Mon ... 7 = Sun
  daysRemainingInWeek: number;
  expectedPaceMinutesToDate: number;
  paceDeficitMinutes: number;
  pacingStatus: GoalPacingStatus;
  isBehindPace: boolean;
  isSeverelyBehindPace: boolean;
  usableFutureGoalMinutesThisWeek: number;
  competingHomeworkDueThisWeek: number;
  netGoalCapacityThisWeek: number;
  goalUrgencyLevel: UrgencyLevel;
  goalUrgencyScore: number;
}

const PRIORITY_FACTORS: Record<Priority, number> = {
  high: 1.4,
  medium: 1.0,
  low: 0.75,
};

/**
 * Analyzes future capacity, competing workload, and opportunity cost of delaying
 * for a specific homework or study candidate from a given reference point in time.
 */
export function analyzeWorkCapacity(params: {
  candidate: WorkCandidate;
  currentTime: Date;
  allActiveWork: WorkCandidate[];
  freeIntervals: FreeInterval[];
}): WorkCapacityAnalysis {
  const { candidate, currentTime, allActiveWork, freeIntervals } = params;

  let cutoffTime = candidate.deadlineDate;
  if (candidate.assessmentDate && candidate.assessmentDate < cutoffTime) {
    cutoffTime = candidate.assessmentDate;
  }

  const hoursUntilCutoff = Math.max(0.1, (cutoffTime.getTime() - currentTime.getTime()) / (3600 * 1000));
  const daysUntilCutoff = hoursUntilCutoff / 24;

  let usableFutureMinutes = 0;
  let usableOpportunityCount = 0;
  let maxSingleSlotMinutes = 0;

  // 1-Day delay benchmark: starting from 24h in the future
  const tomorrowTime = new Date(currentTime.getTime() + 24 * 3600 * 1000);
  let usableAfterDelayMinutes = 0;

  for (const slot of freeIntervals) {
    if (slot.start >= cutoffTime) break;
    if (slot.end <= currentTime) continue;
    if (slot.isSchoolPeriod && !candidate.canDoAtSchool) continue;

    const effectiveStart = slot.start < currentTime ? currentTime : slot.start;
    const effectiveEnd = slot.end < cutoffTime ? slot.end : cutoffTime;
    const slotMins = Math.max(0, Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / (60 * 1000)));

    if (slotMins >= 20) {
      usableFutureMinutes += slotMins;
      if (slotMins >= 30) usableOpportunityCount++;
      if (slotMins > maxSingleSlotMinutes) maxSingleSlotMinutes = slotMins;
    }

    // Delay 1-day check
    if (slot.end > tomorrowTime) {
      const delayStart = slot.start < tomorrowTime ? tomorrowTime : slot.start;
      const delayMins = Math.max(0, Math.floor((effectiveEnd.getTime() - delayStart.getTime()) / (60 * 1000)));
      if (delayMins >= 20) {
        usableAfterDelayMinutes += delayMins;
      }
    }
  }

  // Calculate competing work due on or before this candidate's cutoff
  let competingWorkMinutes = 0;
  for (const w of allActiveWork) {
    if (w.id === candidate.id || w.unallocatedDuration <= 0) continue;
    let wCutoff = w.deadlineDate;
    if (w.assessmentDate && w.assessmentDate < wCutoff) wCutoff = w.assessmentDate;

    if (wCutoff.getTime() <= cutoffTime.getTime()) {
      competingWorkMinutes += w.unallocatedDuration;
    }
  }

  const totalDemandMinutes = candidate.unallocatedDuration + competingWorkMinutes;
  const netHeadroomMinutes = usableFutureMinutes - totalDemandMinutes;
  const headroomRatio = usableFutureMinutes / Math.max(1, totalDemandMinutes);

  const delayTomorrowHeadroomMinutes = usableAfterDelayMinutes - totalDemandMinutes;
  const delayTomorrowRatio = usableAfterDelayMinutes / Math.max(1, totalDemandMinutes);

  // Can safely delay if tomorrow still has ample buffer
  const canSafelyDelay1Day =
    delayTomorrowHeadroomMinutes >= 60 &&
    delayTomorrowRatio >= 1.5 &&
    daysUntilCutoff >= 2.0 &&
    usableOpportunityCount >= 2;

  // Urgency classification
  let urgencyLevel: UrgencyLevel;
  let baseScore: number;

  if (usableFutureMinutes < candidate.unallocatedDuration) {
    // Insufficient total future capacity even without competitors!
    urgencyLevel = 'CRITICAL';
    baseScore = 260 + (candidate.unallocatedDuration - usableFutureMinutes);
  } else if (netHeadroomMinutes < 0 || delayTomorrowHeadroomMinutes < 0 || headroomRatio < 1.25) {
    // Tight or negative headroom: delaying causes immediate bottleneck
    urgencyLevel = 'URGENT';
    baseScore = 180 + (2.0 - Math.min(2.0, headroomRatio)) * 40;
  } else if (hoursUntilCutoff <= 24) {
    urgencyLevel = 'URGENT';
    baseScore = 160 + (24 - hoursUntilCutoff) * 3;
  } else if (!canSafelyDelay1Day || headroomRatio < 2.2 || hoursUntilCutoff <= 48 || (candidate.unallocatedDuration >= 180 && daysUntilCutoff <= 5)) {
    urgencyLevel = 'SHOULD_START_SOON';
    baseScore = 100 + (2.5 - Math.min(2.5, headroomRatio)) * 25;
  } else {
    urgencyLevel = 'SAFE_TO_DELAY';
    baseScore = Math.max(15, 60 - daysUntilCutoff * 6);
  }

  const priorityMul = PRIORITY_FACTORS[candidate.priority] || 1.0;
  const urgencyScore = Math.round(baseScore * priorityMul);

  return {
    workId: candidate.id,
    cutoffTime,
    usableFutureMinutes,
    usableOpportunityCount,
    maxSingleSlotMinutes,
    competingWorkMinutes,
    totalDemandMinutes,
    netHeadroomMinutes,
    headroomRatio,
    delayTomorrowHeadroomMinutes,
    delayTomorrowRatio,
    canSafelyDelay1Day,
    urgencyLevel,
    urgencyScore,
    hoursUntilCutoff,
    daysUntilCutoff,
  };
}

/**
 * Analyzes weekly pace, expected progress, deficit, and available capacity for goals.
 */
export function analyzeGoalPacing(params: {
  goal: GoalCandidate;
  currentTime: Date;
  freeIntervals: FreeInterval[];
  allActiveWork: WorkCandidate[];
}): GoalPacingAnalysis {
  const { goal, currentTime, freeIntervals, allActiveWork } = params;

  const endOfWeek = getLocalEndOfWeek(currentTime);
  const dayOfWeek = currentTime.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const dayIndexInWeek = dayOfWeek === 0 ? 7 : dayOfWeek; // 1..7 (Mon..Sun)
  const daysRemainingInWeek = 8 - dayIndexInWeek; // includes today

  const expectedPaceMinutesToDate = Math.round(goal.weeklyTargetMinutes * (dayIndexInWeek / 7));
  const completedSoFar = goal.completedMinutesThisWeek;
  const paceDeficitMinutes = Math.max(0, expectedPaceMinutesToDate - completedSoFar);

  const isBehindPace = paceDeficitMinutes >= 30;
  const isSeverelyBehindPace =
    paceDeficitMinutes >= 60 ||
    (dayIndexInWeek >= 4 && goal.unallocatedWeeklyMinutes >= goal.weeklyTargetMinutes * 0.7);

  let pacingStatus: GoalPacingStatus;
  if (completedSoFar >= expectedPaceMinutesToDate + 30) {
    pacingStatus = 'AHEAD_OF_PACE';
  } else if (isSeverelyBehindPace) {
    pacingStatus = 'SEVERELY_BEHIND_PACE';
  } else if (isBehindPace) {
    pacingStatus = 'BEHIND_PACE';
  } else {
    pacingStatus = 'ON_PACE';
  }

  // Future goal capacity this week (non-school open intervals before Sunday ends)
  let usableFutureGoalMinutesThisWeek = 0;
  for (const slot of freeIntervals) {
    if (slot.start >= endOfWeek) break;
    if (slot.end <= currentTime) continue;
    if (slot.isSchoolPeriod) continue;

    const effectiveStart = slot.start < currentTime ? currentTime : slot.start;
    const effectiveEnd = slot.end < endOfWeek ? slot.end : endOfWeek;
    const mins = Math.max(0, Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / (60 * 1000)));
    usableFutureGoalMinutesThisWeek += mins;
  }

  // Competing homework due before end of week
  let competingHomeworkDueThisWeek = 0;
  for (const w of allActiveWork) {
    if (w.unallocatedDuration <= 0) continue;
    let cutoff = w.deadlineDate;
    if (w.assessmentDate && w.assessmentDate < cutoff) cutoff = w.assessmentDate;
    if (cutoff.getTime() <= endOfWeek.getTime()) {
      competingHomeworkDueThisWeek += w.unallocatedDuration;
    }
  }

  const netGoalCapacityThisWeek = Math.max(
    0,
    usableFutureGoalMinutesThisWeek - competingHomeworkDueThisWeek
  );

  let goalUrgencyLevel: UrgencyLevel;
  let baseScore: number;

  if (goal.unallocatedWeeklyMinutes > netGoalCapacityThisWeek) {
    goalUrgencyLevel = 'CRITICAL';
    baseScore = 200 + (goal.unallocatedWeeklyMinutes - netGoalCapacityThisWeek);
  } else if (isSeverelyBehindPace || (daysRemainingInWeek <= 2 && goal.unallocatedWeeklyMinutes >= 60)) {
    goalUrgencyLevel = 'URGENT';
    baseScore = 150 + Math.min(60, paceDeficitMinutes);
  } else if (isBehindPace || paceDeficitMinutes > 0) {
    goalUrgencyLevel = 'SHOULD_START_SOON';
    baseScore = 95 + Math.min(40, paceDeficitMinutes);
  } else {
    goalUrgencyLevel = 'SAFE_TO_DELAY';
    baseScore = 40;
  }

  const priorityMul = PRIORITY_FACTORS[goal.priority] || 1.0;
  const goalUrgencyScore = Math.round(baseScore * priorityMul);

  return {
    goalId: goal.id,
    weeklyTargetMinutes: goal.weeklyTargetMinutes,
    completedMinutesThisWeek: goal.completedMinutesThisWeek,
    unallocatedWeeklyMinutes: goal.unallocatedWeeklyMinutes,
    dayIndexInWeek,
    daysRemainingInWeek,
    expectedPaceMinutesToDate,
    paceDeficitMinutes,
    pacingStatus,
    isBehindPace,
    isSeverelyBehindPace,
    usableFutureGoalMinutesThisWeek,
    competingHomeworkDueThisWeek,
    netGoalCapacityThisWeek,
    goalUrgencyLevel,
    goalUrgencyScore,
  };
}
