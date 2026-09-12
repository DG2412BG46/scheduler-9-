export type Priority = 'low' | 'medium' | 'high';
export type FocusRequirement = 'low' | 'medium' | 'high';
export type AssessmentType = 'quiz' | 'test';

export interface HomeworkItem {
  id: string;
  name: string;
  subject: string;
  estimatedDuration: number; // in minutes
  remainingDuration: number; // in minutes
  dueDate: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm (optional)
  priority: Priority;
  focusRequirement: FocusRequirement;
  canDoAtSchool: boolean;
  splittable: boolean;
  notes?: string;
  completed: boolean;
  linkedTestId?: string; // If this is a study task linked to an assessment
  createdAt: string;
}

export interface QuizTestItem {
  id: string;
  name: string;
  subject: string;
  type: AssessmentType;
  assessmentDate: string; // YYYY-MM-DD
  assessmentTime?: string; // HH:mm (e.g. '09:00')
  studyMinutesRequired: number;
  priority: Priority;
  notes?: string;
  completed: boolean;
  linkedStudyHomeworkId: string; // ID of the 'Study: [Name]' homework item
  createdAt: string;
}

export interface GoalItem {
  id: string;
  name: string;
  subject?: string;
  weeklyTargetMinutes: number; // e.g. 300
  priority: Priority;
  deadline?: string; // optional YYYY-MM-DD
  focusRequirement: FocusRequirement;
  minutesCompletedThisWeek: number;
  notes?: string;
  createdAt: string;
}

export interface FixedEventItem {
  id: string;
  title: string;
  startTime: string; // ISO string e.g. '2026-09-11T08:00:00'
  endTime: string; // ISO string
  type: 'school' | 'fixed' | 'assessment';
  notes?: string;
  linkedAssessmentId?: string;
}

export type ScheduleBlockType = 'homework' | 'study' | 'goal' | 'event';

export interface ScheduleBlock {
  id: string;
  workType: ScheduleBlockType;
  workId?: string; // References HomeworkItem.id or GoalItem.id or FixedEventItem.id
  title: string;
  subject?: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  durationMinutes: number;
  completed: boolean;
  actualMinutesCompleted?: number; // Minutes worked so far (0 to durationMinutes)
  isManual?: boolean; // True if manually placed or locked by user
  explanation?: string; // AI explanation of why this block was placed here
  notes?: string;
}

export interface SchoolFreePeriod {
  id: string;
  name: string; // e.g. "Study Hall", "Free Period"
  weekday: number; // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
  startTime: string; // "11:30"
  endTime: string; // "12:15"
}

export interface UserScheduleSettings {
  wakeTime: string; // '07:00'
  sleepTime: string; // '23:00'
  schoolStartTime: string; // '08:15'
  schoolEndTime: string; // '15:00'
  hasSchoolOnWeekdays: boolean;
  schoolFreePeriods: SchoolFreePeriod[];
  holidays: string[]; // List of YYYY-MM-DD dates with no school
}

export interface ScheduleWarning {
  id: string;
  type: 'deadline_shortfall' | 'impossible_schedule' | 'goal_shortfall' | 'workload_warning' | 'late_manual_session';
  severity: 'warning' | 'error';
  targetId?: string;
  targetName: string;
  shortfallMinutes?: number;
  message: string;
  suggestedAction?: string;
}

export interface TimeSlot {
  start: Date;
  end: Date;
  isSchoolPeriod?: boolean;
}
