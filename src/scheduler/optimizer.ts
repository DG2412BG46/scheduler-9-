import {
  ScheduleBlock,
  Priority,
} from '../types';
import {
  FreeInterval,
  WorkCandidate,
  GoalCandidate,
  CandidatePlan,
  PlanStrategy,
  PlanScoreBreakdown,
} from './types';
import { toLocalDateString, getLocalEndOfWeek } from '../utils/dateUtils';
import { analyzeWorkCapacity, analyzeGoalPacing } from './capacity';
import {
  evaluateHomeworkForSlot,
  evaluateGoalForSlot,
  scorePlan,
  SlotScoringContext,
  CandidateEvaluation,
  VALID_SESSION_LENGTHS,
  isDeepWorkProject,
} from './scoring';

export { scorePlan } from './scoring';

const PRIORITY_MULTIPLIERS: Record<Priority, number> = {
  high: 1.6,
  medium: 1.0,
  low: 0.7,
};

interface DailyWorkloadTracker {
  totalMinutes: number;
  highFocusMinutes: number;
  subjects: Set<string>;
  blocksCount: number;
}

/**
 * Deep clone candidate states for plan simulation.
 */
function cloneCandidates(
  workCandidates: WorkCandidate[],
  goalCandidates: GoalCandidate[]
): {
  work: WorkCandidate[];
  goals: GoalCandidate[];
} {
  return {
    work: workCandidates.map((w) => ({
      ...w,
      scheduledDates: new Set(w.scheduledDates),
    })),
    goals: goalCandidates.map((g) => ({
      ...g,
      scheduledDates: new Set(g.scheduledDates),
    })),
  };
}

/**
 * Checks whether a candidate block strictly satisfies all hard constraints.
 */
export function validateHardConstraints(params: {
  block: ScheduleBlock;
  workCandidates: WorkCandidate[];
  goalCandidates: GoalCandidate[];
  freeIntervals: FreeInterval[];
  currentTime: Date;
  allBlocks: ScheduleBlock[];
}): boolean {
  const { block, workCandidates, goalCandidates, freeIntervals, currentTime, allBlocks } = params;

  const bStart = new Date(block.startTime);
  const bEnd = new Date(block.endTime);

  // 1. Must be in future
  if (bStart < currentTime) return false;
  if (bEnd <= bStart) return false;

  // 2. Overlap check with other blocks in this plan
  for (const other of allBlocks) {
    if (other.id === block.id) continue;
    const oStart = new Date(other.startTime);
    const oEnd = new Date(other.endTime);
    if (bStart < oEnd && bEnd > oStart) {
      return false; // Overlap detected
    }
  }

  // 3. Must fit within at least one free interval (guaranteeing wake/sleep bounds & no event conflicts)
  const containerInterval = freeIntervals.find(
    (f) => bStart >= f.start && bEnd <= f.end
  );
  if (!containerInterval) return false;

  // 4. Work item hard constraints
  if (block.workType === 'homework' || block.workType === 'study') {
    const hw = workCandidates.find((w) => w.id === block.workId);
    if (hw) {
      // Hard: Block end must be <= homework deadline
      if (bEnd.getTime() > hw.deadlineDate.getTime()) return false;

      // Hard: Study block end must be <= assessment start
      if (hw.assessmentDate && bEnd.getTime() > hw.assessmentDate.getTime()) return false;

      // Hard: Non-school doable task cannot be in school period
      if (containerInterval.isSchoolPeriod && !hw.canDoAtSchool) return false;

      // Hard: Non-splittable task cannot be placed in fragments
      if (!hw.splittable && block.durationMinutes < hw.unallocatedDuration) {
        return false;
      }
    }
  } else if (block.workType === 'goal') {
    const g = goalCandidates.find((goal) => goal.id === block.workId);
    if (g) {
      if (g.deadline && bEnd.getTime() > g.deadline.getTime()) return false;
      // Goals in school periods: only allow if low or medium focus
      if (containerInterval.isSchoolPeriod && g.focusRequirement === 'high') return false;
      // Hard: Weekly goal sessions must be scheduled strictly within the current week
      const endOfWeek = getLocalEndOfWeek(currentTime);
      if (bEnd.getTime() > endOfWeek.getTime()) return false;
    }
  }

  return true;
}

/**
 * Evaluates candidate choices by reasoning about future schedule consequences:
 * "If I use this block for candidate A instead of B, what does that force me to do later?"
 * Considers:
 * 1. Future capacity before each homework/test deadline.
 * 2. Competing workload due before that deadline.
 * 3. Whether delaying the work by 1+ days still leaves safe capacity.
 * 4. Goal weekly progress and whether goals are behind pace.
 * 5. Premium uninterrupted block opportunity cost (not wasting it on easy/low-focus work).
 * 6. Whether the candidate has future opportunities equally good or worse.
 * 7. Whether scheduling something now creates a future bottleneck.
 * 8. Whether another candidate would benefit substantially more from this specific time window.
 */
export function selectBestCandidateByConsequences(params: {
  evaluations: CandidateEvaluation[];
  slot: FreeInterval;
  slotIndex: number;
  remainingSlots: FreeInterval[];
  work: WorkCandidate[];
  goals: GoalCandidate[];
  currentTime: Date;
  strategy: PlanStrategy;
}): CandidateEvaluation {
  const { evaluations, slot, slotIndex, remainingSlots, work, goals, currentTime } = params;

  if (evaluations.length === 1) {
    return evaluations[0];
  }

  let bestEvaluation: CandidateEvaluation = evaluations[0];
  let highestConsequenceScore = -Infinity;

  for (const evalItem of evaluations) {
    const candidate = evalItem.candidate;
    const duration = evalItem.duration;
    const blockStart = slot.start;
    const blockEnd = new Date(blockStart.getTime() + duration * 60 * 1000);

    // 1. Simulate the future open slots after this candidate is placed
    const remainingInCurrentSlot = Math.round((slot.end.getTime() - blockEnd.getTime()) / (60 * 1000));
    const futureSlots: FreeInterval[] = [];
    if (remainingInCurrentSlot >= 30) {
      futureSlots.push({
        ...slot,
        start: new Date(blockEnd.getTime() + 5 * 60 * 1000),
        durationMinutes: remainingInCurrentSlot - 5,
      });
    }
    for (let i = slotIndex + 1; i < remainingSlots.length; i++) {
      futureSlots.push(remainingSlots[i]);
    }

    // 2. Simulated work and goals remaining unallocated minutes
    const simWork = work.map((w) => ({
      ...w,
      unallocatedDuration: w.id === candidate.id ? Math.max(0, w.unallocatedDuration - duration) : w.unallocatedDuration,
    }));
    const simGoals = goals.map((g) => ({
      ...g,
      unallocatedWeeklyMinutes: g.id === candidate.id ? Math.max(0, g.unallocatedWeeklyMinutes - duration) : g.unallocatedWeeklyMinutes,
    }));

    let consequenceScore = evalItem.score;

    // 3. Consequence on ALL competing work candidates
    for (const otherW of simWork) {
      if (otherW.id === candidate.id || otherW.unallocatedDuration <= 0) continue;

      let cutoff = otherW.deadlineDate;
      if (otherW.assessmentDate && otherW.assessmentDate < cutoff) {
        cutoff = otherW.assessmentDate;
      }

      let usableFutureMins = 0;
      let hasAdequateContiguousSlot = otherW.splittable;

      for (const fs of futureSlots) {
        if (fs.start >= cutoff) break;
        if (fs.end <= slot.start) continue;
        if (fs.isSchoolPeriod && !otherW.canDoAtSchool) continue;

        const effStart = fs.start < slot.start ? slot.start : fs.start;
        const effEnd = fs.end < cutoff ? fs.end : cutoff;
        const mins = Math.max(0, Math.floor((effEnd.getTime() - effStart.getTime()) / (60 * 1000)));
        if (mins >= 20) {
          usableFutureMins += mins;
          if (!otherW.splittable && mins >= otherW.unallocatedDuration) {
            hasAdequateContiguousSlot = true;
          }
        }
      }

      // Competing demand due on or before otherW cutoff
      let competingDemand = 0;
      for (const sw of simWork) {
        if (sw.id === otherW.id || sw.unallocatedDuration <= 0) continue;
        let swCutoff = sw.deadlineDate;
        if (sw.assessmentDate && sw.assessmentDate < swCutoff) swCutoff = sw.assessmentDate;
        if (swCutoff.getTime() <= cutoff.getTime()) {
          competingDemand += sw.unallocatedDuration;
        }
      }

      const netHeadroom = usableFutureMins - (otherW.unallocatedDuration + competingDemand);

      // Severe penalty if scheduling candidate makes otherW impossible
      if (!hasAdequateContiguousSlot) {
        consequenceScore -= 2500;
      }

      if (usableFutureMins < otherW.unallocatedDuration) {
        consequenceScore -= 2000 + (otherW.unallocatedDuration - usableFutureMins) * 5;
      } else if (netHeadroom < 0) {
        consequenceScore -= 350 + Math.abs(netHeadroom) * 2;
      } else if (netHeadroom < 45) {
        consequenceScore -= 80 + (45 - netHeadroom);
      }
    }

    // 4. Consequence on ALL competing goals
    const endOfWeek = getLocalEndOfWeek(currentTime);
    for (const otherG of simGoals) {
      if (otherG.id === candidate.id || otherG.unallocatedWeeklyMinutes <= 0) continue;

      const dayOfWeek = currentTime.getDay();
      const dayIdx = dayOfWeek === 0 ? 7 : dayOfWeek;
      const expectedPace = Math.round(otherG.weeklyTargetMinutes * (dayIdx / 7));
      const isBehind = otherG.completedMinutesThisWeek < expectedPace;

      let usableGoalMins = 0;
      for (const fs of futureSlots) {
        if (fs.start >= endOfWeek) break;
        if (fs.end <= slot.start) continue;
        if (fs.isSchoolPeriod && otherG.focusRequirement === 'high') continue;

        const effStart = fs.start < slot.start ? slot.start : fs.start;
        const effEnd = fs.end < endOfWeek ? fs.end : endOfWeek;
        const mins = Math.max(0, Math.floor((effEnd.getTime() - effStart.getTime()) / (60 * 1000)));
        if (mins >= 30) {
          usableGoalMins += mins;
        }
      }

      let competingHwThisWeek = 0;
      for (const sw of simWork) {
        if (sw.unallocatedDuration <= 0) continue;
        let swCutoff = sw.deadlineDate;
        if (sw.assessmentDate && sw.assessmentDate < swCutoff) swCutoff = sw.assessmentDate;
        if (swCutoff.getTime() <= endOfWeek.getTime()) {
          competingHwThisWeek += sw.unallocatedDuration;
        }
      }

      const netGoalHeadroom = usableGoalMins - competingHwThisWeek;
      if (isBehind) {
        if (netGoalHeadroom < otherG.unallocatedWeeklyMinutes) {
          consequenceScore -= 300;
        } else if (netGoalHeadroom < otherG.unallocatedWeeklyMinutes * 1.25) {
          consequenceScore -= 90;
        }
      }
    }

    // 5. Evaluate the cost of DEFERRING candidate (if candidate is delayed past this slot)
    const futureSlotsWithoutSlot: FreeInterval[] = [];
    for (let i = slotIndex + 1; i < remainingSlots.length; i++) {
      futureSlotsWithoutSlot.push(remainingSlots[i]);
    }

    if ('unallocatedDuration' in candidate) {
      let cutoffC = candidate.deadlineDate;
      if (candidate.assessmentDate && candidate.assessmentDate < cutoffC) {
        cutoffC = candidate.assessmentDate;
      }

      let usableWithoutSlot = 0;
      let hasAdequateWithoutSlot = candidate.splittable;

      for (const fs of futureSlotsWithoutSlot) {
        if (fs.start >= cutoffC) break;
        if (fs.isSchoolPeriod && !candidate.canDoAtSchool) continue;

        const effStart = fs.start;
        const effEnd = fs.end < cutoffC ? fs.end : cutoffC;
        const mins = Math.max(0, Math.floor((effEnd.getTime() - effStart.getTime()) / (60 * 1000)));
        if (mins >= 20) {
          usableWithoutSlot += mins;
          if (!candidate.splittable && mins >= candidate.unallocatedDuration) {
            hasAdequateWithoutSlot = true;
          }
        }
      }

      let competingForC = 0;
      for (const w of work) {
        if (w.id === candidate.id || w.unallocatedDuration <= 0) continue;
        let wCutoff = w.deadlineDate;
        if (w.assessmentDate && w.assessmentDate < wCutoff) wCutoff = w.assessmentDate;
        if (wCutoff.getTime() <= cutoffC.getTime()) {
          competingForC += w.unallocatedDuration;
        }
      }

      const headroomWithoutSlot = usableWithoutSlot - (candidate.unallocatedDuration + competingForC);

      if (!hasAdequateWithoutSlot || usableWithoutSlot < candidate.unallocatedDuration) {
        // Candidate MUST be scheduled now!
        consequenceScore += 600;
      } else if (headroomWithoutSlot < 0) {
        consequenceScore += 250 + Math.abs(headroomWithoutSlot);
      } else if (headroomWithoutSlot < 45) {
        consequenceScore += 90;
      } else if (headroomWithoutSlot >= 120 && usableWithoutSlot >= candidate.unallocatedDuration * 2.5) {
        // Safely delayable homework yields to more constrained candidates
        consequenceScore -= 45;
      }
    } else {
      // Goal
      const dayOfWeek = currentTime.getDay();
      const dayIdx = dayOfWeek === 0 ? 7 : dayOfWeek;
      const expectedPace = Math.round(candidate.weeklyTargetMinutes * (dayIdx / 7));
      const deficit = Math.max(0, expectedPace - candidate.completedMinutesThisWeek);

      if (deficit >= 30) {
        consequenceScore += 70 + Math.min(60, deficit);
      } else if (candidate.completedMinutesThisWeek >= expectedPace + 30) {
        consequenceScore -= 35;
      }
    }

    // 6. Window-to-Task Matching & Opportunity Cost of Resource
    const slotDuration = Math.round((slot.end.getTime() - slot.start.getTime()) / (60 * 1000));
    const isPremiumBlock = slotDuration >= 75 && slot.isEveningOrWeekend;
    const isDeepCandidate = isDeepWorkProject(candidate) || candidate.focusRequirement === 'high';

    if (isPremiumBlock) {
      if (isDeepCandidate && duration >= 75) {
        consequenceScore += 50;
      } else if (candidate.focusRequirement === 'low') {
        const hasHighFocusCompetitor = evaluations.some(
          (v) => (isDeepWorkProject(v.candidate) || v.candidate.focusRequirement === 'high') && v.candidate.id !== candidate.id
        );
        if (hasHighFocusCompetitor) {
          consequenceScore -= 70; // Avoid wasting premium focus blocks on low-focus tasks
        }
      }
    }

    if (slot.isSchoolPeriod) {
      if (candidate.focusRequirement === 'low' || ('canDoAtSchool' in candidate && candidate.canDoAtSchool)) {
        consequenceScore += 50; // Study hall context match
      }
    }

    if (consequenceScore > highestConsequenceScore) {
      highestConsequenceScore = consequenceScore;
      bestEvaluation = evalItem;
    }
  }

  return bestEvaluation;
}

/**
 * Generates an initial candidate plan based on a given strategic heuristic.
 * Strictly enforces that session END times do not exceed deadlines or assessment starts,
 * and that non-splittable items are never divided into multiple sessions.
 */
export function generateCandidatePlan(params: {
  strategy: PlanStrategy;
  description: string;
  freeIntervals: FreeInterval[];
  workCandidates: WorkCandidate[];
  goalCandidates: GoalCandidate[];
  currentTime: Date;
}): CandidatePlan {
  const { strategy, description, freeIntervals, workCandidates, goalCandidates, currentTime } = params;
  const { work, goals } = cloneCandidates(workCandidates, goalCandidates);

  const scheduledBlocks: ScheduleBlock[] = [];
  const dailyWorkload = new Map<string, DailyWorkloadTracker>();
  const dailyItemMinutes = new Map<string, Map<string, number>>();

  function getDailyTracker(dayStr: string): DailyWorkloadTracker {
    let t = dailyWorkload.get(dayStr);
    if (!t) {
      t = { totalMinutes: 0, highFocusMinutes: 0, subjects: new Set(), blocksCount: 0 };
      dailyWorkload.set(dayStr, t);
    }
    return t;
  }

  function getDayItemMinutes(dayStr: string): Map<string, number> {
    let m = dailyItemMinutes.get(dayStr);
    if (!m) {
      m = new Map<string, number>();
      dailyItemMinutes.set(dayStr, m);
    }
    return m;
  }

  // Work with a mutable copy of free intervals (sliced as blocks get placed)
  const remainingSlots: FreeInterval[] = freeIntervals.map((slot) => ({
    ...slot,
    start: new Date(slot.start),
    end: new Date(slot.end),
  }));

  let slotIndex = 0;

  while (slotIndex < remainingSlots.length) {
    const slot = remainingSlots[slotIndex];
    const slotDuration = Math.round((slot.end.getTime() - slot.start.getTime()) / (60 * 1000));

    if (slotDuration < 20 || slot.start < currentTime) {
      slotIndex++;
      continue;
    }

    const dayStr = toLocalDateString(slot.start);
    const dayTracker = getDailyTracker(dayStr);

    // Fatigue guard:
    const maxDailyAllowed =
      strategy === 'paced_balanced'
        ? slot.dayOfWeek === 0 || slot.dayOfWeek === 6 ? 360 : 240
        : 360;

    if (dayTracker.totalMinutes >= maxDailyAllowed) {
      while (
        slotIndex < remainingSlots.length &&
        toLocalDateString(remainingSlots[slotIndex].start) === dayStr
      ) {
        slotIndex++;
      }
      continue;
    }

    // Pacing & Free Time Preservation (Intelligent Academic Planner):
    // If today's workload has reached a balanced target (90m on weekday, 120m on weekend),
    // and ALL remaining active work items are SAFE_TO_DELAY with abundant future capacity,
    // and no remaining goal is behind weekly pace or urgent,
    // preserve the remainder of today as free time rather than aggressively filling every slot.
    const allRemainingWorkSafe = work.every((w) => {
      if (w.unallocatedDuration <= 0) return true;
      const cap = analyzeWorkCapacity({
        candidate: w,
        currentTime: slot.start,
        allActiveWork: work,
        freeIntervals: remainingSlots,
      });
      return cap.urgencyLevel === 'SAFE_TO_DELAY';
    });

    const anyGoalBehindPace = goals.some((g) => {
      if (g.unallocatedWeeklyMinutes <= 0) return false;
      const pacing = analyzeGoalPacing({
        goal: g,
        currentTime: slot.start,
        freeIntervals: remainingSlots,
        allActiveWork: work,
      });
      return pacing.isBehindPace || pacing.goalUrgencyLevel === 'URGENT' || pacing.goalUrgencyLevel === 'CRITICAL';
    });

    const balancedDailyCap = (slot.dayOfWeek === 0 || slot.dayOfWeek === 6) ? 120 : 90;
    if (dayTracker.totalMinutes >= balancedDailyCap && allRemainingWorkSafe && !anyGoalBehindPace) {
      while (
        slotIndex < remainingSlots.length &&
        toLocalDateString(remainingSlots[slotIndex].start) === dayStr
      ) {
        slotIndex++;
      }
      continue;
    }

    const slotContext: SlotScoringContext = {
      slot,
      strategy,
      currentTime,
      allActiveWork: work,
      allActiveGoals: goals,
      freeIntervals: remainingSlots,
      dayTotalMinutes: dayTracker.totalMinutes,
      dayHighFocusMinutes: dayTracker.highFocusMinutes,
      daySubjects: dayTracker.subjects,
      dayWorkItemMinutes: getDayItemMinutes(dayStr),
    };

    const viableEvaluations: CandidateEvaluation[] = [];

    // A. Evaluate Homework / Assessment Study items
    for (const hw of work) {
      const evaluation = evaluateHomeworkForSlot(hw, slotContext);
      if (evaluation && evaluation.score >= 20) {
        viableEvaluations.push(evaluation);
      }
    }

    // B. Evaluate Goal items
    for (const g of goals) {
      const evaluation = evaluateGoalForSlot(g, slotContext);
      if (evaluation && evaluation.score >= 20) {
        viableEvaluations.push(evaluation);
      }
    }

    if (viableEvaluations.length === 0) {
      slotIndex++;
      continue;
    }

    // Reason about future consequences across candidates to select best choice
    const bestChoice = selectBestCandidateByConsequences({
      evaluations: viableEvaluations,
      slot,
      slotIndex,
      remainingSlots,
      work,
      goals,
      currentTime,
      strategy,
    });

    const candidate = bestChoice.candidate;
    const blockStart = new Date(slot.start);
    const blockEnd = new Date(blockStart.getTime() + bestChoice.duration * 60 * 1000);

    const block: ScheduleBlock = {
      id: `ai-block-${strategy}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`,
      workType: bestChoice.type,
      workId: candidate.id,
      title: candidate.name,
      subject: 'subject' in candidate ? candidate.subject : undefined,
      startTime: blockStart.toISOString(),
      endTime: blockEnd.toISOString(),
      durationMinutes: bestChoice.duration,
      completed: false,
      isManual: false,
      explanation: bestChoice.explanation,
    };

    scheduledBlocks.push(block);
    candidate.scheduledDates.add(dayStr);

    if ('unallocatedDuration' in candidate) {
      candidate.unallocatedDuration -= bestChoice.duration;
    } else if ('unallocatedWeeklyMinutes' in candidate) {
      candidate.unallocatedWeeklyMinutes -= bestChoice.duration;
    }

    dayTracker.totalMinutes += bestChoice.duration;
    if (candidate.focusRequirement === 'high') {
      dayTracker.highFocusMinutes += bestChoice.duration;
    }
    if ('subject' in candidate && candidate.subject) {
      dayTracker.subjects.add(candidate.subject);
    }
    dayTracker.blocksCount++;

    const itemMap = getDayItemMinutes(dayStr);
    itemMap.set(candidate.id, (itemMap.get(candidate.id) || 0) + bestChoice.duration);

    const remainingSlotMin = Math.round((slot.end.getTime() - blockEnd.getTime()) / (60 * 1000));
    if (remainingSlotMin >= 30) {
      slot.start = new Date(blockEnd.getTime() + 5 * 60 * 1000);
    } else {
      slotIndex++;
    }
  }

  const scoreBreakdown = scorePlan({
    blocks: scheduledBlocks,
    workCandidates,
    goalCandidates,
    freeIntervals,
    strategy,
    currentTime,
  });

  return {
    strategy,
    description,
    blocks: scheduledBlocks,
    scoreBreakdown,
  };
}

/**
 * Plan-Aware Local Improvement Search:
 * Takes a candidate plan and applies local moves to iteratively increase the whole-plan score.
 * Supported moves:
 * 1. Merge compatible adjacent sessions for the same task/subject
 * 2. Swap two sessions across slots
 * 3. Move/shift a session to an alternative open slot (e.g. for better spacing or fatigue relief)
 * 4. Remove low-value sessions that cause heavy daily fatigue penalties
 * 
 * A move is accepted ONLY when it satisfies all hard constraints and strictly improves total plan score.
 */
export function applyLocalImprovements(params: {
  plan: CandidatePlan;
  workCandidates: WorkCandidate[];
  goalCandidates: GoalCandidate[];
  freeIntervals: FreeInterval[];
  currentTime: Date;
  maxIterations?: number;
}): CandidatePlan {
  const { plan, workCandidates, goalCandidates, freeIntervals, currentTime } = params;
  const maxIterations = params.maxIterations || 40;

  let currentBlocks = [...plan.blocks];
  let currentScoreBreakdown = scorePlan({
    blocks: currentBlocks,
    workCandidates,
    goalCandidates,
    freeIntervals,
    strategy: plan.strategy,
    currentTime,
  });
  let currentScore = currentScoreBreakdown.totalScore;

  // Helper to verify all blocks in a proposed plan satisfy hard constraints
  function planPassesHardConstraints(candidateBlocks: ScheduleBlock[]): boolean {
    for (const b of candidateBlocks) {
      if (
        !validateHardConstraints({
          block: b,
          workCandidates,
          goalCandidates,
          freeIntervals,
          currentTime,
          allBlocks: candidateBlocks,
        })
      ) {
        return false;
      }
    }
    return true;
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    let improved = false;

    // MOVE 1: Merge compatible strictly adjacent sessions for the same workId
    for (let i = 0; i < currentBlocks.length; i++) {
      for (let j = i + 1; j < currentBlocks.length; j++) {
        const b1 = currentBlocks[i];
        const b2 = currentBlocks[j];

        if (b1.workId && b2.workId && b1.workId === b2.workId) {
          let first: ScheduleBlock | null = null;
          let second: ScheduleBlock | null = null;

          if (b1.endTime === b2.startTime) {
            first = b1;
            second = b2;
          } else if (b2.endTime === b1.startTime) {
            first = b2;
            second = b1;
          }

          // Merge sessions ONLY when first.endTime === second.startTime
          // Do NOT merge sessions separated by a break or gap!
          if (first && second) {
            const mergedDuration = first.durationMinutes + second.durationMinutes;
            if (mergedDuration <= 120) {
              const mergedBlock: ScheduleBlock = {
                ...first,
                endTime: second.endTime,
                durationMinutes: mergedDuration,
                explanation: first.explanation || second.explanation,
              };

              const testBlocks = currentBlocks.filter((_, idx) => idx !== i && idx !== j);
              testBlocks.push(mergedBlock);

              if (planPassesHardConstraints(testBlocks)) {
                const newScore = scorePlan({
                  blocks: testBlocks,
                  workCandidates,
                  goalCandidates,
                  freeIntervals,
                  strategy: plan.strategy,
                  currentTime,
                }).totalScore;

                if (newScore > currentScore) {
                  currentBlocks = testBlocks;
                  currentScore = newScore;
                  improved = true;
                  break;
                }
              }
            }
          }
        }
      }
      if (improved) break;
    }
    if (improved) continue;

    // MOVE 2: Swap two sessions
    for (let i = 0; i < currentBlocks.length; i++) {
      for (let j = i + 1; j < currentBlocks.length; j++) {
        const b1 = currentBlocks[i];
        const b2 = currentBlocks[j];

        // Try swapping time slots if durations match or fit
        if (b1.workId !== b2.workId) {
          const swappedB1: ScheduleBlock = {
            ...b1,
            startTime: b2.startTime,
            endTime: new Date(new Date(b2.startTime).getTime() + b1.durationMinutes * 60 * 1000).toISOString(),
          };
          const swappedB2: ScheduleBlock = {
            ...b2,
            startTime: b1.startTime,
            endTime: new Date(new Date(b1.startTime).getTime() + b2.durationMinutes * 60 * 1000).toISOString(),
          };

          const testBlocks = currentBlocks.map((b, idx) => {
            if (idx === i) return swappedB1;
            if (idx === j) return swappedB2;
            return b;
          });

          if (planPassesHardConstraints(testBlocks)) {
            const newScore = scorePlan({
              blocks: testBlocks,
              workCandidates,
              goalCandidates,
              freeIntervals,
              strategy: plan.strategy,
              currentTime,
            }).totalScore;

            if (newScore > currentScore) {
              currentBlocks = testBlocks;
              currentScore = newScore;
              improved = true;
              break;
            }
          }
        }
      }
      if (improved) break;
    }
    if (improved) continue;

    // MOVE 3: Shift / Move a session to an open free interval
    for (let i = 0; i < currentBlocks.length; i++) {
      const b = currentBlocks[i];
      // Test shifting this block to open intervals that have room
      for (const interval of freeIntervals) {
        if (interval.durationMinutes < b.durationMinutes) continue;
        if (interval.start < currentTime) continue;

        const proposedStart = new Date(interval.start);
        const proposedEnd = new Date(proposedStart.getTime() + b.durationMinutes * 60 * 1000);

        // Don't test identical slot
        if (proposedStart.toISOString() === b.startTime) continue;

        const shiftedBlock: ScheduleBlock = {
          ...b,
          startTime: proposedStart.toISOString(),
          endTime: proposedEnd.toISOString(),
        };

        const testBlocks = currentBlocks.map((item, idx) => (idx === i ? shiftedBlock : item));

        if (planPassesHardConstraints(testBlocks)) {
          const newScore = scorePlan({
            blocks: testBlocks,
            workCandidates,
            goalCandidates,
            freeIntervals,
            strategy: plan.strategy,
            currentTime,
          }).totalScore;

          if (newScore > currentScore) {
            currentBlocks = testBlocks;
            currentScore = newScore;
            improved = true;
            break;
          }
        }
      }
      if (improved) break;
    }
    if (improved) continue;

    // MOVE 4: Prune low-value session if day has extreme fatigue penalty
    for (let i = currentBlocks.length - 1; i >= 0; i--) {
      const b = currentBlocks[i];
      // Only consider removing optional goal blocks or low priority items
      if (b.workType === 'goal') {
        const testBlocks = currentBlocks.filter((_, idx) => idx !== i);
        const newScore = scorePlan({
          blocks: testBlocks,
          workCandidates,
          goalCandidates,
          freeIntervals,
          strategy: plan.strategy,
          currentTime,
        }).totalScore;

        if (newScore > currentScore) {
          currentBlocks = testBlocks;
          currentScore = newScore;
          improved = true;
          break;
        }
      }
    }

    if (!improved) {
      break; // Local optimum reached
    }
  }

  // Sort blocks chronologically
  currentBlocks.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  currentScoreBreakdown = scorePlan({
    blocks: currentBlocks,
    workCandidates,
    goalCandidates,
    freeIntervals,
    strategy: plan.strategy,
    currentTime,
  });

  return {
    strategy: plan.strategy,
    description: plan.description,
    blocks: currentBlocks,
    scoreBreakdown: currentScoreBreakdown,
  };
}

/**
 * Runs the Plan-and-Score Optimizer:
 * Generates initial candidate plans across 4 distinct strategies,
 * executes Plan-Aware Local Improvements on each to maximize holistic score,
 * and selects the winning plan.
 */
export function optimizeSchedule(params: {
  freeIntervals: FreeInterval[];
  workCandidates: WorkCandidate[];
  goalCandidates: GoalCandidate[];
  currentTime: Date;
}): { bestPlan: CandidatePlan; allCandidates: CandidatePlan[] } {
  const { freeIntervals, workCandidates, goalCandidates, currentTime } = params;

  const strategies: { strategy: PlanStrategy; description: string }[] = [
    {
      strategy: 'paced_balanced',
      description: 'Paced & Balanced: Spreads workload evenly and prevents academic fatigue',
    },
    {
      strategy: 'spaced_repetition',
      description: 'Spaced Retrieval: Maximizes spaced study intervals before assessments',
    },
    {
      strategy: 'front_loaded',
      description: 'Deadline Safety: Early completion with high safety margins',
    },
    {
      strategy: 'deep_work',
      description: 'Deep Work: Prioritizes extended focus blocks for hard goals and subjects',
    },
  ];

  // 1. Generate base candidate plans
  const rawCandidates: CandidatePlan[] = strategies.map((s) =>
    generateCandidatePlan({
      strategy: s.strategy,
      description: s.description,
      freeIntervals,
      workCandidates,
      goalCandidates,
      currentTime,
    })
  );

  // 2. Apply Plan-Aware Local Improvements to each candidate plan
  const improvedCandidates: CandidatePlan[] = rawCandidates.map((rawPlan) =>
    applyLocalImprovements({
      plan: rawPlan,
      workCandidates,
      goalCandidates,
      freeIntervals,
      currentTime,
    })
  );

  // 3. Rank plans by holistic totalScore
  improvedCandidates.sort((a, b) => b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore);
  const bestPlan = improvedCandidates[0];

  return {
    bestPlan,
    allCandidates: improvedCandidates,
  };
}
