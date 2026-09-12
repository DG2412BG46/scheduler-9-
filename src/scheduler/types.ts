import {
  HomeworkItem,
  QuizTestItem,
  GoalItem,
  FixedEventItem,
  ScheduleBlock,
  UserScheduleSettings,
  ScheduleWarning,
  Priority,
  FocusRequirement,
} from '../types';

export interface SchedulerInput {
  homework: HomeworkItem[];
  quizzesAndTests: QuizTestItem[];
  goals: GoalItem[];
  fixedEvents: FixedEventItem[];
  existingBlocks: ScheduleBlock[];
  settings: UserScheduleSettings;
  currentTime?: Date;
  horizonDays?: number; // default 14 days
}

export interface SchedulerSummary {
  blocksCreated: number;
  homeworkScheduledMinutes: number;
  studyScheduledMinutes: number;
  goalScheduledMinutes: number;
  freeMinutesRemaining: number;
  totalFreeMinutesHorizon: number;
  planScore: number;
  selectedPlanStrategy: string;
}

export interface SchedulerOutput {
  scheduledBlocks: ScheduleBlock[];
  summary: SchedulerSummary;
  warnings: ScheduleWarning[];
}

export interface FreeInterval {
  id: string;
  start: Date;
  end: Date;
  durationMinutes: number;
  isSchoolPeriod: boolean;
  schoolPeriodName?: string;
  dayStr: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  isEveningOrWeekend: boolean;
}

export interface WorkCandidate {
  id: string;
  type: 'homework' | 'study';
  name: string;
  subject: string;
  totalDuration: number;
  completedDuration: number;
  unallocatedDuration: number;
  deadlineDate: Date;
  priority: Priority;
  focusRequirement: FocusRequirement;
  canDoAtSchool: boolean;
  splittable: boolean;
  linkedTestId?: string;
  assessmentDate?: Date;
  scheduledDates: Set<string>;
}

export interface GoalCandidate {
  id: string;
  name: string;
  subject: string;
  weeklyTargetMinutes: number;
  completedMinutesThisWeek: number;
  unallocatedWeeklyMinutes: number;
  priority: Priority;
  focusRequirement: FocusRequirement;
  deadline?: Date;
  scheduledDates: Set<string>;
}

export type PlanStrategy =
  | 'paced_balanced'
  | 'front_loaded'
  | 'deep_work'
  | 'spaced_repetition';

export interface PlanScoreBreakdown {
  deadlineSafetyScore: number;
  studySpacingScore: number;
  goalPacingScore: number;
  fatigueAndBalanceScore: number;
  contextFitScore: number;
  subjectVarietyScore: number;
  totalScore: number;
}

export interface CandidatePlan {
  strategy: PlanStrategy;
  description: string;
  blocks: ScheduleBlock[];
  scoreBreakdown: PlanScoreBreakdown;
}
