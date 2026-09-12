import test from 'node:test';
import assert from 'node:assert/strict';
import { runScheduler } from './engine';
import {
  HomeworkItem,
  QuizTestItem,
  GoalItem,
  FixedEventItem,
  ScheduleBlock,
  UserScheduleSettings,
} from '../types';
import { makeDateTime, formatDate, calculateFreeIntervals } from './availability';
import { toLocalDateString } from '../utils/dateUtils';

// Base mock settings
const mockSettings: UserScheduleSettings = {
  wakeTime: '07:00',
  sleepTime: '23:00',
  schoolStartTime: '08:15',
  schoolEndTime: '15:00',
  hasSchoolOnWeekdays: true,
  schoolFreePeriods: [
    { id: 'fp-1', name: 'Study Hall', weekday: 1, startTime: '11:30', endTime: '12:15' }, // Mon
    { id: 'fp-2', name: 'Free Period', weekday: 2, startTime: '11:30', endTime: '12:15' }, // Tue
    { id: 'fp-3', name: 'Study Hall', weekday: 3, startTime: '11:30', endTime: '12:15' }, // Wed
    { id: 'fp-4', name: 'Free Period', weekday: 4, startTime: '11:30', endTime: '12:15' }, // Thu
    { id: 'fp-5', name: 'Study Hall', weekday: 5, startTime: '11:30', endTime: '12:15' }, // Fri
  ],
  holidays: [],
};

// Base fixed anchor: Monday, 2026-09-14 at 07:00 AM
const baseTime = new Date(2026, 8, 14, 7, 0, 0, 0); // Month is 0-indexed: 8 = Sep

test('1. Conflict Resolution: No blocks overlap with fixed events or other blocks', () => {
  // Fixed soccer practice on Monday 16:00 - 17:30
  const soccerEvent: FixedEventItem = {
    id: 'soccer-mon',
    title: 'Soccer Practice',
    startTime: new Date(2026, 8, 14, 16, 0).toISOString(),
    endTime: new Date(2026, 8, 14, 17, 30).toISOString(),
    type: 'fixed',
  };

  const homework: HomeworkItem[] = [
    {
      id: 'hw-1',
      name: 'History Paper',
      subject: 'History',
      estimatedDuration: 120,
      remainingDuration: 120,
      dueDate: '2026-09-15',
      dueTime: '12:00',
      priority: 'high',
      focusRequirement: 'high',
      canDoAtSchool: false,
      splittable: true,
      completed: false,
      createdAt: '2026-09-14T00:00:00Z',
    },
  ];

  const result = runScheduler({
    homework,
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [soccerEvent],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: baseTime,
    horizonDays: 7,
  });

  const soccerStart = new Date(soccerEvent.startTime).getTime();
  const soccerEnd = new Date(soccerEvent.endTime).getTime();

  // Ensure no block overlaps with soccer
  result.scheduledBlocks.forEach((b) => {
    const bStart = new Date(b.startTime).getTime();
    const bEnd = new Date(b.endTime).getTime();
    const overlaps = bStart < soccerEnd && bEnd > soccerStart;
    assert.equal(overlaps, false, `Block ${b.title} (${b.startTime} - ${b.endTime}) overlaps with soccer`);
  });

  // Ensure no two scheduled blocks overlap with each other
  for (let i = 0; i < result.scheduledBlocks.length; i++) {
    for (let j = i + 1; j < result.scheduledBlocks.length; j++) {
      const b1 = result.scheduledBlocks[i];
      const b2 = result.scheduledBlocks[j];
      const b1Start = new Date(b1.startTime).getTime();
      const b1End = new Date(b1.endTime).getTime();
      const b2Start = new Date(b2.startTime).getTime();
      const b2End = new Date(b2.endTime).getTime();
      const overlap = b1Start < b2End && b1End > b2Start;
      assert.equal(overlap, false, `Blocks ${b1.title} and ${b2.title} overlap each other`);
    }
  }
});

test('2. Sleep Constraints: No blocks scheduled during sleep hours', () => {
  const homework: HomeworkItem[] = [
    {
      id: 'hw-calc',
      name: 'Calculus Problem Set',
      subject: 'Math',
      estimatedDuration: 180,
      remainingDuration: 180,
      dueDate: '2026-09-16',
      priority: 'high',
      focusRequirement: 'high',
      canDoAtSchool: false,
      splittable: true,
      completed: false,
      createdAt: '2026-09-14T00:00:00Z',
    },
  ];

  const result = runScheduler({
    homework,
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings, // 07:00 wake, 23:00 sleep
    currentTime: baseTime,
    horizonDays: 7,
  });

  assert.ok(result.scheduledBlocks.length > 0);

  result.scheduledBlocks.forEach((b) => {
    const start = new Date(b.startTime);
    const end = new Date(b.endTime);

    // Verify time is between 07:00 and 23:00
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();

    assert.ok(
      startMinutes >= 7 * 60,
      `Block ${b.title} starts before wake time at ${start.toTimeString()}`
    );
    assert.ok(
      endMinutes <= 23 * 60,
      `Block ${b.title} ends after sleep time at ${end.toTimeString()}`
    );
  });
});

test('3. Deadline Enforcement: No blocks scheduled after homework deadline', () => {
  const deadlineDate = '2026-09-15';
  const deadlineTime = '17:00';
  const deadlineDateTime = makeDateTime(deadlineDate, deadlineTime).getTime();

  const homework: HomeworkItem[] = [
    {
      id: 'hw-chem',
      name: 'Chemistry Lab',
      subject: 'Chemistry',
      estimatedDuration: 90,
      remainingDuration: 90,
      dueDate: deadlineDate,
      dueTime: deadlineTime,
      priority: 'high',
      focusRequirement: 'high',
      canDoAtSchool: false,
      splittable: true,
      completed: false,
      createdAt: '2026-09-14T00:00:00Z',
    },
  ];

  const result = runScheduler({
    homework,
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: baseTime,
    horizonDays: 7,
  });

  const chemBlocks = result.scheduledBlocks.filter((b) => b.workId === 'hw-chem');
  assert.ok(chemBlocks.length > 0, 'Should schedule chemistry blocks');

  chemBlocks.forEach((b) => {
    const end = new Date(b.endTime).getTime();
    assert.ok(
      end <= deadlineDateTime,
      `Block ${b.title} ends after deadline: ${b.endTime} vs deadline ${new Date(deadlineDateTime).toISOString()}`
    );
  });
});

test('4. Assessment Study Placement: Study sessions strictly before assessment and spaced', () => {
  const testDate = '2026-09-16'; // Wednesday
  const testTime = '09:00';
  const testDateTime = makeDateTime(testDate, testTime).getTime();

  const quizTest: QuizTestItem = {
    id: 'test-physics',
    name: 'Physics Unit 3 Test',
    subject: 'Physics',
    type: 'test',
    assessmentDate: testDate,
    assessmentTime: testTime,
    studyMinutesRequired: 120,
    priority: 'high',
    completed: false,
    linkedStudyHomeworkId: 'hw-study-physics',
    createdAt: '2026-09-14T00:00:00Z',
  };

  const studyHw: HomeworkItem = {
    id: 'hw-study-physics',
    name: 'Study: Physics Unit 3 Test',
    subject: 'Physics',
    estimatedDuration: 120,
    remainingDuration: 120,
    dueDate: testDate,
    dueTime: testTime,
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    splittable: true,
    completed: false,
    linkedTestId: 'test-physics',
    createdAt: '2026-09-14T00:00:00Z',
  };

  const result = runScheduler({
    homework: [studyHw],
    quizzesAndTests: [quizTest],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: baseTime, // Mon 7:00 AM
    horizonDays: 7,
  });

  const studyBlocks = result.scheduledBlocks.filter((b) => b.workId === 'hw-study-physics');
  assert.ok(studyBlocks.length > 0, 'Should schedule study sessions');

  // Strict check: every study session must end before test start!
  studyBlocks.forEach((b) => {
    const end = new Date(b.endTime).getTime();
    assert.ok(
      end <= testDateTime,
      `Study session ${b.startTime} - ${b.endTime} occurs after test at ${new Date(testDateTime).toISOString()}`
    );
  });

  // Check explanations exist and describe assessment study
  studyBlocks.forEach((b) => {
    assert.ok(b.explanation && b.explanation.length > 0, 'Block must have explanation');
    assert.match(b.explanation, /assessment|spaced|exam/i);
  });
});

test('5. School Suitability: Non-school-doable items never in school; school-doable can use school', () => {
  const schoolDoableHw: HomeworkItem = {
    id: 'hw-vocab',
    name: 'Spanish Vocabulary',
    subject: 'Spanish',
    estimatedDuration: 30,
    remainingDuration: 30,
    dueDate: '2026-09-15',
    priority: 'medium',
    focusRequirement: 'low',
    canDoAtSchool: true, // Can do during school free period
    splittable: false,
    completed: false,
    createdAt: '2026-09-14T00:00:00Z',
  };

  const deepWorkHw: HomeworkItem = {
    id: 'hw-coding',
    name: 'CS Project Coding',
    subject: 'Computer Science',
    estimatedDuration: 90,
    remainingDuration: 90,
    dueDate: '2026-09-15',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false, // CANNOT do at school
    splittable: true,
    completed: false,
    createdAt: '2026-09-14T00:00:00Z',
  };

  const result = runScheduler({
    homework: [schoolDoableHw, deepWorkHw],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: baseTime,
    horizonDays: 7,
  });

  const codingBlocks = result.scheduledBlocks.filter((b) => b.workId === 'hw-coding');
  codingBlocks.forEach((b) => {
    const start = new Date(b.startTime);
    const startM = start.getHours() * 60 + start.getMinutes();
    const end = new Date(b.endTime);
    const endM = end.getHours() * 60 + end.getMinutes();

    // Monday school is 08:15 - 15:00
    const inSchoolHours = startM >= 8 * 60 + 15 && endM <= 15 * 60;
    assert.equal(inSchoolHours, false, 'Non-school task should not be in school period');
  });
});

test('6. Impossible Workload / Feasibility Warnings: Shortfall warning returned', () => {
  // Create an impossible task: requires 180m, but due today at 08:00 AM (only 60m available from 7am to 8am)
  const impossibleHw: HomeworkItem = {
    id: 'hw-impossible',
    name: 'Giant Essay',
    subject: 'English',
    estimatedDuration: 180,
    remainingDuration: 180,
    dueDate: '2026-09-14',
    dueTime: '08:00', // 1 hour after baseTime!
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    splittable: true,
    completed: false,
    createdAt: '2026-09-14T00:00:00Z',
  };

  const result = runScheduler({
    homework: [impossibleHw],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: baseTime,
    horizonDays: 7,
  });

  assert.ok(result.warnings.length > 0, 'Must produce feasibility warning');
  const warning = result.warnings.find((w) => w.targetId === 'hw-impossible');
  assert.ok(warning, 'Must find shortfall warning for Giant Essay');
  assert.ok(warning.shortfallMinutes && warning.shortfallMinutes > 0, 'Shortfall must be positive');
  assert.match(warning.message, /shortfall|requires/i);
});

test('7. Goal Balancing: Weekly goals distributed across days', () => {
  const goal: GoalItem = {
    id: 'goal-usaco',
    name: 'USACO Practice',
    subject: 'Computer Science',
    weeklyTargetMinutes: 240, // 4 hours
    priority: 'high',
    focusRequirement: 'high',
    minutesCompletedThisWeek: 0,
    createdAt: '2026-09-14T00:00:00Z',
  };

  const result = runScheduler({
    homework: [],
    quizzesAndTests: [],
    goals: [goal],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: baseTime,
    horizonDays: 7,
  });

  const goalBlocks = result.scheduledBlocks.filter((b) => b.workId === 'goal-usaco');
  assert.ok(goalBlocks.length > 0, 'Should schedule goal blocks');

  // Check that goal sessions are spread across multiple days, not crammed all on one day
  const uniqueDays = new Set(goalBlocks.map((b) => b.startTime.split('T')[0]));
  assert.ok(uniqueDays.size >= 2, `Goals should be spread across at least 2 days; got ${uniqueDays.size}`);
});

test('8. Replanning Safety: Preserves past, completed, and manual blocks', () => {
  // A manually locked future block
  const manualBlock: ScheduleBlock = {
    id: 'block-manual-1',
    workType: 'homework',
    workId: 'hw-manual',
    title: 'Custom User Session',
    startTime: new Date(2026, 8, 14, 19, 0).toISOString(),
    endTime: new Date(2026, 8, 14, 20, 0).toISOString(),
    durationMinutes: 60,
    completed: false,
    isManual: true,
  };

  // A completed past block
  const pastBlock: ScheduleBlock = {
    id: 'block-past-1',
    workType: 'homework',
    workId: 'hw-done',
    title: 'Done Assignment',
    startTime: new Date(2026, 8, 13, 19, 0).toISOString(),
    endTime: new Date(2026, 8, 13, 20, 0).toISOString(),
    durationMinutes: 60,
    completed: true,
  };

  // An unpinned future AI block from earlier run that SHOULD be replaced
  const oldAiBlock: ScheduleBlock = {
    id: 'ai-block-old',
    workType: 'goal',
    workId: 'goal-old',
    title: 'Old Goal Session',
    startTime: new Date(2026, 8, 14, 21, 0).toISOString(),
    endTime: new Date(2026, 8, 14, 22, 0).toISOString(),
    durationMinutes: 60,
    completed: false,
    isManual: false,
  };

  const result = runScheduler({
    homework: [],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [manualBlock, pastBlock, oldAiBlock],
    settings: mockSettings,
    currentTime: baseTime,
    horizonDays: 7,
  });

  const ids = result.scheduledBlocks.map((b) => b.id);
  assert.ok(ids.includes('block-manual-1'), 'Manual block must be preserved');
  assert.ok(ids.includes('block-past-1'), 'Past block must be preserved');
  assert.ok(!ids.includes('ai-block-old'), 'Old unpinned AI block should be replaced');
});

test('9. Real Availability: Event blocks school free period, and holidays clear school', () => {
  // Fixed assembly overlapping Monday free period (11:30 - 12:15)
  const assemblyEvent: FixedEventItem = {
    id: 'event-assembly',
    title: 'School Assembly',
    startTime: new Date(2026, 8, 14, 11, 30).toISOString(),
    endTime: new Date(2026, 8, 14, 12, 15).toISOString(),
    type: 'fixed',
  };

  const schoolHw: HomeworkItem = {
    id: 'hw-reading',
    name: 'History Reading',
    subject: 'History',
    estimatedDuration: 40,
    remainingDuration: 40,
    dueDate: '2026-09-15',
    priority: 'medium',
    focusRequirement: 'low',
    canDoAtSchool: true,
    splittable: false,
    completed: false,
    createdAt: '2026-09-14T00:00:00Z',
  };

  const result = runScheduler({
    homework: [schoolHw],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [assemblyEvent],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: baseTime,
    horizonDays: 7,
  });

  // Ensure no block was scheduled during the assembly
  const assemblyStart = new Date(assemblyEvent.startTime).getTime();
  const assemblyEnd = new Date(assemblyEvent.endTime).getTime();

  result.scheduledBlocks.forEach((b) => {
    const bStart = new Date(b.startTime).getTime();
    const bEnd = new Date(b.endTime).getTime();
    const overlap = bStart < assemblyEnd && bEnd > assemblyStart;
    assert.equal(overlap, false, 'No block should be placed during the assembly event');
  });

  // Verify freeMinutesRemaining is calculated and non-zero
  assert.ok(result.summary.freeMinutesRemaining > 0, 'freeMinutesRemaining must be calculated');
  assert.ok(result.summary.totalFreeMinutesHorizon > 0, 'totalFreeMinutesHorizon must be calculated');
});

test('10. Hard Constraints using Block End Time: Block end must be <= homework deadline', () => {
  // Homework with duration 60m, deadline at 17:00 on Monday
  const hw: HomeworkItem = {
    id: 'hw-deadline-end',
    name: 'Calculus Quiz Prep',
    subject: 'Math',
    estimatedDuration: 60,
    remainingDuration: 60,
    dueDate: '2026-09-14',
    dueTime: '17:00',
    priority: 'high',
    focusRequirement: 'medium',
    canDoAtSchool: false,
    splittable: false,
    completed: false,
    createdAt: '2026-09-14T00:00:00Z',
  };

  const result = runScheduler({
    homework: [hw],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: baseTime,
    horizonDays: 7,
  });

  const hwBlocks = result.scheduledBlocks.filter((b) => b.workId === 'hw-deadline-end');
  assert.ok(hwBlocks.length > 0, 'Should schedule calculus block');

  const deadlineMs = new Date(2026, 8, 14, 17, 0).getTime();
  hwBlocks.forEach((b) => {
    const endMs = new Date(b.endTime).getTime();
    assert.ok(endMs <= deadlineMs, `Block end ${b.endTime} must be <= deadline 17:00`);
  });
});

test('11. Hard Constraints: Study block end must be <= assessment start', () => {
  const quiz: QuizTestItem = {
    id: 'quiz-chem',
    name: 'Chemistry Quiz',
    subject: 'Chemistry',
    type: 'quiz',
    assessmentDate: '2026-09-15',
    assessmentTime: '10:00', // 10:00 AM on Tuesday
    studyMinutesRequired: 60,
    priority: 'high',
    completed: false,
    linkedStudyHomeworkId: 'study-chem',
    createdAt: '2026-09-14T00:00:00Z',
  };

  const studyHw: HomeworkItem = {
    id: 'study-chem',
    name: 'Study for Chemistry Quiz',
    subject: 'Chemistry',
    estimatedDuration: 60,
    remainingDuration: 60,
    dueDate: '2026-09-15',
    dueTime: '10:00',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    splittable: true,
    completed: false,
    linkedTestId: 'quiz-chem',
    createdAt: '2026-09-14T00:00:00Z',
  };

  const result = runScheduler({
    homework: [studyHw],
    quizzesAndTests: [quiz],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: baseTime,
    horizonDays: 7,
  });

  const quizStartMs = new Date(2026, 8, 15, 10, 0).getTime();
  const studyBlocks = result.scheduledBlocks.filter((b) => b.workId === 'study-chem');
  assert.ok(studyBlocks.length > 0, 'Should schedule study blocks');

  studyBlocks.forEach((b) => {
    const endMs = new Date(b.endTime).getTime();
    assert.ok(endMs <= quizStartMs, `Study session end ${b.endTime} must be <= assessment start 10:00 AM`);
  });
});

test('12. Respect Splittable: Non-splittable task must be scheduled as one contiguous session or produce warning', () => {
  // A 120-minute non-splittable lab report
  const nonSplittableHw: HomeworkItem = {
    id: 'hw-nonsplit-lab',
    name: 'Bio Lab Report',
    subject: 'Biology',
    estimatedDuration: 120,
    remainingDuration: 120,
    dueDate: '2026-09-16',
    dueTime: '22:00',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    splittable: false,
    completed: false,
    createdAt: '2026-09-14T00:00:00Z',
  };

  const result = runScheduler({
    homework: [nonSplittableHw],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: baseTime,
    horizonDays: 7,
  });

  const labBlocks = result.scheduledBlocks.filter((b) => b.workId === 'hw-nonsplit-lab');
  // It must be placed as exactly ONE contiguous session of 120 minutes!
  assert.equal(labBlocks.length, 1, 'Non-splittable 120m task must be scheduled in exactly one contiguous block');
  assert.equal(labBlocks[0].durationMinutes, 120, 'Contiguous block duration must be 120 minutes');

  // If impossible to fit in one block because of fragmented calendar:
  // Create 45m slots separated by fixed events
  const blockingEvents: FixedEventItem[] = [
    {
      id: 'block-1',
      title: 'Conflict 1',
      startTime: new Date(2026, 8, 14, 16, 0).toISOString(),
      endTime: new Date(2026, 8, 14, 18, 0).toISOString(),
      type: 'fixed',
    },
    {
      id: 'block-2',
      title: 'Conflict 2',
      startTime: new Date(2026, 8, 14, 19, 0).toISOString(),
      endTime: new Date(2026, 8, 14, 23, 0).toISOString(),
      type: 'fixed',
    },
  ];

  const shortDeadlineHw: HomeworkItem = {
    id: 'hw-impossible-nonsplit',
    name: 'Contiguous 120m Task',
    subject: 'Physics',
    estimatedDuration: 120,
    remainingDuration: 120,
    dueDate: '2026-09-14',
    dueTime: '23:00',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    splittable: false,
    completed: false,
    createdAt: '2026-09-14T00:00:00Z',
  };

  const blockedResult = runScheduler({
    homework: [shortDeadlineHw],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: blockingEvents,
    existingBlocks: [],
    settings: mockSettings,
    currentTime: baseTime,
    horizonDays: 7,
  });

  const impossibleBlocks = blockedResult.scheduledBlocks.filter((b) => b.workId === 'hw-impossible-nonsplit');
  // Must NOT split into fragments
  assert.ok(impossibleBlocks.length === 0, 'Must not fracture non-splittable task into pieces when no 120m slot exists');
  // Must return an actionable warning
  const warn = blockedResult.warnings.find((w) => w.targetId === 'hw-impossible-nonsplit');
  assert.ok(warn, 'Must produce non-splittable feasibility warning');
  assert.match(warn.message, /non-splittable/i);
});

test('13. Separate Completed Work from Reserved Future Work: Manual future blocks reserve capacity without counting as completed', () => {
  const goal: GoalItem = {
    id: 'goal-sat',
    name: 'SAT Reading Practice',
    subject: 'English',
    weeklyTargetMinutes: 240, // 4 hours target
    minutesCompletedThisWeek: 60, // 60m already completed
    priority: 'medium',
    focusRequirement: 'high',
    createdAt: '2026-09-14T00:00:00Z',
  };

  // Student manually scheduled a future 60m block for tomorrow evening
  const futureManualBlock: ScheduleBlock = {
    id: 'block-manual-sat-future',
    workType: 'goal',
    workId: 'goal-sat',
    title: 'SAT Reading Practice',
    startTime: new Date(2026, 8, 15, 19, 0).toISOString(),
    endTime: new Date(2026, 8, 15, 20, 0).toISOString(),
    durationMinutes: 60,
    completed: false,
    isManual: true,
  };

  const result = runScheduler({
    homework: [],
    quizzesAndTests: [],
    goals: [goal],
    fixedEvents: [],
    existingBlocks: [futureManualBlock],
    settings: mockSettings,
    currentTime: baseTime,
    horizonDays: 7,
  });

  // Future manual block must be preserved on calendar
  const preservedManual = result.scheduledBlocks.find((b) => b.id === 'block-manual-sat-future');
  assert.ok(preservedManual, 'Future manual block must remain reserved on the calendar');
  assert.equal(preservedManual.completed, false, 'Future manual block must remain uncompleted');

  // AI should only schedule the unallocated remainder (240 - 60 completed - 60 future manual = 120m)
  const aiGoalBlocks = result.scheduledBlocks.filter(
    (b) => b.workId === 'goal-sat' && !b.isManual
  );
  const aiMinutes = aiGoalBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  assert.equal(aiMinutes, 120, 'AI should schedule exactly 120m to fulfill target without duplicating manual block');
});

test('14. Cumulative Deadline Feasibility: Detects shortfall when multiple tasks compete before same deadline', () => {
  // Monday afternoon: only 120m free between 15:00 and 17:00 (school ends at 15:00)
  // Two assignments due Monday at 17:00: 90m and 90m = total 180m needed
  const taskA: HomeworkItem = {
    id: 'task-a',
    name: 'History Essay',
    subject: 'History',
    estimatedDuration: 90,
    remainingDuration: 90,
    dueDate: '2026-09-14',
    dueTime: '17:00',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    splittable: true,
    completed: false,
    createdAt: '2026-09-14T00:00:00Z',
  };

  const taskB: HomeworkItem = {
    id: 'task-b',
    name: 'Calculus Problem Set',
    subject: 'Math',
    estimatedDuration: 90,
    remainingDuration: 90,
    dueDate: '2026-09-14',
    dueTime: '17:00',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    splittable: true,
    completed: false,
    createdAt: '2026-09-14T00:00:00Z',
  };

  const afternoonTime = new Date(2026, 8, 14, 15, 0); // 3:00 PM Monday right after school
  const result = runScheduler({
    homework: [taskA, taskB],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: afternoonTime,
    horizonDays: 7,
  });

  // Each task on its own (90m <= 120m) would pass an independent check.
  // The cumulative audit must detect that 180m exceeds the 120m capacity!
  const cumulativeWarn = result.warnings.find(
    (w) => w.type === 'deadline_shortfall' && (w.shortfallMinutes || 0) >= 50
  );
  assert.ok(cumulativeWarn, 'Must trigger cumulative shortfall warning when combined demand exceeds open capacity');
});

test('15. Timezone & Local Date Consistency: Evening sessions group to local day', () => {
  // An evening session at 20:30 local time
  const eveningDate = new Date(2026, 8, 14, 20, 30);
  const localDayStr = toLocalDateString(eveningDate);
  assert.equal(localDayStr, '2026-09-14', 'Local date string must reflect 2026-09-14 regardless of UTC rollover');

  const formatted = formatDate(eveningDate);
  assert.equal(formatted, '2026-09-14');
});

test('16. Real School Holidays: School hours are unlocked for daytime study on holidays', () => {
  // Configure Monday 2026-09-14 as a school holiday (e.g. Labor Day)
  const holidaySettings: UserScheduleSettings = {
    ...mockSettings,
    holidays: ['2026-09-14'],
  };

  // A 180m non-school-doable project due Monday at 14:00 (during what would normally be school hours)
  const holidayProject: HomeworkItem = {
    id: 'hw-holiday-project',
    name: 'Art Portfolio Project',
    subject: 'Art',
    estimatedDuration: 180,
    remainingDuration: 180,
    dueDate: '2026-09-14',
    dueTime: '14:00',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false, // Normally forbidden during 08:15 - 15:00
    splittable: true,
    completed: false,
    createdAt: '2026-09-14T00:00:00Z',
  };

  const result = runScheduler({
    homework: [holidayProject],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: holidaySettings,
    currentTime: baseTime,
    horizonDays: 7,
  });

  const projectBlocks = result.scheduledBlocks.filter((b) => b.workId === 'hw-holiday-project');
  assert.ok(projectBlocks.length > 0, 'Should schedule blocks on school holiday daytime');

  // Verify that blocks were placed during daytime hours (between 07:00 and 14:00)
  projectBlocks.forEach((b) => {
    const bStart = new Date(b.startTime);
    const bEnd = new Date(b.endTime);
    assert.ok(bStart.getHours() >= 7, 'Block start should be after wake time');
    assert.ok(bEnd.getTime() <= new Date(2026, 8, 14, 14, 0).getTime(), 'Block end must be before 14:00 deadline');
  });
});

test('17. Plan-Aware Optimization: Local improvement moves satisfy all hard constraints', () => {
  const hwList: HomeworkItem[] = [
    {
      id: 'hw-math-1',
      name: 'Linear Algebra Set',
      subject: 'Math',
      estimatedDuration: 60,
      remainingDuration: 60,
      dueDate: '2026-09-15',
      dueTime: '18:00',
      priority: 'high',
      focusRequirement: 'high',
      canDoAtSchool: false,
      splittable: true,
      completed: false,
      createdAt: '2026-09-14T00:00:00Z',
    },
    {
      id: 'hw-lit-1',
      name: 'Hamlet Essay Draft',
      subject: 'Literature',
      estimatedDuration: 90,
      remainingDuration: 90,
      dueDate: '2026-09-16',
      dueTime: '20:00',
      priority: 'medium',
      focusRequirement: 'medium',
      canDoAtSchool: false,
      splittable: true,
      completed: false,
      createdAt: '2026-09-14T00:00:00Z',
    },
  ];

  const result = runScheduler({
    homework: hwList,
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: baseTime,
    horizonDays: 7,
  });

  assert.ok(result.summary.planScore > 0, 'Plan score should be positive');
  assert.ok(result.summary.selectedPlanStrategy.length > 0, 'Must report winning plan strategy');

  // Verify that no block in the final plan violates deadline
  result.scheduledBlocks.forEach((b) => {
    const hw = hwList.find((h) => h.id === b.workId);
    if (hw) {
      const bEnd = new Date(b.endTime).getTime();
      const dueMs = makeDateTime(hw.dueDate, hw.dueTime || '23:59').getTime();
      assert.ok(bEnd <= dueMs, `Block for ${hw.name} ends at ${b.endTime}, which must be <= ${hw.dueDate} ${hw.dueTime}`);
    }
  });
});

test('18. Merge Move Data Integrity & Invariant: durationMinutes strictly equals (endTime - startTime) / 60000', () => {
  const hw: HomeworkItem = {
    id: 'hw-merge-check',
    name: 'Research Paper Writing',
    subject: 'English',
    estimatedDuration: 180,
    remainingDuration: 180,
    dueDate: '2026-09-17',
    dueTime: '22:00',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    splittable: true,
    completed: false,
    createdAt: '2026-09-14T00:00:00Z',
  };

  const goal: GoalItem = {
    id: 'goal-merge-check',
    name: 'Python Project',
    subject: 'Coding',
    weeklyTargetMinutes: 120,
    priority: 'medium',
    focusRequirement: 'medium',
    minutesCompletedThisWeek: 0,
    createdAt: '2026-09-14T00:00:00Z',
  };

  const result = runScheduler({
    homework: [hw],
    quizzesAndTests: [],
    goals: [goal],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: baseTime,
    horizonDays: 7,
  });

  assert.ok(result.scheduledBlocks.length > 0, 'Must produce scheduled blocks');

  // Hard Invariant Check on EVERY schedule block
  result.scheduledBlocks.forEach((block) => {
    const startMs = new Date(block.startTime).getTime();
    const endMs = new Date(block.endTime).getTime();
    assert.ok(endMs > startMs, `Block ${block.id} must end after it starts`);

    const computedMinutes = Math.round((endMs - startMs) / 60000);
    assert.equal(
      block.durationMinutes,
      computedMinutes,
      `Duration invariant violated for block ${block.id}: durationMinutes=${block.durationMinutes}, but (endTime - startTime) / 60000=${computedMinutes}`
    );
  });
});

test('19. Weekly Goal Boundaries: Completed goal blocks from last week do not count toward this week target', () => {
  const codingGoal: GoalItem = {
    id: 'goal-coding',
    name: 'LeetCode Practice',
    subject: 'CS',
    weeklyTargetMinutes: 120,
    priority: 'high',
    focusRequirement: 'high',
    minutesCompletedThisWeek: 0,
    createdAt: '2026-09-01T00:00:00Z',
  };

  // Completed block from LAST WEEK: Sunday, 2026-09-13 (baseTime is Monday 2026-09-14)
  const lastWeekBlock: ScheduleBlock = {
    id: 'block-last-week',
    workType: 'goal',
    workId: 'goal-coding',
    title: 'LeetCode Practice',
    subject: 'CS',
    startTime: new Date(2026, 8, 13, 15, 0).toISOString(), // Sep 13, 15:00
    endTime: new Date(2026, 8, 13, 16, 0).toISOString(),   // Sep 13, 16:00
    durationMinutes: 60,
    completed: true,
    isManual: false,
  };

  const result = runScheduler({
    homework: [],
    quizzesAndTests: [],
    goals: [codingGoal],
    fixedEvents: [],
    existingBlocks: [lastWeekBlock],
    settings: mockSettings,
    currentTime: baseTime, // Monday Sep 14, 07:00 AM
    horizonDays: 7,
  });

  // Last week's block is preserved
  assert.ok(result.scheduledBlocks.some((b) => b.id === 'block-last-week'), 'Last week block preserved');

  // Because it was completed LAST week, it must NOT count toward this week's 120m target.
  // Full 120m must be scheduled for the current week.
  const newGoalBlocksThisWeek = result.scheduledBlocks.filter(
    (b) => b.workId === 'goal-coding' && b.id !== 'block-last-week'
  );
  const scheduledMinutesThisWeek = newGoalBlocksThisWeek.reduce((sum, b) => sum + b.durationMinutes, 0);

  assert.equal(
    scheduledMinutesThisWeek,
    120,
    `Must schedule full 120m this week, ignoring last week's completed session. Got ${scheduledMinutesThisWeek}m`
  );
});

test('20. Weekly Goal Boundaries: Manual goal blocks next week do not subtract from this week target', () => {
  const pianoGoal: GoalItem = {
    id: 'goal-piano',
    name: 'Piano Repertoire',
    subject: 'Music',
    weeklyTargetMinutes: 90,
    priority: 'medium',
    focusRequirement: 'medium',
    minutesCompletedThisWeek: 0,
    createdAt: '2026-09-01T00:00:00Z',
  };

  // Manual block reserved NEXT WEEK: Wednesday, 2026-09-23 at 16:00 (Current week is Sep 14 - Sep 20)
  const nextWeekManualBlock: ScheduleBlock = {
    id: 'manual-next-week',
    workType: 'goal',
    workId: 'goal-piano',
    title: 'Piano Repertoire',
    subject: 'Music',
    startTime: new Date(2026, 8, 23, 16, 0).toISOString(), // Sep 23 (next week)
    endTime: new Date(2026, 8, 23, 17, 30).toISOString(),   // 90 mins
    durationMinutes: 90,
    completed: false,
    isManual: true,
  };

  const result = runScheduler({
    homework: [],
    quizzesAndTests: [],
    goals: [pianoGoal],
    fixedEvents: [],
    existingBlocks: [nextWeekManualBlock],
    settings: mockSettings,
    currentTime: baseTime, // Monday Sep 14
    horizonDays: 14,
  });

  // Next week manual block should be preserved on calendar
  assert.ok(result.scheduledBlocks.some((b) => b.id === 'manual-next-week'), 'Manual block next week preserved');

  // Because the manual block is in NEXT week, it must NOT satisfy this week's 90m target.
  // The scheduler must still schedule 90m in the CURRENT week (on or before Sunday Sep 20 23:59:59).
  const currentWeekEnd = new Date(2026, 8, 20, 23, 59, 59, 999);
  const thisWeekGoalBlocks = result.scheduledBlocks.filter(
    (b) => b.workId === 'goal-piano' && b.id !== 'manual-next-week'
  );
  const thisWeekScheduled = thisWeekGoalBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);

  assert.equal(
    thisWeekScheduled,
    90,
    `Must schedule 90m for this week despite future manual reservation next week. Got ${thisWeekScheduled}m`
  );

  // Assert every newly scheduled block for this week ends strictly on or before end of current week
  thisWeekGoalBlocks.forEach((b) => {
    const bEnd = new Date(b.endTime).getTime();
    assert.ok(
      bEnd <= currentWeekEnd.getTime(),
      `Goal block ${b.id} ends at ${b.endTime}, which exceeds current week end ${currentWeekEnd.toISOString()}`
    );
  });
});

test('21. Weekly Goal Boundaries: End-of-week capacity shortfall generates actionable warning without moving target to next week', () => {
  // Start on Saturday evening, Sep 19 at 19:00 (Week ends Sunday Sep 20 at 23:59)
  const saturdayEvening = new Date(2026, 8, 19, 19, 0, 0, 0);

  // Fixed commitments filling Sunday almost completely (Sunday school / tournament 08:00 - 21:00)
  const sundayTournament: FixedEventItem = {
    id: 'sunday-tourney',
    title: 'Debate Tournament',
    startTime: new Date(2026, 8, 20, 8, 0).toISOString(),
    endTime: new Date(2026, 8, 20, 21, 30).toISOString(),
    type: 'fixed',
  };

  // Big weekly goal: 300 minutes targeted this week, but only ~1-2 hours remain in week
  const bigGoal: GoalItem = {
    id: 'goal-robotics',
    name: 'Robotics Build',
    subject: 'Engineering',
    weeklyTargetMinutes: 300,
    priority: 'high',
    focusRequirement: 'high',
    minutesCompletedThisWeek: 0,
    createdAt: '2026-09-01T00:00:00Z',
  };

  const result = runScheduler({
    homework: [],
    quizzesAndTests: [],
    goals: [bigGoal],
    fixedEvents: [sundayTournament],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: saturdayEvening,
    horizonDays: 14, // 2-week horizon
  });

  // 1. Must produce a goal_shortfall warning because 300m cannot fit before Sunday ends
  const shortfallWarning = result.warnings.find((w) => w.type === 'goal_shortfall');
  assert.ok(shortfallWarning, 'Must return a goal_shortfall warning when weekly capacity is exceeded');
  assert.ok(shortfallWarning.shortfallMinutes > 0, 'Shortfall minutes must be positive');

  // 2. CRITICAL: Never schedule this week’s weekly-goal target after the end of the current week (Sunday Sep 20 23:59:59)
  const currentWeekEnd = new Date(2026, 8, 20, 23, 59, 59, 999);
  const goalBlocks = result.scheduledBlocks.filter((b) => b.workId === 'goal-robotics');

  goalBlocks.forEach((b) => {
    const bEnd = new Date(b.endTime).getTime();
    assert.ok(
      bEnd <= currentWeekEnd.getTime(),
      `Goal session ${b.id} ends at ${b.endTime}, but must NOT be scheduled into next week (after ${currentWeekEnd.toISOString()})!`
    );
  });
});

test('22. Late Manual Homework/Study Block: Preserves block, excludes from requirement, emits error warning, schedules feasible minutes before deadline', () => {
  // Monday Sep 14, 2026 at 07:00 AM
  const baseCurrentTime = new Date(2026, 8, 14, 7, 0, 0, 0);

  // 1. Homework item due Tuesday Sep 15 at 12:00 PM (requires 120m)
  const chemHw: HomeworkItem = {
    id: 'hw-chem-lab',
    name: 'Chemistry Lab Report',
    subject: 'Chemistry',
    estimatedDuration: 120,
    remainingDuration: 120,
    dueDate: '2026-09-15',
    dueTime: '12:00',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    splittable: true,
    completed: false,
    createdAt: '2026-09-14T00:00:00Z',
  };

  // 2. Test scheduled for Wednesday Sep 16 at 10:00 AM
  const bioTest: QuizTestItem = {
    id: 'test-bio-midterm',
    name: 'Biology Midterm',
    subject: 'Biology',
    type: 'test',
    assessmentDate: '2026-09-16',
    assessmentTime: '10:00',
    studyMinutesRequired: 60,
    priority: 'high',
    completed: false,
    linkedStudyHomeworkId: 'hw-bio-study',
    createdAt: '2026-09-14T00:00:00Z',
  };

  // Study item for the test (requires 60m before test start)
  const bioStudyHw: HomeworkItem = {
    id: 'hw-bio-study',
    name: 'Study for Biology Midterm',
    subject: 'Biology',
    estimatedDuration: 60,
    remainingDuration: 60,
    dueDate: '2026-09-16',
    dueTime: '10:00',
    linkedTestId: 'test-bio-midterm',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    splittable: true,
    completed: false,
    createdAt: '2026-09-14T00:00:00Z',
  };

  // 3. User manually placed a 60m block AFTER the homework deadline (Tuesday 14:00 - 15:00, deadline was 12:00)
  const lateHwManualBlock: ScheduleBlock = {
    id: 'manual-hw-late',
    workType: 'homework',
    workId: 'hw-chem-lab',
    title: 'Chemistry Lab Report',
    subject: 'Chemistry',
    startTime: new Date(2026, 8, 15, 14, 0).toISOString(), // Tue Sep 15, 14:00
    endTime: new Date(2026, 8, 15, 15, 0).toISOString(),   // Tue Sep 15, 15:00 (after 12:00 deadline!)
    durationMinutes: 60,
    completed: false,
    isManual: true,
  };

  // 4. User manually placed a 45m study block AFTER the assessment start (Wednesday 11:00 - 11:45, test starts 10:00)
  const lateStudyManualBlock: ScheduleBlock = {
    id: 'manual-study-late',
    workType: 'study',
    workId: 'hw-bio-study',
    title: 'Study for Biology Midterm',
    subject: 'Biology',
    startTime: new Date(2026, 8, 16, 11, 0).toISOString(), // Wed Sep 16, 11:00
    endTime: new Date(2026, 8, 16, 11, 45).toISOString(),  // Wed Sep 16, 11:45 (after 10:00 test!)
    durationMinutes: 45,
    completed: false,
    isManual: true,
  };

  const result = runScheduler({
    homework: [chemHw, bioStudyHw],
    quizzesAndTests: [bioTest],
    goals: [],
    fixedEvents: [],
    existingBlocks: [lateHwManualBlock, lateStudyManualBlock],
    settings: mockSettings,
    currentTime: baseCurrentTime,
    horizonDays: 7,
  });

  // RULE REQUIREMENT 1: Preserve the manual block exactly as placed
  const preservedHwManual = result.scheduledBlocks.find((b) => b.id === 'manual-hw-late');
  assert.ok(preservedHwManual, 'Manual homework block must be preserved');
  assert.equal(preservedHwManual.startTime, lateHwManualBlock.startTime, 'Manual block start time must not move');
  assert.equal(preservedHwManual.endTime, lateHwManualBlock.endTime, 'Manual block end time must not move');

  const preservedStudyManual = result.scheduledBlocks.find((b) => b.id === 'manual-study-late');
  assert.ok(preservedStudyManual, 'Manual study block must be preserved');
  assert.equal(preservedStudyManual.startTime, lateStudyManualBlock.startTime, 'Manual study start time must not move');
  assert.equal(preservedStudyManual.endTime, lateStudyManualBlock.endTime, 'Manual study end time must not move');

  // RULE REQUIREMENT 2 & 3: Produce an error warning explaining that the manually scheduled session is too late
  const hwLateWarning = result.warnings.find(
    (w) => w.severity === 'error' && w.targetId === chemHw.id
  );
  assert.ok(hwLateWarning, 'Must produce an error warning for the late homework manual session');
  assert.match(hwLateWarning.message, /ends after its due date|too late/i, 'Warning explains session is too late');

  const studyLateWarning = result.warnings.find(
    (w) => w.severity === 'error' && w.targetId === bioStudyHw.id
  );
  assert.ok(studyLateWarning, 'Must produce an error warning for the late study manual session');
  assert.match(studyLateWarning.message, /ends after its assessment start|too late/i, 'Warning explains study session is too late');

  // RULE REQUIREMENT 4: Do not count late minutes toward satisfying the requirement,
  // and schedule remaining feasible minutes before the deadline!
  const chemDueMs = makeDateTime(chemHw.dueDate, chemHw.dueTime || '23:59').getTime();
  const newlyScheduledChemBlocks = result.scheduledBlocks.filter(
    (b) => b.workId === chemHw.id && b.id !== 'manual-hw-late'
  );
  const scheduledChemMinutes = newlyScheduledChemBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);

  // Because the 60m late manual block was NOT counted toward satisfying the requirement,
  // the scheduler must have scheduled the full 120m before Tuesday 12:00 PM!
  assert.equal(
    scheduledChemMinutes,
    120,
    `Full 120m of Chemistry Lab Report must be scheduled before deadline, got ${scheduledChemMinutes}m`
  );
  newlyScheduledChemBlocks.forEach((b) => {
    const bEnd = new Date(b.endTime).getTime();
    assert.ok(
      bEnd <= chemDueMs,
      `Scheduled block for Chemistry Lab Report ends at ${b.endTime}, which must be <= deadline ${chemHw.dueDate} ${chemHw.dueTime}`
    );
  });

  // Similarly, full 60m of Biology Midterm study must be scheduled before Wednesday 10:00 AM
  const bioTestStartMs = makeDateTime(bioTest.assessmentDate, bioTest.assessmentTime || '09:00').getTime();
  const newlyScheduledBioBlocks = result.scheduledBlocks.filter(
    (b) => b.workId === bioStudyHw.id && b.id !== 'manual-study-late'
  );
  const scheduledBioMinutes = newlyScheduledBioBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);

  assert.equal(
    scheduledBioMinutes,
    60,
    `Full 60m of Biology Midterm study must be scheduled before assessment start, got ${scheduledBioMinutes}m`
  );
  newlyScheduledBioBlocks.forEach((b) => {
    const bEnd = new Date(b.endTime).getTime();
    assert.ok(
      bEnd <= bioTestStartMs,
      `Scheduled study block ends at ${b.endTime}, which must be <= assessment start ${bioTest.assessmentDate} ${bioTest.assessmentTime}`
    );
  });
});

test('23. Partial Progress: Partially completed homework block counts only actual minutes and replans remaining unfinished minutes', () => {
  const baseCurrentTime = new Date(2026, 8, 14, 16, 0); // Monday Sep 14, 4:00 PM

  const mathHw: HomeworkItem = {
    id: 'hw-math-partial',
    name: 'Math Problem Set 4',
    subject: 'Math',
    estimatedDuration: 60,
    remainingDuration: 60,
    dueDate: '2026-09-15',
    dueTime: '23:59',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    splittable: true,
    completed: false,
    createdAt: '2026-09-14T08:00:00Z',
  };

  // Student planned 60m session earlier today, but logged partial progress: 35 of 60 minutes
  const partialHwBlock: ScheduleBlock = {
    id: 'block-math-partial-1',
    workType: 'homework',
    workId: mathHw.id,
    title: mathHw.name,
    subject: mathHw.subject,
    startTime: new Date(2026, 8, 14, 14, 0).toISOString(),
    endTime: new Date(2026, 8, 14, 15, 0).toISOString(),
    durationMinutes: 60,
    actualMinutesCompleted: 35, // 35 of 60 done
    completed: false, // Incomplete
  };

  const result = runScheduler({
    homework: [mathHw],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [partialHwBlock],
    settings: mockSettings,
    currentTime: baseCurrentTime,
    horizonDays: 7,
  });

  // 1. The partially completed session must be preserved on the calendar
  const preservedBlock = result.scheduledBlocks.find((b) => b.id === 'block-math-partial-1');
  assert.ok(preservedBlock, 'Partially worked block must be preserved on calendar');
  assert.equal(preservedBlock.actualMinutesCompleted, 35, 'Preserved block retains 35 actual minutes completed');

  // 2. Unfinished minutes (60 - 35 = 25 minutes) must be replanned by the AI before the deadline
  const newlyScheduled = result.scheduledBlocks.filter(
    (b) => b.workId === mathHw.id && b.id !== 'block-math-partial-1'
  );
  const newScheduledMinutes = newlyScheduled.reduce((sum, b) => sum + b.durationMinutes, 0);

  assert.equal(
    newScheduledMinutes,
    25,
    `AI must schedule exactly the remaining 25 unfinished minutes (60 - 35 = 25), got ${newScheduledMinutes}m`
  );

  const dueMs = makeDateTime(mathHw.dueDate, mathHw.dueTime || '23:59').getTime();
  newlyScheduled.forEach((b) => {
    assert.ok(
      new Date(b.endTime).getTime() <= dueMs,
      `Replanned block ${b.id} must finish before deadline`
    );
  });
});

test('24. Partial Progress: Partially completed goal session counts only actual minutes toward weekly goal and replans remainder', () => {
  const baseCurrentTime = new Date(2026, 8, 14, 16, 0); // Monday Sep 14, 4:00 PM

  const guitarGoal: GoalItem = {
    id: 'goal-guitar-partial',
    name: 'Guitar Practice',
    subject: 'Music',
    weeklyTargetMinutes: 60,
    minutesCompletedThisWeek: 0,
    priority: 'medium',
    focusRequirement: 'medium',
    createdAt: '2026-09-14T08:00:00Z',
  };

  // Student planned 60m session, logged 35 minutes completed
  const partialGoalBlock: ScheduleBlock = {
    id: 'block-guitar-partial-1',
    workType: 'goal',
    workId: guitarGoal.id,
    title: guitarGoal.name,
    subject: guitarGoal.subject,
    startTime: new Date(2026, 8, 14, 14, 0).toISOString(),
    endTime: new Date(2026, 8, 14, 15, 0).toISOString(),
    durationMinutes: 60,
    actualMinutesCompleted: 35, // 35 of 60 done
    completed: false, // Incomplete
  };

  const result = runScheduler({
    homework: [],
    quizzesAndTests: [],
    goals: [guitarGoal],
    fixedEvents: [],
    existingBlocks: [partialGoalBlock],
    settings: mockSettings,
    currentTime: baseCurrentTime,
    horizonDays: 7,
  });

  // 1. Partially completed goal block must be preserved
  const preservedBlock = result.scheduledBlocks.find((b) => b.id === 'block-guitar-partial-1');
  assert.ok(preservedBlock, 'Partially worked goal block must be preserved');
  assert.equal(preservedBlock.actualMinutesCompleted, 35, 'Preserved goal block retains 35 actual minutes completed');

  // 2. Unfinished minutes (60 - 35 = 25 minutes) must be scheduled within the current week by AI
  const newlyScheduled = result.scheduledBlocks.filter(
    (b) => b.workId === guitarGoal.id && b.id !== 'block-guitar-partial-1'
  );
  const newScheduledMinutes = newlyScheduled.reduce((sum, b) => sum + b.durationMinutes, 0);

  assert.equal(
    newScheduledMinutes,
    25,
    `AI must schedule exactly the remaining 25 minutes for the weekly goal (60 - 35 = 25), got ${newScheduledMinutes}m`
  );
});

// ==========================================
// OPPORTUNITY-AWARE ENGINE TESTS (25 - 34)
// ==========================================

test('25. Opportunity Cost & Squeezed Future Capacity: Anticipates tomorrow bottleneck and schedules today', () => {
  // Monday 16:00: History paper (120m) due Wednesday 23:59.
  // Tuesday is packed with all-evening drama rehearsal (16:00 - 22:30).
  // Delaying History until Tuesday would squeeze capacity or fail.
  // Optimizer reasons about future headroom and schedules History on Monday.
  const monday4pm = new Date(2026, 8, 14, 16, 0);

  const tuesdayDrama: FixedEventItem = {
    id: 'tuesday-drama',
    title: 'Drama Rehearsal',
    startTime: new Date(2026, 8, 15, 16, 0).toISOString(),
    endTime: new Date(2026, 8, 15, 22, 30).toISOString(),
    type: 'fixed',
  };

  const historyPaper: HomeworkItem = {
    id: 'hw-history-paper',
    name: 'Civil War Essay',
    subject: 'History',
    estimatedDuration: 120,
    remainingDuration: 120,
    dueDate: '2026-09-16',
    dueTime: '23:59',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    completed: false,
    splittable: true,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [historyPaper],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [tuesdayDrama],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: monday4pm,
    horizonDays: 7,
  });

  const historyBlocksMonday = result.scheduledBlocks.filter(
    (b) => b.workId === 'hw-history-paper' && toLocalDateString(b.startTime) === '2026-09-14'
  );

  const mondayMins = historyBlocksMonday.reduce((sum, b) => sum + b.durationMinutes, 0);
  assert.ok(mondayMins >= 60, `Must schedule at least 60m of History on Monday due to Tuesday bottleneck, got ${mondayMins}m`);
});

test('26. Goals Treated as Real Work: High-priority goal scheduled with homework rather than starved', () => {
  // Monday 16:00. Math homework (60m due Wed) + High-priority SAT Prep goal (90m weekly target).
  // The engine should not neglect or starve the goal; both should be scheduled.
  const monday4pm = new Date(2026, 8, 14, 16, 0);

  const mathHw: HomeworkItem = {
    id: 'hw-math-60',
    name: 'Calculus Problem Set',
    subject: 'Math',
    estimatedDuration: 60,
    remainingDuration: 60,
    dueDate: '2026-09-16',
    dueTime: '23:59',
    priority: 'medium',
    focusRequirement: 'high',
    canDoAtSchool: false,
    completed: false,
    splittable: true,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const satGoal: GoalItem = {
    id: 'goal-sat-prep',
    name: 'SAT Reading Practice',
    subject: 'Test Prep',
    weeklyTargetMinutes: 90,
    minutesCompletedThisWeek: 0,
    priority: 'high',
    focusRequirement: 'high',
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [mathHw],
    quizzesAndTests: [],
    goals: [satGoal],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: monday4pm,
    horizonDays: 7,
  });

  const goalBlocks = result.scheduledBlocks.filter((b) => b.workId === 'goal-sat-prep');
  const goalMinutes = goalBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);

  assert.ok(goalMinutes >= 60, `High priority goal must be scheduled for at least 60m this week, got ${goalMinutes}m`);
  const hwBlocks = result.scheduledBlocks.filter((b) => b.workId === 'hw-math-60');
  const hwMinutes = hwBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  assert.equal(hwMinutes, 60, `Homework must also be scheduled fully for 60m`);
});

test('27. Intelligent Multi-Day Distribution: 180m assignment distributed across multiple days', () => {
  // Monday 16:00. English essay (180m) due Thursday 23:59.
  // Human academic planner distributes work across multiple days to avoid cognitive overload.
  const monday4pm = new Date(2026, 8, 14, 16, 0);

  const englishEssay: HomeworkItem = {
    id: 'hw-english-180',
    name: 'Macbeth Literary Analysis',
    subject: 'English',
    estimatedDuration: 180,
    remainingDuration: 180,
    dueDate: '2026-09-17',
    dueTime: '23:59',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    completed: false,
    splittable: true,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [englishEssay],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: monday4pm,
    horizonDays: 7,
  });

  const blocks = result.scheduledBlocks.filter((b) => b.workId === 'hw-english-180');
  const scheduledDays = new Set(blocks.map((b) => toLocalDateString(b.startTime)));

  assert.ok(
    scheduledDays.size >= 2,
    `180m paper must be distributed across at least 2 distinct days, got ${scheduledDays.size} days: ${Array.from(scheduledDays).join(', ')}`
  );
  const totalMins = blocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  assert.equal(totalMins, 180, `All 180 minutes must be scheduled`);
});

test('28. School Free Period Context Matching: Low-focus school task placed in study hall, high-focus math at home', () => {
  // Monday morning 07:00. Study hall available 11:30 - 12:15 (45m).
  // History reading: 40m, canDoAtSchool = true, focusRequirement = low.
  // Math homework: 60m, canDoAtSchool = false, focusRequirement = high.
  const mondayMorning = new Date(2026, 8, 14, 7, 0);

  const historyReading: HomeworkItem = {
    id: 'hw-history-read',
    name: 'History Textbook Reading',
    subject: 'History',
    estimatedDuration: 40,
    remainingDuration: 40,
    dueDate: '2026-09-15',
    dueTime: '23:59',
    priority: 'medium',
    focusRequirement: 'low',
    canDoAtSchool: true,
    completed: false,
    splittable: false,
    createdAt: '2026-09-14T07:00:00Z',
  };

  const mathProof: HomeworkItem = {
    id: 'hw-math-proof',
    name: 'Geometry Proofs',
    subject: 'Math',
    estimatedDuration: 60,
    remainingDuration: 60,
    dueDate: '2026-09-15',
    dueTime: '23:59',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    completed: false,
    splittable: true,
    createdAt: '2026-09-14T07:00:00Z',
  };

  const result = runScheduler({
    homework: [historyReading, mathProof],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: mondayMorning,
    horizonDays: 7,
  });

  // History reading should be placed in Monday study hall (11:30 - 12:15)
  const historyBlock = result.scheduledBlocks.find((b) => b.workId === 'hw-history-read');
  assert.ok(historyBlock, 'History reading must be scheduled');

  const hStart = new Date(historyBlock.startTime);
  assert.equal(hStart.getHours(), 11, 'History reading should start during school study hall hour 11');
  assert.equal(hStart.getMinutes(), 30, 'History reading should start at 11:30 study hall');

  // Math proof must NOT be in school period
  const mathBlocks = result.scheduledBlocks.filter((b) => b.workId === 'hw-math-proof');
  mathBlocks.forEach((b) => {
    const start = new Date(b.startTime);
    const end = new Date(b.endTime);
    // School is 08:15 to 15:00
    const inSchool = start.getHours() >= 8 && (end.getHours() < 15 || (end.getHours() === 15 && end.getMinutes() === 0));
    assert.ok(!inSchool, 'Non-school-doable math proof must not be scheduled during school hours');
  });
});

test('29. Full Waking Availability on Days Off / Weekends: Utilizes waking hours without phantom school hours', () => {
  // Saturday morning 08:00 (Sep 19). No school on weekends.
  // Student has Physics project (120m) and Coding goal (90m).
  // Full waking day (07:00 - 23:00) should be available for scheduling.
  const saturdayMorning = new Date(2026, 8, 19, 8, 0);

  const physicsProject: HomeworkItem = {
    id: 'hw-physics-sat',
    name: 'Physics Lab Report',
    subject: 'Physics',
    estimatedDuration: 120,
    remainingDuration: 120,
    dueDate: '2026-09-21',
    dueTime: '08:00',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    completed: false,
    splittable: true,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const codingGoal: GoalItem = {
    id: 'goal-coding-sat',
    name: 'Python Project',
    subject: 'Computer Science',
    weeklyTargetMinutes: 90,
    minutesCompletedThisWeek: 0,
    priority: 'medium',
    focusRequirement: 'high',
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [physicsProject],
    quizzesAndTests: [],
    goals: [codingGoal],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: saturdayMorning,
    horizonDays: 7,
  });

  const satBlocks = result.scheduledBlocks.filter(
    (b) => toLocalDateString(b.startTime) === '2026-09-19'
  );

  const satMinutes = satBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  assert.ok(satMinutes >= 120, `Saturday waking hours should be utilized for at least 120m, got ${satMinutes}m`);

  // Verify sessions can be scheduled during daytime (e.g. 08:00 - 15:00) where school would normally be on weekdays
  const daytimeSatBlocks = satBlocks.filter((b) => {
    const h = new Date(b.startTime).getHours();
    return h >= 8 && h < 15;
  });
  assert.ok(daytimeSatBlocks.length > 0, 'Saturday should schedule sessions during normal daytime hours');
});

test('30. Hard Constraints Maintenance: All block end times <= deadline/test start and zero overlaps', () => {
  // Tight multi-candidate scenario with strict deadlines
  const tuesdayNoon = new Date(2026, 8, 15, 12, 0);

  const urgentHw: HomeworkItem = {
    id: 'hw-urgent-tues',
    name: 'Urgent Biology Quiz Prep',
    subject: 'Biology',
    estimatedDuration: 60,
    remainingDuration: 60,
    dueDate: '2026-09-15',
    dueTime: '18:00', // Due Tuesday 18:00
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    completed: false,
    splittable: false,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const chemistryTest: QuizTestItem = {
    id: 'test-chem-wed',
    name: 'Chemistry Midterm',
    subject: 'Chemistry',
    type: 'test',
    assessmentDate: '2026-09-16',
    assessmentTime: '10:00', // Wed 10:00 AM
    studyMinutesRequired: 90,
    priority: 'high',
    completed: false,
    linkedStudyHomeworkId: '',
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [urgentHw],
    quizzesAndTests: [chemistryTest],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: tuesdayNoon,
    horizonDays: 7,
  });

  // Verify every block respects hard constraints
  result.scheduledBlocks.forEach((b) => {
    const bStart = new Date(b.startTime).getTime();
    const bEnd = new Date(b.endTime).getTime();
    assert.ok(bEnd > bStart, 'Block end must be after start');

    if (b.workId === 'hw-urgent-tues') {
      const deadlineMs = makeDateTime('2026-09-15', '18:00').getTime();
      assert.ok(bEnd <= deadlineMs, `Urgent homework block end (${b.endTime}) must be <= deadline 18:00`);
    }

    if (b.workId === 'test-chem-wed') {
      const testStartMs = makeDateTime('2026-09-16', '10:00').getTime();
      assert.ok(bEnd <= testStartMs, `Chem test study block end (${b.endTime}) must be <= test start 10:00 AM`);
    }
  });

  // Check no overlaps
  for (let i = 0; i < result.scheduledBlocks.length - 1; i++) {
    const endA = new Date(result.scheduledBlocks[i].endTime).getTime();
    const startB = new Date(result.scheduledBlocks[i + 1].startTime).getTime();
    assert.ok(endA <= startB, `Block ${result.scheduledBlocks[i].title} overlaps with ${result.scheduledBlocks[i + 1].title}`);
  }
});

test('31. Spaced Repetition for Quiz/Test Prep: Study sessions spaced over 2+ days before assessment', () => {
  // Monday morning 07:00. Spanish exam on Thursday at 09:00 AM. 90m total study required.
  // Spaced repetition strategy should distribute study sessions across multiple days leading to test.
  const mondayMorning = new Date(2026, 8, 14, 7, 0);

  const spanishExam: QuizTestItem = {
    id: 'test-spanish-exam',
    name: 'Spanish Unit 4 Exam',
    subject: 'Spanish',
    type: 'test',
    assessmentDate: '2026-09-17',
    assessmentTime: '09:00',
    studyMinutesRequired: 90,
    priority: 'high',
    completed: false,
    linkedStudyHomeworkId: '',
    createdAt: '2026-09-14T07:00:00Z',
  };

  const result = runScheduler({
    homework: [],
    quizzesAndTests: [spanishExam],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: mondayMorning,
    horizonDays: 7,
  });

  const studyBlocks = result.scheduledBlocks.filter((b) => b.workId === 'test-spanish-exam');
  const distinctDays = new Set(studyBlocks.map((b) => toLocalDateString(b.startTime)));

  assert.ok(
    distinctDays.size >= 2,
    `Spaced study should be distributed over at least 2 days before assessment, got ${distinctDays.size} days`
  );

  const examStartMs = makeDateTime('2026-09-17', '09:00').getTime();
  studyBlocks.forEach((b) => {
    assert.ok(
      new Date(b.endTime).getTime() <= examStartMs,
      `Study session ${b.id} must end before exam start`
    );
  });
});

test('32. Non-Aggressive Scheduling: Preserves free time when work is light and deadline is distant', () => {
  // Monday 16:00. Only a single 45m homework due Friday 23:59 (4 days away).
  // The planner should schedule the 45m task, but should NOT aggressively fill the entire week.
  // It should preserve ample free time.
  const monday4pm = new Date(2026, 8, 14, 16, 0);

  const lightHw: HomeworkItem = {
    id: 'hw-light-read',
    name: 'Short Article Summary',
    subject: 'English',
    estimatedDuration: 45,
    remainingDuration: 45,
    dueDate: '2026-09-18',
    dueTime: '23:59',
    priority: 'low',
    focusRequirement: 'low',
    canDoAtSchool: false,
    completed: false,
    splittable: false,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [lightHw],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: monday4pm,
    horizonDays: 7,
  });

  // Only the 45m required work should be scheduled
  assert.equal(result.scheduledBlocks.length, 1, 'Only 1 block should be scheduled for the single light task');
  assert.equal(result.scheduledBlocks[0].durationMinutes, 45, 'Block duration should be 45m');
  assert.equal(result.warnings.length, 0, 'No feasibility warnings should be emitted');
});

test('33. Bottleneck Avoidance When Heavy Competing Work Ahead: Starts massive project early', () => {
  // Monday 16:00.
  // Task A: Math homework (45m), due Tuesday 23:59.
  // Task B: Massive Engineering Project (240m), due Thursday 23:59.
  // Wednesday is heavily booked with soccer (16:00 - 21:00).
  // If Task B is delayed until Wednesday/Thursday, capacity will bottleneck.
  // The planner starts Task B on Monday alongside Task A.
  const monday4pm = new Date(2026, 8, 14, 16, 0);

  const wedSoccer: FixedEventItem = {
    id: 'wed-soccer-heavy',
    title: 'Away Soccer Game',
    startTime: new Date(2026, 8, 16, 16, 0).toISOString(),
    endTime: new Date(2026, 8, 16, 21, 30).toISOString(),
    type: 'fixed',
  };

  const taskA: HomeworkItem = {
    id: 'hw-quick-math',
    name: 'Math Worksheet',
    subject: 'Math',
    estimatedDuration: 45,
    remainingDuration: 45,
    dueDate: '2026-09-15',
    dueTime: '23:59',
    priority: 'medium',
    focusRequirement: 'medium',
    canDoAtSchool: false,
    completed: false,
    splittable: false,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const taskB: HomeworkItem = {
    id: 'hw-massive-eng',
    name: 'Robotics Engineering Project',
    subject: 'Engineering',
    estimatedDuration: 240,
    remainingDuration: 240,
    dueDate: '2026-09-17',
    dueTime: '23:59',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    completed: false,
    splittable: true,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [taskA, taskB],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [wedSoccer],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: monday4pm,
    horizonDays: 7,
  });

  // Task A must be scheduled before Tuesday deadline
  const taskABlocks = result.scheduledBlocks.filter((b) => b.workId === 'hw-quick-math');
  assert.equal(taskABlocks.length, 1);
  assert.ok(new Date(taskABlocks[0].endTime).getTime() <= makeDateTime('2026-09-15', '23:59').getTime());

  // Task B should have started early (at least some minutes on Monday)
  const taskBMonday = result.scheduledBlocks.filter(
    (b) => b.workId === 'hw-massive-eng' && toLocalDateString(b.startTime) === '2026-09-14'
  );
  const mondayTaskBMins = taskBMonday.reduce((sum, b) => sum + b.durationMinutes, 0);
  assert.ok(
    mondayTaskBMins >= 60,
    `Massive project should start on Monday due to future headroom bottleneck, got ${mondayTaskBMins}m`
  );
});

test('34. Non-Splittable Tasks Contiguity & Capacity Sizing: Places unbroken session in adequate slot', () => {
  // Monday 16:00. Non-splittable Science lab writeup (60m).
  // Slot 1: 16:00 - 16:45 (45m free - too small for 60m non-splittable)
  // Slot 2: 17:00 - 19:00 (120m free - fits 60m unbroken)
  const monday4pm = new Date(2026, 8, 14, 16, 0);

  const clubMeeting: FixedEventItem = {
    id: 'club-event-short',
    title: 'Club Meeting',
    startTime: new Date(2026, 8, 14, 16, 45).toISOString(),
    endTime: new Date(2026, 8, 14, 17, 0).toISOString(),
    type: 'fixed',
  };

  const labReport: HomeworkItem = {
    id: 'hw-lab-nonsplit',
    name: 'Chemistry Titration Lab Report',
    subject: 'Chemistry',
    estimatedDuration: 60,
    remainingDuration: 60,
    dueDate: '2026-09-15',
    dueTime: '23:59',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    completed: false,
    splittable: false, // NON-SPLITTABLE
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [labReport],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [clubMeeting],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: monday4pm,
    horizonDays: 7,
  });

  const labBlocks = result.scheduledBlocks.filter((b) => b.workId === 'hw-lab-nonsplit');
  assert.equal(labBlocks.length, 1, 'Non-splittable work must be scheduled as a single block');
  assert.equal(labBlocks[0].durationMinutes, 60, 'Block duration must equal 60m');

  const bStart = new Date(labBlocks[0].startTime);
  assert.ok(
    bStart.getTime() >= new Date(2026, 8, 14, 17, 0).getTime(),
    'Must be placed after 17:00 where at least 60m contiguous capacity exists'
  );
});

// ============================================================================
// EXACT SPECIFICATION VALIDATION TESTS: SCENARIOS A THROUGH J
// ============================================================================

test('TEST A — Safe homework vs behind goal', () => {
  // Monday 16:00
  // Homework: 60m, due Friday (4 days away), plenty of future capacity
  // Goal: SAT Math Prep, 180m weekly target, 0 completed (behind pace)
  // Suitable block today: 16:00 - 18:00 (120m)
  const monday4pm = new Date(2026, 8, 14, 16, 0);

  const safeHw: HomeworkItem = {
    id: 'hw-safe-history',
    name: 'History Document Reading',
    subject: 'History',
    estimatedDuration: 60,
    remainingDuration: 60,
    dueDate: '2026-09-18', // Friday (4 days away)
    dueTime: '23:59',
    priority: 'medium',
    focusRequirement: 'medium',
    canDoAtSchool: false,
    completed: false,
    splittable: false,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const behindGoal: GoalItem = {
    id: 'goal-sat-prep',
    name: 'SAT Math Preparation',
    subject: 'Math',
    weeklyTargetMinutes: 180,
    minutesCompletedThisWeek: 0,
    priority: 'high',
    focusRequirement: 'high',
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [safeHw],
    quizzesAndTests: [],
    goals: [behindGoal],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: monday4pm,
    horizonDays: 7,
  });

  // Monday evening slot should prioritize the behind goal over safe homework
  const mondayBlocks = result.scheduledBlocks.filter(
    (b) => toLocalDateString(b.startTime) === '2026-09-14'
  );
  const mondayGoalBlocks = mondayBlocks.filter((b) => b.workType === 'goal');
  assert.ok(
    mondayGoalBlocks.length > 0,
    'Goal significantly behind weekly pace should receive study time on Monday'
  );

  // Safe homework should still be scheduled safely before its Friday deadline
  const hwBlocks = result.scheduledBlocks.filter((b) => b.workId === 'hw-safe-history');
  assert.equal(hwBlocks.length, 1, 'Homework must still be scheduled');
  assert.ok(
    new Date(hwBlocks[0].endTime).getTime() <= makeDateTime('2026-09-18', '23:59').getTime(),
    'Homework must complete before deadline'
  );
});

test('TEST B — Genuine urgent homework', () => {
  // Monday 16:00
  // Physics homework: 4h (240m), due tomorrow at 19:00
  // Competing goal: SAT Prep (behind pace)
  // Waking time tonight: 16:00 to 23:00 (7 hours), tomorrow morning 07:00 - 08:15 (1.25 hours)
  const monday4pm = new Date(2026, 8, 14, 16, 0);

  const urgentHw: HomeworkItem = {
    id: 'hw-urgent-physics',
    name: 'Physics AP Problem Set',
    subject: 'Physics',
    estimatedDuration: 240,
    remainingDuration: 240,
    dueDate: '2026-09-15', // Tomorrow
    dueTime: '19:00',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    completed: false,
    splittable: true,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const goal: GoalItem = {
    id: 'goal-sat-prep',
    name: 'SAT Math Preparation',
    subject: 'Math',
    weeklyTargetMinutes: 180,
    minutesCompletedThisWeek: 0,
    priority: 'high',
    focusRequirement: 'high',
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [urgentHw],
    quizzesAndTests: [],
    goals: [goal],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: monday4pm,
    horizonDays: 7,
  });

  // Urgent homework must receive immediate high priority on Monday evening
  const mondayHwBlocks = result.scheduledBlocks.filter(
    (b) => b.workId === 'hw-urgent-physics' && toLocalDateString(b.startTime) === '2026-09-14'
  );
  const mondayHwMins = mondayHwBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  assert.ok(
    mondayHwMins >= 120,
    `Genuinely urgent homework must receive immediate priority on Monday (got ${mondayHwMins}m)`
  );

  // All blocks for urgent physics must complete before 19:00 tomorrow
  const allHwBlocks = result.scheduledBlocks.filter((b) => b.workId === 'hw-urgent-physics');
  const deadlineMs = makeDateTime('2026-09-15', '19:00').getTime();
  allHwBlocks.forEach((b) => {
    assert.ok(
      new Date(b.endTime).getTime() <= deadlineMs,
      `Block ${b.id} ending at ${b.endTime} must be <= deadline 19:00`
    );
  });
});

test('TEST C — Long deep-work session', () => {
  // Monday 16:00
  // 120m programming goal (deep work)
  // 120m uninterrupted suitable block (16:00 - 18:00) before dinner
  const monday4pm = new Date(2026, 8, 14, 16, 0);

  const dinner: FixedEventItem = {
    id: 'dinner-event',
    title: 'Family Dinner',
    startTime: new Date(2026, 8, 14, 18, 0).toISOString(),
    endTime: new Date(2026, 8, 14, 23, 0).toISOString(),
    type: 'fixed',
  };

  const progGoal: GoalItem = {
    id: 'goal-usaco-coding',
    name: 'USACO Programming Practice',
    subject: 'Computer Science',
    weeklyTargetMinutes: 120,
    minutesCompletedThisWeek: 0,
    priority: 'high',
    focusRequirement: 'high',
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [],
    quizzesAndTests: [],
    goals: [progGoal],
    fixedEvents: [dinner],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: monday4pm,
    horizonDays: 7,
  });

  const progBlocks = result.scheduledBlocks.filter((b) => b.workId === 'goal-usaco-coding');
  assert.equal(progBlocks.length, 1, 'Should schedule a single uninterrupted session instead of fragmented 45m chunks');
  assert.equal(progBlocks[0].durationMinutes, 120, 'Should schedule a 120m deep-work session');
  assert.equal(progBlocks[0].startTime, new Date(2026, 8, 14, 16, 0).toISOString());
  assert.equal(progBlocks[0].endTime, new Date(2026, 8, 14, 18, 0).toISOString());
});

test('TEST D — School free period', () => {
  // Tuesday morning 09:00 during school hours
  // Study hall from 10:00 to 10:45 (45m free period)
  // Task 1: Low-focus vocab flashcards (can do at school)
  // Task 2: High-focus AP Calculus problem set (cannot do at school)
  const tuesday9am = new Date(2026, 8, 15, 9, 0);

  const settingsWithStudyHall = {
    ...mockSettings,
    schoolFreePeriods: [
      { id: 'fp-study-hall', name: 'Study Hall', weekday: 2, startTime: '10:00', endTime: '10:45' },
    ],
  };

  const vocabHw: HomeworkItem = {
    id: 'hw-spanish-vocab',
    name: 'Spanish Vocab Review',
    subject: 'Spanish',
    estimatedDuration: 45,
    remainingDuration: 45,
    dueDate: '2026-09-16',
    dueTime: '23:59',
    priority: 'low',
    focusRequirement: 'low',
    canDoAtSchool: true, // CAN do at school
    completed: false,
    splittable: false,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const calcHw: HomeworkItem = {
    id: 'hw-ap-calc',
    name: 'AP Calculus Practice Exam',
    subject: 'Math',
    estimatedDuration: 90,
    remainingDuration: 90,
    dueDate: '2026-09-16',
    dueTime: '23:59',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false, // Cannot do at school
    completed: false,
    splittable: true,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [vocabHw, calcHw],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: settingsWithStudyHall,
    currentTime: tuesday9am,
    horizonDays: 3,
  });

  // Vocab should be scheduled in the school free period (10:00 - 10:45)
  const vocabBlocks = result.scheduledBlocks.filter((b) => b.workId === 'hw-spanish-vocab');
  assert.equal(vocabBlocks.length, 1);
  const vocabStart = new Date(vocabBlocks[0].startTime);
  assert.equal(vocabStart.getHours(), 10, 'Vocab should be scheduled at 10:00 in study hall');

  // Calculus should be scheduled outside school hours (after 15:00)
  const calcBlocks = result.scheduledBlocks.filter((b) => b.workId === 'hw-ap-calc');
  assert.ok(calcBlocks.length > 0);
  calcBlocks.forEach((b) => {
    const startH = new Date(b.startTime).getHours();
    assert.ok(startH >= 15 || startH < 8, 'Calculus cannot be scheduled during school hours');
  });
});

test('TEST E — Day off', () => {
  // Saturday morning 07:00 (Day off)
  // Wake: 07:00, Sleep: 21:00 (9 PM)
  // No school, no fixed events
  // Availability should span the full waking period (07:00 to 21:00 = 14 hours = 840 mins)
  const dayOffSettings = {
    wakeTime: '07:00',
    sleepTime: '21:00',
    schoolStartTime: '08:15',
    schoolEndTime: '15:00',
    hasSchoolOnWeekdays: true,
    schoolFreePeriods: [],
    holidays: [],
  };

  const saturday7am = new Date(2026, 8, 19, 7, 0); // Sep 19, 2026 is Saturday

  const intervals = calculateFreeIntervals({
    settings: dayOffSettings,
    allCalendarEvents: [],
    currentTime: saturday7am,
    horizonDays: 1,
  });

  // Intervals should cover from 07:00 to 21:00 with no school interruption
  const saturdayIntervals = intervals.filter((i) => toLocalDateString(i.start) === '2026-09-19');
  const totalWakingMinutes = saturdayIntervals.reduce(
    (sum, i) => sum + Math.round((i.end.getTime() - i.start.getTime()) / (60 * 1000)),
    0
  );

  assert.equal(totalWakingMinutes, 14 * 60, 'Day off must provide full 14 hours (840m) of waking availability');
  assert.ok(saturdayIntervals.every((i) => !i.isSchoolPeriod), 'No interval should be marked as school period on a day off');
});

test('TEST F — Long assignment distribution', () => {
  // Monday 16:00
  // 5-hour (300m) assignment due in 10 days
  // Sufficient future capacity
  // Expected: distributed across multiple days rather than dumped into a 5h cram today
  const monday4pm = new Date(2026, 8, 14, 16, 0);

  const longPaper: HomeworkItem = {
    id: 'hw-senior-thesis',
    name: 'Senior Research Paper',
    subject: 'English',
    estimatedDuration: 300, // 5 hours
    remainingDuration: 300,
    dueDate: '2026-09-24', // 10 days away
    dueTime: '23:59',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    completed: false,
    splittable: true,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [longPaper],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: monday4pm,
    horizonDays: 10,
  });

  const distinctDays = new Set(result.scheduledBlocks.map((b) => toLocalDateString(b.startTime)));
  assert.ok(
    distinctDays.size >= 3,
    `5h assignment due in 10 days should be distributed across multiple days (got ${distinctDays.size} days)`
  );

  // Today should receive a reasonable session (<= 90m), not the entire 300m
  const todayBlocks = result.scheduledBlocks.filter(
    (b) => toLocalDateString(b.startTime) === '2026-09-14'
  );
  const todayMins = todayBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  assert.ok(todayMins <= 90, `Today should not receive more than 90m for distant assignment (got ${todayMins}m)`);
});

test('TEST G — Goal behind pace', () => {
  // Wednesday 16:00
  // Goal: Coding Practice (weekly target 180m, 0m completed -> 77m pace deficit)
  // Sufficient remaining week capacity (Wednesday night through Sunday)
  // Expected: Goal receives meaningful scheduled time
  const wednesday4pm = new Date(2026, 8, 16, 16, 0);

  const behindGoal: GoalItem = {
    id: 'goal-coding-behind',
    name: 'Algorithmic Coding Practice',
    subject: 'Computer Science',
    weeklyTargetMinutes: 180,
    minutesCompletedThisWeek: 0,
    priority: 'high',
    focusRequirement: 'high',
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [],
    quizzesAndTests: [],
    goals: [behindGoal],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: wednesday4pm,
    horizonDays: 5,
  });

  const goalBlocks = result.scheduledBlocks.filter((b) => b.workId === 'goal-coding-behind');
  const totalMins = goalBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  assert.ok(
    totalMins >= 120,
    `Goal behind pace should receive meaningful scheduled time across the remaining week (got ${totalMins}m)`
  );
});

test('TEST H — Don\'t fill empty time', () => {
  // Monday 16:00
  // 60m of total required work
  // 5 hours (300m) of suitable free time from 16:00 to 21:00
  // Expected: scheduler only schedules the required 60m and leaves 4 hours free
  const monday4pm = new Date(2026, 8, 14, 16, 0);

  const lightHw: HomeworkItem = {
    id: 'hw-short-worksheet',
    name: 'Short Math Worksheet',
    subject: 'Math',
    estimatedDuration: 60,
    remainingDuration: 60,
    dueDate: '2026-09-15',
    dueTime: '23:59',
    priority: 'medium',
    focusRequirement: 'medium',
    canDoAtSchool: false,
    completed: false,
    splittable: false,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [lightHw],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: monday4pm,
    horizonDays: 2,
  });

  const mondayBlocks = result.scheduledBlocks.filter(
    (b) => toLocalDateString(b.startTime) === '2026-09-14'
  );
  const totalScheduledMins = mondayBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  assert.equal(totalScheduledMins, 60, 'Should schedule exactly the required 60m without filling free time');
});

test('TEST I — Replanning', () => {
  // Monday 16:00
  // 1. Completed block in the past (14:00 - 15:00, 60m completed)
  // 2. Fixed event in the future (18:00 - 19:00)
  // 3. Manual future block (19:30 - 20:30, 60m)
  // 4. Remaining unallocated AI homework (60m needed)
  // Expected: past, manual, and fixed blocks preserved; only AI work is planned
  const monday4pm = new Date(2026, 8, 14, 16, 0);

  const pastCompletedBlock: ScheduleBlock = {
    id: 'block-past-completed',
    workType: 'homework',
    workId: 'hw-finished-earlier',
    title: 'Finished History Homework',
    subject: 'History',
    startTime: new Date(2026, 8, 14, 14, 0).toISOString(),
    endTime: new Date(2026, 8, 14, 15, 0).toISOString(),
    durationMinutes: 60,
    completed: true,
    actualMinutesCompleted: 60,
    isManual: false,
  };

  const futureManualBlock: ScheduleBlock = {
    id: 'block-future-manual',
    workType: 'homework',
    workId: 'hw-math-manual',
    title: 'Manual Math Practice',
    subject: 'Math',
    startTime: new Date(2026, 8, 14, 19, 30).toISOString(),
    endTime: new Date(2026, 8, 14, 20, 30).toISOString(),
    durationMinutes: 60,
    completed: false,
    isManual: true,
  };

  const futureEvent: FixedEventItem = {
    id: 'evt-future-soccer',
    title: 'Soccer Practice',
    startTime: new Date(2026, 8, 14, 18, 0).toISOString(),
    endTime: new Date(2026, 8, 14, 19, 0).toISOString(),
    type: 'fixed',
  };

  const aiHw: HomeworkItem = {
    id: 'hw-ai-chem',
    name: 'Chemistry Questions',
    subject: 'Chemistry',
    estimatedDuration: 60,
    remainingDuration: 60,
    dueDate: '2026-09-15',
    dueTime: '23:59',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    completed: false,
    splittable: false,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [aiHw],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [futureEvent],
    existingBlocks: [pastCompletedBlock, futureManualBlock],
    settings: mockSettings,
    currentTime: monday4pm,
    horizonDays: 2,
  });

  // Preserved blocks
  const hasPast = result.scheduledBlocks.some((b) => b.id === 'block-past-completed');
  assert.ok(hasPast, 'Past completed block must be preserved');

  const hasManual = result.scheduledBlocks.some((b) => b.id === 'block-future-manual');
  assert.ok(hasManual, 'Future manual block must be preserved');

  // AI block should be placed without colliding with soccer (18:00-19:00) or manual block (19:30-20:30)
  const aiBlock = result.scheduledBlocks.find((b) => b.workId === 'hw-ai-chem');
  assert.ok(aiBlock, 'AI block must be scheduled');
  const aiStart = new Date(aiBlock.startTime).getTime();
  const aiEnd = new Date(aiBlock.endTime).getTime();

  const soccerStart = new Date(2026, 8, 14, 18, 0).getTime();
  const soccerEnd = new Date(2026, 8, 14, 19, 0).getTime();
  const manualStart = new Date(2026, 8, 14, 19, 30).getTime();
  const manualEnd = new Date(2026, 8, 14, 20, 30).getTime();

  // No overlap with soccer
  assert.ok(aiEnd <= soccerStart || aiStart >= soccerEnd, 'AI block must not overlap fixed event');
  // No overlap with manual block
  assert.ok(aiEnd <= manualStart || aiStart >= manualEnd, 'AI block must not overlap manual block');
});

test('TEST J — Capacity conflict', () => {
  // Monday 16:00
  // Workload: 4 hours (240m) of homework due at 18:00 today (only 2 hours available)
  // Expected: Warning rather than constraint violation; no blocks scheduled after 18:00
  const monday4pm = new Date(2026, 8, 14, 16, 0);

  const massiveHw: HomeworkItem = {
    id: 'hw-conflict-chem',
    name: 'Overloaded Chemistry Assignment',
    subject: 'Chemistry',
    estimatedDuration: 240, // 4 hours
    remainingDuration: 240,
    dueDate: '2026-09-14',
    dueTime: '18:00', // Only 2 hours away!
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    completed: false,
    splittable: true,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const result = runScheduler({
    homework: [massiveHw],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: monday4pm,
    horizonDays: 1,
  });

  // Must surface a capacity conflict / deadline shortfall warning
  assert.ok(
    result.warnings.some((w) => w.type === 'deadline_shortfall' || w.type === 'impossible_schedule'),
    'Capacity conflict must generate an explicit warning'
  );

  // Hard constraint: NEVER schedule after the deadline!
  const deadlineMs = makeDateTime('2026-09-14', '18:00').getTime();
  result.scheduledBlocks
    .filter((b) => b.workId === 'hw-conflict-chem')
    .forEach((b) => {
      assert.ok(
        new Date(b.endTime).getTime() <= deadlineMs,
        `Block ending at ${b.endTime} must not violate deadline ${deadlineMs}`
      );
    });
});

test('TEST K — Flexible goal session length up to 120m for high-focus deep work', () => {
  // Saturday 14:00 (Weekend)
  // High-focus coding/research goal with 240m target
  // Uninterrupted 180m afternoon block (14:00 - 17:00)
  // Expected: Scheduler allocates a 120m deep-work session rather than capping at 90m or fragmenting into 45m chunks
  const saturday2pm = new Date(2026, 8, 19, 14, 0);

  const deepGoal: GoalItem = {
    id: 'goal-deep-ml',
    name: 'Machine Learning Research Project',
    subject: 'Computer Science',
    weeklyTargetMinutes: 240,
    minutesCompletedThisWeek: 0,
    priority: 'high',
    focusRequirement: 'high',
    createdAt: '2026-09-14T08:00:00Z',
  };

  const eveningDinner: FixedEventItem = {
    id: 'evt-saturday-dinner',
    title: 'Dinner',
    startTime: new Date(2026, 8, 19, 17, 0).toISOString(),
    endTime: new Date(2026, 8, 19, 23, 0).toISOString(),
    type: 'fixed',
  };

  const result = runScheduler({
    homework: [],
    quizzesAndTests: [],
    goals: [deepGoal],
    fixedEvents: [eveningDinner],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: saturday2pm,
    horizonDays: 2,
  });

  const satBlocks = result.scheduledBlocks.filter((b) => b.workId === 'goal-deep-ml');
  assert.ok(satBlocks.length >= 1, 'Should schedule goal session on Saturday');
  assert.equal(
    satBlocks[0].durationMinutes,
    120,
    `Deep-work goal should receive an uninterrupted 120m block (got ${satBlocks[0].durationMinutes}m)`
  );
  assert.equal(satBlocks[0].startTime, new Date(2026, 8, 19, 14, 0).toISOString());
  assert.equal(satBlocks[0].endTime, new Date(2026, 8, 19, 16, 0).toISOString());
});

test('TEST L — Counterfactual choice: downstream bottleneck forces choice over earlier deadline', () => {
  // Monday 16:00
  // Candidate A: Chemistry Problem Set (60m, due Tuesday 21:00 - earlier deadline)
  // Candidate B: History DBQ Essay (120m, non-splittable, due Wednesday 21:00 - later deadline)
  // Monday has 16:00 - 18:00 (120m). Tuesday has only 60m (16:00 - 17:00). Wednesday has only 60m (16:00 - 17:00).
  //
  // Consequence analysis across the future:
  // If A is scheduled on Monday: Monday remaining is 60m. B (120m non-splittable) will have NO 120m slot before Wednesday! B fails!
  // If B is scheduled on Monday: B takes 120m (16:00-18:00). A easily takes Tuesday 16:00-17:00 before its Tuesday 21:00 deadline.
  // Both tasks succeed!
  //
  // Therefore: B must win Monday 16:00-18:00 even though A has an earlier deadline!
  const monday4pm = new Date(2026, 8, 14, 16, 0);

  const hwA: HomeworkItem = {
    id: 'hw-chem-set',
    name: 'Chemistry Problem Set',
    subject: 'Chemistry',
    estimatedDuration: 60,
    remainingDuration: 60,
    dueDate: '2026-09-15', // Tuesday
    dueTime: '21:00',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    completed: false,
    splittable: true,
    createdAt: '2026-09-14T08:00:00Z',
  };

  const hwB: HomeworkItem = {
    id: 'hw-history-dbq',
    name: 'History DBQ Essay',
    subject: 'History',
    estimatedDuration: 120,
    remainingDuration: 120,
    dueDate: '2026-09-16', // Wednesday
    dueTime: '21:00',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    completed: false,
    splittable: false, // Non-splittable: strictly requires 120m contiguous window!
    createdAt: '2026-09-14T08:00:00Z',
  };

  // Fixed events restricting Tuesday and Wednesday to only 1 hour each (16:00 - 17:00)
  const mondayNightBusy: FixedEventItem = {
    id: 'evt-mon-busy',
    title: 'Monday Evening Event',
    startTime: new Date(2026, 8, 14, 18, 0).toISOString(),
    endTime: new Date(2026, 8, 14, 23, 0).toISOString(),
    type: 'fixed',
  };

  const tuesdayNightBusy: FixedEventItem = {
    id: 'evt-tue-busy',
    title: 'Tuesday Evening Event',
    startTime: new Date(2026, 8, 15, 17, 0).toISOString(),
    endTime: new Date(2026, 8, 15, 23, 0).toISOString(),
    type: 'fixed',
  };

  const wednesdayNightBusy: FixedEventItem = {
    id: 'evt-wed-busy',
    title: 'Wednesday Evening Event',
    startTime: new Date(2026, 8, 16, 17, 0).toISOString(),
    endTime: new Date(2026, 8, 16, 23, 0).toISOString(),
    type: 'fixed',
  };

  const result = runScheduler({
    homework: [hwA, hwB],
    quizzesAndTests: [],
    goals: [],
    fixedEvents: [mondayNightBusy, tuesdayNightBusy, wednesdayNightBusy],
    existingBlocks: [],
    settings: mockSettings,
    currentTime: monday4pm,
    horizonDays: 3,
  });

  // Candidate B must win Monday 16:00 - 18:00
  const mondayBlocks = result.scheduledBlocks.filter(
    (b) => toLocalDateString(b.startTime) === '2026-09-14'
  );
  assert.ok(mondayBlocks.length > 0, 'Must have block on Monday');
  assert.equal(
    mondayBlocks[0].workId,
    'hw-history-dbq',
    'History DBQ (Candidate B) must be chosen on Monday because it cannot fit later, despite Chemistry having earlier deadline'
  );
  assert.equal(mondayBlocks[0].durationMinutes, 120, 'History DBQ must receive full 120m block');

  // Candidate A must be scheduled on Tuesday before its deadline
  const tuesdayBlocks = result.scheduledBlocks.filter(
    (b) => toLocalDateString(b.startTime) === '2026-09-15'
  );
  assert.ok(tuesdayBlocks.length > 0, 'Chemistry must be scheduled on Tuesday');
  assert.equal(tuesdayBlocks[0].workId, 'hw-chem-set', 'Chemistry must be scheduled on Tuesday');
  assert.equal(tuesdayBlocks[0].durationMinutes, 60, 'Chemistry gets 60m block on Tuesday');

  // No deadline violations
  const chemDeadline = makeDateTime('2026-09-15', '21:00').getTime();
  assert.ok(
    new Date(tuesdayBlocks[0].endTime).getTime() <= chemDeadline,
    'Chemistry finishes before Tuesday 21:00'
  );
});

