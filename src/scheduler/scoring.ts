import { Priority, FocusRequirement, ScheduleBlock } from '../types';
import {
  FreeInterval,
  WorkCandidate,
  GoalCandidate,
  PlanStrategy,
  PlanScoreBreakdown,
} from './types';
import {
  WorkCapacityAnalysis,
  GoalPacingAnalysis,
  analyzeWorkCapacity,
  analyzeGoalPacing,
  UrgencyLevel,
} from './capacity';
import { toLocalDateString, getLocalEndOfWeek } from '../utils/dateUtils';

export const VALID_SESSION_LENGTHS = [120, 90, 75, 60, 45, 30];

export interface CandidateEvaluation {
  type: 'homework' | 'study' | 'goal';
  candidate: WorkCandidate | GoalCandidate;
  duration: number;
  score: number;
  urgencyLevel: UrgencyLevel;
  explanation: string;
}

export interface SlotScoringContext {
  slot: FreeInterval;
  strategy: PlanStrategy;
  currentTime: Date;
  allActiveWork: WorkCandidate[];
  allActiveGoals: GoalCandidate[];
  freeIntervals: FreeInterval[];
  dayTotalMinutes: number;
  dayHighFocusMinutes: number;
  daySubjects: Set<string>;
  dayWorkItemMinutes: Map<string, number>;
}

/**
 * Checks if a task name or subject indicates deep focus, project, or exam preparation
 */
export function isDeepWorkProject(item: { name: string; subject?: string }): boolean {
  const text = `${item.name} ${item.subject || ''}`.toLowerCase();
  return /usaco|amc|psat|sat|ap |code|program|project|essay|paper|build|lab|exam|robotics/.test(text);
}

/**
 * Determines optimal session length for a candidate within a given slot duration,
 * considering work type, focus requirements, urgency, and strategy.
 */
export function calculateOptimalSessionLength(params: {
  maxAvailableMins: number;
  unallocatedMins: number;
  splittable: boolean;
  focusRequirement: FocusRequirement;
  isDeepWork: boolean;
  isSchoolPeriod: boolean;
  urgencyLevel: UrgencyLevel;
  strategy: PlanStrategy;
  type: 'homework' | 'study' | 'goal';
}): number | null {
  const {
    maxAvailableMins,
    unallocatedMins,
    splittable,
    focusRequirement,
    isDeepWork,
    isSchoolPeriod,
    urgencyLevel,
    strategy,
    type,
  } = params;

  if (maxAvailableMins < 20) return null;

  // Non-splittable MUST fit contiguously
  if (!splittable) {
    if (maxAvailableMins < unallocatedMins) return null;
    return unallocatedMins;
  }

  // School periods are naturally capped
  if (isSchoolPeriod) {
    const session = Math.min(maxAvailableMins, unallocatedMins, 45);
    if (session >= 30) return session;
    if (unallocatedMins <= 25 && maxAvailableMins >= unallocatedMins) return unallocatedMins;
    return null;
  }

  // Determine wanted session length
  let wanted = 60;

  if (focusRequirement === 'high' || isDeepWork) {
    if (
      maxAvailableMins >= 120 &&
      (unallocatedMins >= 120 || isDeepWork || urgencyLevel === 'URGENT' || urgencyLevel === 'CRITICAL' || strategy === 'deep_work')
    ) {
      wanted = 120;
    } else if (maxAvailableMins >= 90 && (unallocatedMins >= 90 || isDeepWork)) {
      wanted = 90;
    } else if (maxAvailableMins >= 75 && unallocatedMins >= 75) {
      wanted = 75;
    } else if (maxAvailableMins >= 60) {
      wanted = 60;
    } else {
      wanted = 45;
    }
  } else if (focusRequirement === 'medium') {
    if (maxAvailableMins >= 90 && (urgencyLevel === 'URGENT' || urgencyLevel === 'CRITICAL')) {
      wanted = 90;
    } else if (maxAvailableMins >= 75 && strategy === 'paced_balanced') {
      wanted = 60;
    } else if (maxAvailableMins >= 60) {
      wanted = 60;
    } else {
      wanted = 45;
    }
  } else {
    // Low focus requirement
    if (maxAvailableMins >= 60 && (urgencyLevel === 'URGENT' || urgencyLevel === 'CRITICAL')) {
      wanted = 60;
    } else if (maxAvailableMins >= 45) {
      wanted = 45;
    } else {
      wanted = 30;
    }
  }

  let sessionLen = Math.min(maxAvailableMins, unallocatedMins, wanted);

  // Partial finish remainder allowance (e.g. 20m, 25m)
  if (sessionLen < 30) {
    if (unallocatedMins <= 25 && maxAvailableMins >= unallocatedMins) {
      return unallocatedMins;
    }
    return null;
  }

  // Snap to standard session lengths
  const snapped = VALID_SESSION_LENGTHS.find((len) => len <= sessionLen);
  if (snapped && snapped >= 30) {
    return snapped;
  }

  return sessionLen >= 30 ? 30 : null;
}

/**
 * Evaluates a Homework/Study candidate for a specific free slot.
 */
export function evaluateHomeworkForSlot(
  hw: WorkCandidate,
  ctx: SlotScoringContext
): CandidateEvaluation | null {
  if (hw.unallocatedDuration <= 0) return null;

  const { slot, strategy, currentTime, allActiveWork, freeIntervals, dayWorkItemMinutes, daySubjects } = ctx;

  // School check
  if (slot.isSchoolPeriod && !hw.canDoAtSchool) return null;

  let cutoffTime = hw.deadlineDate;
  if (hw.assessmentDate && hw.assessmentDate < cutoffTime) {
    cutoffTime = hw.assessmentDate;
  }

  if (slot.start.getTime() >= cutoffTime.getTime()) return null;

  const effectiveEnd = slot.end < cutoffTime ? slot.end : cutoffTime;
  const maxAvailableMins = Math.floor((effectiveEnd.getTime() - slot.start.getTime()) / (60 * 1000));
  if (maxAvailableMins < 20) return null;

  // Capacity and opportunity analysis
  const capacity = analyzeWorkCapacity({
    candidate: hw,
    currentTime: slot.start,
    allActiveWork,
    freeIntervals,
  });

  const deep = isDeepWorkProject(hw);
  let sessionLen = calculateOptimalSessionLength({
    maxAvailableMins,
    unallocatedMins: hw.unallocatedDuration,
    splittable: hw.splittable,
    focusRequirement: hw.focusRequirement,
    isDeepWork: deep,
    isSchoolPeriod: slot.isSchoolPeriod,
    urgencyLevel: capacity.urgencyLevel,
    strategy,
    type: hw.type,
  });

  if (!sessionLen) return null;

  // Verify proposed end strictly <= cutoff and <= slot.end
  const proposedEnd = new Date(slot.start.getTime() + sessionLen * 60 * 1000);
  if (proposedEnd.getTime() > cutoffTime.getTime() || proposedEnd.getTime() > slot.end.getTime()) {
    return null;
  }

  // Daily pacing guard for long assignments:
  // If safe to delay, distribute across days rather than cramming into one giant block
  const scheduledToday = dayWorkItemMinutes.get(hw.id) || 0;
  if (capacity.urgencyLevel === 'SAFE_TO_DELAY' && capacity.canSafelyDelay1Day) {
    if (capacity.daysUntilCutoff >= 4 && sessionLen > 90) {
      sessionLen = 90;
    }
    if (scheduledToday >= 90) {
      // Already did 90m today of this low-urgency task; defer remaining to future days
      return null;
    }
  }

  // Opportunity-aware scoring
  let score = capacity.urgencyScore;

  // Opportunity cost adjustment:
  // If homework is safe to delay with abundant headroom, but there are active goals behind pace,
  // reduce score so behind goals can utilize uninterrupted focus time now, scheduling homework later.
  if (capacity.urgencyLevel === 'SAFE_TO_DELAY' && capacity.canSafelyDelay1Day) {
    const hasBehindGoals = ctx.allActiveGoals.some((g) => {
      if (g.unallocatedWeeklyMinutes <= 0) return false;
      const pacing = analyzeGoalPacing({
        goal: g,
        currentTime: slot.start,
        freeIntervals,
        allActiveWork,
      });
      return pacing.isBehindPace || pacing.isSeverelyBehindPace;
    });
    if (hasBehindGoals) {
      score -= 30;
    }
  }

  // Context fit bonuses & penalties
  if (slot.isSchoolPeriod) {
    if (hw.focusRequirement === 'low' || hw.focusRequirement === 'medium') {
      score += 95; // Ideal use of school free period
    } else if (hw.focusRequirement === 'high') {
      // High focus work in school is less ideal if open evening/weekend time exists
      if (capacity.usableOpportunityCount > 1) {
        score -= 25;
      }
    }
  } else if (slot.isEveningOrWeekend) {
    if (hw.focusRequirement === 'high' || deep) {
      score += 45;
      if (strategy === 'deep_work') score += 40;
    }
  }

  // Study spacing
  if (hw.type === 'study') {
    score += 35;
    if (strategy === 'spaced_repetition') score += 50;
    if (capacity.daysUntilCutoff <= 3 && capacity.daysUntilCutoff >= 0.5) score += 35;
  }

  // Subject variety
  if (daySubjects.has(hw.subject)) {
    score -= 20;
  } else {
    score += 15;
  }

  // Strategy adjustments
  if (strategy === 'front_loaded' && capacity.daysUntilCutoff > 3) {
    score += 25;
  }

  // Natural language explanation
  let explanation = '';
  if (slot.isSchoolPeriod) {
    explanation = `Scheduled during ${slot.schoolPeriodName || 'school study period'} (${hw.subject} task marked school-friendly), saving evening hours for deep focus.`;
  } else if (hw.type === 'study') {
    const days = Math.round(capacity.daysUntilCutoff);
    explanation = `Spaced study block placed ${days > 0 ? `${days}d` : 'shortly'} prior to assessment for optimal memory retention.`;
  } else if (capacity.urgencyLevel === 'CRITICAL' || capacity.urgencyLevel === 'URGENT') {
    explanation = `Urgent deadline preparation (${hw.name} due ${hw.deadlineDate.toLocaleDateString([], { weekday: 'short' })} with limited future capacity).`;
  } else if (deep && sessionLen >= 90) {
    explanation = `Dedicated ${sessionLen}m uninterrupted deep work block for ${hw.subject} project.`;
  } else {
    explanation = `Paced study session scheduled to maintain regular academic progress before due date.`;
  }

  return {
    type: hw.type,
    candidate: hw,
    duration: sessionLen,
    score,
    urgencyLevel: capacity.urgencyLevel,
    explanation,
  };
}

/**
 * Evaluates a Goal candidate for a specific free slot.
 */
export function evaluateGoalForSlot(
  g: GoalCandidate,
  ctx: SlotScoringContext
): CandidateEvaluation | null {
  if (g.unallocatedWeeklyMinutes <= 0) return null;
  // Goals in school periods: only allow if low or medium focus (e.g. reading, language practice)
  if (ctx.slot.isSchoolPeriod && g.focusRequirement === 'high') return null;

  const { slot, strategy, currentTime, allActiveWork, freeIntervals, dayWorkItemMinutes, daySubjects } = ctx;
  const endOfWeek = getLocalEndOfWeek(currentTime);

  if (slot.start.getTime() >= endOfWeek.getTime()) return null;
  if (g.deadline && slot.start.getTime() >= g.deadline.getTime()) return null;

  let effectiveGoalEnd = endOfWeek;
  if (g.deadline && g.deadline < effectiveGoalEnd) {
    effectiveGoalEnd = g.deadline;
  }
  if (slot.end < effectiveGoalEnd) {
    effectiveGoalEnd = slot.end;
  }

  const maxAvailableMins = Math.floor((effectiveGoalEnd.getTime() - slot.start.getTime()) / (60 * 1000));
  const minRequired = g.unallocatedWeeklyMinutes <= 25 && g.unallocatedWeeklyMinutes >= 20 ? g.unallocatedWeeklyMinutes : 30;
  if (maxAvailableMins < minRequired) return null;

  // Pacing analysis
  const pacing = analyzeGoalPacing({
    goal: g,
    currentTime: slot.start,
    freeIntervals,
    allActiveWork,
  });

  const deep = isDeepWorkProject(g);
  const sessionLen = calculateOptimalSessionLength({
    maxAvailableMins,
    unallocatedMins: g.unallocatedWeeklyMinutes,
    splittable: true,
    focusRequirement: g.focusRequirement,
    isDeepWork: deep,
    isSchoolPeriod: slot.isSchoolPeriod,
    urgencyLevel: pacing.goalUrgencyLevel,
    strategy,
    type: 'goal',
  });

  if (!sessionLen) return null;

  const proposedEnd = new Date(slot.start.getTime() + sessionLen * 60 * 1000);
  if (proposedEnd.getTime() > effectiveGoalEnd.getTime()) return null;

  // Avoid over-scheduling a single goal on one day unless behind pace
  const scheduledToday = dayWorkItemMinutes.get(g.id) || 0;
  const maxDayGoalMins = (deep || g.focusRequirement === 'high') ? 120 : 90;
  if (scheduledToday >= maxDayGoalMins) {
    return null;
  }
  if (scheduledToday > 0 && !pacing.isBehindPace) {
    return null;
  }

  let score = pacing.goalUrgencyScore;

  // Premium window bonus: long evening/weekend slots are ideal for high-focus goals
  if (slot.isEveningOrWeekend) {
    if (g.focusRequirement === 'high' || deep) {
      score += 40;
      if (strategy === 'deep_work') score += 45;
    }
    if (sessionLen >= 90) {
      score += 30;
    }
  }

  // Deficit bonus
  if (pacing.isSeverelyBehindPace) {
    score += 50;
  } else if (pacing.isBehindPace) {
    score += 25;
  }

  if (strategy === 'paced_balanced' && scheduledToday === 0) {
    score += 25;
  }

  if (daySubjects.has(g.subject)) {
    score -= 15;
  }

  let explanation = `Weekly goal session for ${g.name} (${g.unallocatedWeeklyMinutes}m remaining this week).`;
  if (pacing.isBehindPace) {
    explanation = `Prioritized goal session for ${g.name} (${pacing.paceDeficitMinutes}m behind weekly pace).`;
  } else if (sessionLen >= 90 && slot.isEveningOrWeekend) {
    explanation = `Extended ${sessionLen}m focus block for ${g.name} practice.`;
  }

  return {
    type: 'goal',
    candidate: g,
    duration: sessionLen,
    score,
    urgencyLevel: pacing.goalUrgencyLevel,
    explanation,
  };
}

/**
 * Holistic Plan Scoring Function:
 * Evaluates the whole schedule across deadline safety, cognitive spacing,
 * goal pacing, daily fatigue, context fit, and subject variety.
 */
export function scorePlan(params: {
  blocks: ScheduleBlock[];
  workCandidates: WorkCandidate[];
  goalCandidates: GoalCandidate[];
  freeIntervals: FreeInterval[];
  strategy: PlanStrategy;
  currentTime?: Date;
}): PlanScoreBreakdown {
  const { blocks, workCandidates, goalCandidates, freeIntervals, currentTime } = params;
  const refTime = currentTime || (freeIntervals.length > 0 ? freeIntervals[0].start : new Date());
  const endOfWeek = getLocalEndOfWeek(refTime);

  let deadlineSafetyScore = 0;
  let studySpacingScore = 0;
  let goalPacingScore = 0;
  let fatigueAndBalanceScore = 0;
  let contextFitScore = 0;
  let subjectVarietyScore = 0;

  // 1. Deadline Safety
  workCandidates.forEach((hw) => {
    const hwBlocks = blocks.filter((b) => b.workId === hw.id);
    const scheduledMins = hwBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);

    if (scheduledMins >= hw.unallocatedDuration) {
      deadlineSafetyScore += 130;
    } else {
      const shortfall = hw.unallocatedDuration - scheduledMins;
      deadlineSafetyScore -= shortfall * 1.6;
    }

    if (!hw.splittable && hwBlocks.length > 1) {
      deadlineSafetyScore -= 1000; // Splittable false broken
    }

    hwBlocks.forEach((b) => {
      const blockEnd = new Date(b.endTime);
      const hoursBeforeDeadline = (hw.deadlineDate.getTime() - blockEnd.getTime()) / (3600 * 1000);

      if (hoursBeforeDeadline < 0) {
        deadlineSafetyScore -= 2000; // Hard constraint broken
      } else if (hoursBeforeDeadline >= 24) {
        deadlineSafetyScore += 40;
      } else if (hoursBeforeDeadline >= 6) {
        deadlineSafetyScore += 20;
      } else {
        deadlineSafetyScore -= 30;
      }

      const inSchoolPeriod = freeIntervals.some(
        (f) => f.isSchoolPeriod && new Date(b.startTime) >= f.start && blockEnd <= f.end
      );
      if (inSchoolPeriod && !hw.canDoAtSchool) {
        deadlineSafetyScore -= 2000;
      }
    });
  });

  // 2. Study Spacing
  const studyItems = workCandidates.filter((w) => w.type === 'study');
  studyItems.forEach((st) => {
    const stBlocks = blocks.filter((b) => b.workId === st.id);
    const uniqueDays = new Set(stBlocks.map((b) => toLocalDateString(b.startTime)));

    if (uniqueDays.size >= 2) {
      studySpacingScore += 150;
    } else if (uniqueDays.size === 1 && st.totalDuration >= 90) {
      studySpacingScore -= 60;
    }

    stBlocks.forEach((b) => {
      const blockEnd = new Date(b.endTime);
      if (st.assessmentDate && blockEnd.getTime() > st.assessmentDate.getTime()) {
        studySpacingScore -= 2000;
      }
    });
  });

  // 3. Goal Pacing
  goalCandidates.forEach((g) => {
    const gBlocks = blocks.filter((b) => b.workId === g.id);
    const scheduledMins = gBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);
    const uniqueDays = new Set(gBlocks.map((b) => toLocalDateString(b.startTime)));

    const fulfillment = Math.min(1.0, scheduledMins / Math.max(1, g.unallocatedWeeklyMinutes));
    goalPacingScore += fulfillment * 125;

    if (uniqueDays.size >= 3) {
      goalPacingScore += 60;
    } else if (uniqueDays.size === 2) {
      goalPacingScore += 30;
    }

    gBlocks.forEach((b) => {
      const blockEnd = new Date(b.endTime);
      if (blockEnd.getTime() > endOfWeek.getTime()) {
        goalPacingScore -= 2000;
      }
    });
  });

  // 4. Fatigue and Balance
  const blocksByDay = new Map<string, ScheduleBlock[]>();
  blocks.forEach((b) => {
    const dayStr = toLocalDateString(b.startTime);
    const list = blocksByDay.get(dayStr) || [];
    list.push(b);
    blocksByDay.set(dayStr, list);
  });

  blocksByDay.forEach((dayBlocks) => {
    const totalMins = dayBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);
    const d = new Date(dayBlocks[0].startTime);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    if (!isWeekend) {
      if (totalMins > 300) {
        fatigueAndBalanceScore -= 150;
      } else if (totalMins >= 60 && totalMins <= 210) {
        fatigueAndBalanceScore += 50;
      }
    } else {
      if (totalMins > 420) {
        fatigueAndBalanceScore -= 100;
      } else if (totalMins >= 90 && totalMins <= 300) {
        fatigueAndBalanceScore += 40;
      }
    }

    // 5. Subject Variety per day
    const daySubjects = new Set(dayBlocks.map((b) => b.subject).filter(Boolean));
    if (dayBlocks.length >= 2 && daySubjects.size > 1) {
      subjectVarietyScore += 35;
    }
  });

  // 6. Context Fit
  blocks.forEach((b) => {
    const matchingInterval = freeIntervals.find(
      (f) => new Date(b.startTime) >= f.start && new Date(b.endTime) <= f.end
    );
    if (matchingInterval?.isSchoolPeriod) {
      contextFitScore += 30;
    }
    if (matchingInterval?.isEveningOrWeekend && b.durationMinutes >= 60) {
      contextFitScore += 25;
    }
  });

  const totalScore = Math.round(
    deadlineSafetyScore +
      studySpacingScore +
      goalPacingScore +
      fatigueAndBalanceScore +
      contextFitScore +
      subjectVarietyScore
  );

  return {
    deadlineSafetyScore,
    studySpacingScore,
    goalPacingScore,
    fatigueAndBalanceScore,
    contextFitScore,
    subjectVarietyScore,
    totalScore,
  };
}
