import {
  ScheduleBlock,
  FixedEventItem,
  ScheduleWarning,
} from '../types';
import {
  SchedulerInput,
  SchedulerOutput,
  WorkCandidate,
  GoalCandidate,
} from './types';
import {
  computeFreeIntervals,
  makeDateTime,
} from './availability';
import { toLocalDateString, isInLocalWeek } from '../utils/dateUtils';
import { checkFeasibility } from './feasibility';
import { optimizeSchedule } from './optimizer';

export * from './types';
export * from './availability';
export * from './feasibility';
export * from './optimizer';
export { toLocalDateString, isInLocalWeek } from '../utils/dateUtils';

/**
 * Intelligent Academic Scheduling Engine (Plan-and-Score Optimizer with Local Improvements)
 */
// Helper to compute actual minutes completed on a schedule block
function getCompletedMinutes(block: ScheduleBlock): number {
  if (block.actualMinutesCompleted !== undefined) {
    return Math.min(block.durationMinutes, Math.max(0, block.actualMinutesCompleted));
  }
  return block.completed ? block.durationMinutes : 0;
}

export function runScheduler(input: SchedulerInput): SchedulerOutput {
  const now = input.currentTime ? new Date(input.currentTime) : new Date();
  const horizonDays = input.horizonDays || 14;
  const { homework, quizzesAndTests, goals, fixedEvents, existingBlocks, settings } = input;

  // 1. REPLANNING SAFETY & PRESERVATION
  // Categorize existing blocks:
  // - Completed or past blocks
  // - Future manual blocks
  // - Partially completed blocks (preserve unfinished minutes and student's logged progress)
  const completedBlocks: ScheduleBlock[] = [];
  const futureManualBlocks: ScheduleBlock[] = [];
  const partiallyCompletedBlocks: ScheduleBlock[] = [];

  existingBlocks.forEach((block) => {
    const blockEnd = new Date(block.endTime);
    const hasProgress = (block.actualMinutesCompleted || 0) > 0;
    const isFullyCompleted = block.completed || (block.actualMinutesCompleted !== undefined && block.actualMinutesCompleted >= block.durationMinutes);

    if (isFullyCompleted || blockEnd <= now) {
      completedBlocks.push(block);
    } else if (block.isManual) {
      futureManualBlocks.push(block);
    } else if (hasProgress) {
      partiallyCompletedBlocks.push(block);
    }
  });

  const preservedBlocks = [...completedBlocks, ...futureManualBlocks, ...partiallyCompletedBlocks];

  // Minutes accounted for by future manual reservations (reserves capacity, prevents duplicate placement)
  const futureManualMinutesByWorkId = new Map<string, number>();
  futureManualBlocks.forEach((b) => {
    if (b.workId) {
      const remainingManual = Math.max(0, b.durationMinutes - getCompletedMinutes(b));
      const cur = futureManualMinutesByWorkId.get(b.workId) || 0;
      futureManualMinutesByWorkId.set(b.workId, cur + remainingManual);
    }
  });

  // Minutes completed strictly by completed or partially-completed blocks
  const completedMinutesByWorkId = new Map<string, number>();
  existingBlocks.forEach((b) => {
    if (b.workId) {
      const completedMins = getCompletedMinutes(b);
      if (completedMins > 0) {
        const cur = completedMinutesByWorkId.get(b.workId) || 0;
        completedMinutesByWorkId.set(b.workId, cur + completedMins);
      }
    }
  });

  // 2. Prepare Work Candidates
  const workCandidates: WorkCandidate[] = [];
  const lateManualWarnings: ScheduleWarning[] = [];

  homework.forEach((hw) => {
    if (hw.completed) return;

    const completedMins = completedMinutesByWorkId.get(hw.id) || 0;

    let deadline = makeDateTime(hw.dueDate, hw.dueTime || '23:59');
    let assessmentDate: Date | undefined;

    if (hw.linkedTestId) {
      const test = quizzesAndTests.find((t) => t.id === hw.linkedTestId);
      if (test) {
        deadline = makeDateTime(test.assessmentDate, test.assessmentTime || '09:00');
        assessmentDate = deadline;
      }
    }

    const cutoff = assessmentDate || deadline;

    // Inspect future manual blocks for this homework or linked study item
    const hwManualBlocks = futureManualBlocks.filter(
      (b) => b.workId === hw.id || (hw.linkedTestId && b.workId === hw.linkedTestId)
    );
    let validFutureManualMins = 0;

    hwManualBlocks.forEach((b) => {
      const bEnd = new Date(b.endTime);
      const remainingManual = Math.max(0, b.durationMinutes - getCompletedMinutes(b));
      if (remainingManual > 0) {
        if (bEnd.getTime() > cutoff.getTime()) {
          // Late manual session: ends after due date or assessment start!
          lateManualWarnings.push({
            id: `warn-late-manual-${b.id}`,
            type: 'late_manual_session',
            severity: 'error',
            targetId: hw.id,
            targetName: hw.name,
            shortfallMinutes: remainingManual,
            message: `Manually scheduled session for "${hw.name}" (${b.durationMinutes}m) ends after its ${hw.linkedTestId ? 'assessment start' : 'due date'}. This session is too late to satisfy the work requirement.`,
            suggestedAction: `Reschedule the manual session before the deadline, or let the AI schedule earlier sessions.`,
          });
        } else {
          validFutureManualMins += remainingManual;
        }
      }
    });

    // Remaining uncompleted duration
    const actualRemaining = hw.remainingDuration !== undefined
      ? Math.min(hw.remainingDuration, Math.max(0, hw.estimatedDuration - completedMins))
      : Math.max(0, hw.estimatedDuration - completedMins);

    // Unallocated duration for AI scheduler (only subtracts manual reservations that complete before the deadline)
    const unallocated = Math.max(0, actualRemaining - validFutureManualMins);

    if (unallocated <= 0) return;

    const scheduledDates = new Set<string>();
    preservedBlocks
      .filter((b) => b.workId === hw.id)
      .forEach((b) => scheduledDates.add(toLocalDateString(b.startTime)));

    workCandidates.push({
      id: hw.id,
      type: hw.linkedTestId ? 'study' : 'homework',
      name: hw.name,
      subject: hw.subject,
      totalDuration: hw.estimatedDuration,
      completedDuration: completedMins,
      unallocatedDuration: unallocated,
      deadlineDate: deadline,
      priority: hw.priority,
      focusRequirement: hw.focusRequirement,
      canDoAtSchool: hw.canDoAtSchool,
      splittable: hw.splittable,
      linkedTestId: hw.linkedTestId,
      assessmentDate,
      scheduledDates,
    });
  });

  // Also check standalone quizzes/tests with study minutes required that are not already covered in homework
  quizzesAndTests.forEach((test) => {
    if (test.completed) return;
    const hasHomework = homework.some((h) => h.id === test.linkedStudyHomeworkId || h.linkedTestId === test.id);
    if (hasHomework) return;

    const studyMins = (test as any).totalStudyTimeNeeded || test.studyMinutesRequired || 0;
    if (studyMins <= 0) return;

    const cutoff = makeDateTime(test.assessmentDate, test.assessmentTime || '09:00');
    const completedMins = completedMinutesByWorkId.get(test.id) || 0;

    const testManualBlocks = futureManualBlocks.filter((b) => b.workId === test.id);
    let validManualMins = 0;
    testManualBlocks.forEach((b) => {
      const bEnd = new Date(b.endTime);
      const remainingManual = Math.max(0, b.durationMinutes - getCompletedMinutes(b));
      if (bEnd.getTime() <= cutoff.getTime()) {
        validManualMins += remainingManual;
      }
    });

    const unallocated = Math.max(0, studyMins - completedMins - validManualMins);
    if (unallocated <= 0) return;

    const scheduledDates = new Set<string>();
    preservedBlocks
      .filter((b) => b.workId === test.id)
      .forEach((b) => scheduledDates.add(toLocalDateString(b.startTime)));

    workCandidates.push({
      id: test.id,
      type: 'study',
      name: `Study: ${test.name || (test as any).title}`,
      subject: test.subject,
      totalDuration: studyMins,
      completedDuration: completedMins,
      unallocatedDuration: unallocated,
      deadlineDate: cutoff,
      priority: test.priority,
      focusRequirement: 'high',
      canDoAtSchool: false,
      splittable: true,
      linkedTestId: test.id,
      assessmentDate: cutoff,
      scheduledDates,
    });
  });

  // Also check any standalone manual study blocks for quizzes/tests not covered under homework
  quizzesAndTests.forEach((test) => {
    const testCutoff = makeDateTime(test.assessmentDate, test.assessmentTime || '09:00');
    const manualBlocksForTest = futureManualBlocks.filter(
      (b) => b.workType === 'study' && b.workId === test.id && !homework.some((h) => h.id === b.workId)
    );
    manualBlocksForTest.forEach((b) => {
      const bEnd = new Date(b.endTime);
      if (bEnd.getTime() > testCutoff.getTime()) {
        const alreadyWarned = lateManualWarnings.some((w) => w.id === `warn-late-manual-${b.id}`);
        if (!alreadyWarned) {
          lateManualWarnings.push({
            id: `warn-late-manual-${b.id}`,
            type: 'late_manual_session',
            severity: 'error',
            targetId: test.id,
            targetName: test.name,
            shortfallMinutes: b.durationMinutes,
            message: `Manually scheduled study session for "${test.name}" (${b.durationMinutes}m) ends after its assessment start. This session is too late to satisfy the study requirement.`,
            suggestedAction: `Reschedule the manual block before the assessment start.`,
          });
        }
      }
    });
  });

  // 3. Prepare Goal Candidates
  const goalCandidates: GoalCandidate[] = [];

  goals.forEach((g) => {
    // Count only actual completed minutes within the current week toward minutesCompletedThisWeek
    const goalBlocksThisWeek = existingBlocks.filter(
      (b) => b.workId === g.id && isInLocalWeek(b.startTime, now)
    );

    const completedMinsFromBlocks = goalBlocksThisWeek.reduce(
      (sum, b) => sum + getCompletedMinutes(b),
      0
    );

    const hasAnyLoggedBlocks = goalBlocksThisWeek.some(
      (b) => b.completed || (b.actualMinutesCompleted !== undefined && b.actualMinutesCompleted > 0)
    );

    // If any blocks were logged/completed for this goal this week, use that sum.
    // Otherwise fall back to g.minutesCompletedThisWeek if provided.
    const completedThisWeek = hasAnyLoggedBlocks
      ? completedMinsFromBlocks
      : (g.minutesCompletedThisWeek || 0);

    // Only subtract future manual goal reservations if their sessions fall within the same current week!
    const futureManualThisWeek = futureManualBlocks
      .filter((b) => b.workId === g.id && isInLocalWeek(b.startTime, now))
      .reduce((sum, b) => sum + Math.max(0, b.durationMinutes - getCompletedMinutes(b)), 0);

    // Future manual blocks within this week reserve capacity and prevent duplicate placement,
    // but only completed sessions count toward completed weekly goal progress!
    const unallocated = Math.max(0, g.weeklyTargetMinutes - completedThisWeek - futureManualThisWeek);

    if (unallocated <= 0) return;

    const scheduledDates = new Set<string>();
    preservedBlocks
      .filter((b) => b.workId === g.id)
      .forEach((b) => scheduledDates.add(toLocalDateString(b.startTime)));

    goalCandidates.push({
      id: g.id,
      name: g.name,
      subject: g.subject || 'Goal',
      weeklyTargetMinutes: g.weeklyTargetMinutes,
      completedMinutesThisWeek: completedThisWeek,
      unallocatedWeeklyMinutes: unallocated,
      priority: g.priority,
      focusRequirement: g.focusRequirement,
      deadline: g.deadline ? makeDateTime(g.deadline, '23:59') : undefined,
      scheduledDates,
    });
  });

  // 4. Compute Real Availability Intervals
  const { freeIntervals, totalFreeMinutes } = computeFreeIntervals({
    settings,
    fixedEvents,
    quizzesAndTests,
    preservedBlocks,
    currentTime: now,
    horizonDays,
  });

  // 5. Run Cumulative Feasibility Audit
  const feasibility = checkFeasibility({
    workCandidates,
    goalCandidates,
    freeIntervals,
    currentTime: now,
  });

  // 6. Run Plan-and-Score Optimizer with Local Improvements
  const { bestPlan } = optimizeSchedule({
    freeIntervals,
    workCandidates,
    goalCandidates,
    currentTime: now,
  });

  // Ensure that if any goal could not be scheduled fully this week, an actionable goal_shortfall warning is present
  goalCandidates.forEach((g) => {
    const scheduledForGoal = bestPlan.blocks
      .filter((b) => b.workId === g.id)
      .reduce((sum, b) => sum + b.durationMinutes, 0);

    if (scheduledForGoal < g.unallocatedWeeklyMinutes) {
      const shortfall = g.unallocatedWeeklyMinutes - scheduledForGoal;
      const alreadyWarned = feasibility.warnings.some(
        (w) => w.type === 'goal_shortfall' && (w.targetId === g.id || w.targetName === g.name || w.targetName === 'Weekly Goals')
      );
      if (!alreadyWarned) {
        feasibility.warnings.push({
          id: `warn-goal-shortfall-${g.id}`,
          type: 'goal_shortfall',
          severity: 'warning',
          targetId: g.id,
          targetName: g.name,
          shortfallMinutes: shortfall,
          message: `Goal "${g.name}" has ${g.unallocatedWeeklyMinutes}m targeted this week, but only ${scheduledForGoal}m could be scheduled before the end of the week. Shortfall: ${shortfall}m.`,
          suggestedAction: 'Clear evening or weekend time to fit your remaining weekly goal sessions.',
        });
      }
    }
  });

  // 7. Combine Preserved Blocks with Newly Optimized Blocks
  const combinedBlocks = [...preservedBlocks, ...bestPlan.blocks];
  combinedBlocks.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  // 8. Compute Accurate Summary Metrics
  let homeworkScheduledMinutes = 0;
  let studyScheduledMinutes = 0;
  let goalScheduledMinutes = 0;

  bestPlan.blocks.forEach((b) => {
    if (b.workType === 'homework') homeworkScheduledMinutes += b.durationMinutes;
    else if (b.workType === 'study') studyScheduledMinutes += b.durationMinutes;
    else if (b.workType === 'goal') goalScheduledMinutes += b.durationMinutes;
  });

  const totalScheduledMinutes = homeworkScheduledMinutes + studyScheduledMinutes + goalScheduledMinutes;
  const freeMinutesRemaining = Math.max(0, totalFreeMinutes - totalScheduledMinutes);

  return {
    scheduledBlocks: combinedBlocks,
    summary: {
      blocksCreated: bestPlan.blocks.length,
      homeworkScheduledMinutes,
      studyScheduledMinutes,
      goalScheduledMinutes,
      freeMinutesRemaining,
      totalFreeMinutesHorizon: totalFreeMinutes,
      planScore: bestPlan.scoreBreakdown.totalScore,
      selectedPlanStrategy: bestPlan.description,
    },
    warnings: [...lateManualWarnings, ...feasibility.warnings],
  };
}
