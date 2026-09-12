import {
  HomeworkItem,
  QuizTestItem,
  GoalItem,
  FixedEventItem,
  ScheduleBlock,
  UserScheduleSettings,
} from '../types';

// Helper to get formatted date string offset from today
export function getRelativeDateStr(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getRelativeDateTimeStr(daysOffset: number, hours: number, minutes: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export const initialSettings: UserScheduleSettings = {
  wakeTime: '07:00',
  sleepTime: '23:00',
  schoolStartTime: '08:15',
  schoolEndTime: '15:00',
  hasSchoolOnWeekdays: true,
  schoolFreePeriods: [
    { id: 'fp-mon', name: 'Study Hall', weekday: 1, startTime: '11:30', endTime: '12:15' },
    { id: 'fp-tue', name: 'Free Period', weekday: 2, startTime: '11:30', endTime: '12:15' },
    { id: 'fp-wed', name: 'Study Hall', weekday: 3, startTime: '11:30', endTime: '12:15' },
    { id: 'fp-thu', name: 'Free Period', weekday: 4, startTime: '11:30', endTime: '12:15' },
    { id: 'fp-fri', name: 'Study Hall', weekday: 5, startTime: '11:30', endTime: '12:15' },
  ],
  holidays: [],
};

// Linked Study item for the Physics Test
const physicsTestStudyId = 'hw-study-physics-test';
const physicsTestId = 'test-physics-1';

export const initialHomework: HomeworkItem[] = [
  {
    id: physicsTestStudyId,
    name: 'Study: Physics Test',
    subject: 'Physics',
    estimatedDuration: 120,
    remainingDuration: 120,
    dueDate: getRelativeDateStr(2), // 2 days from now (e.g. Friday)
    dueTime: '09:00',
    priority: 'high',
    focusRequirement: 'high',
    canDoAtSchool: false,
    splittable: true,
    notes: 'Cover Newton mechanics, rotational dynamics, and work-energy theorem.',
    completed: false,
    linkedTestId: physicsTestId,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'hw-chem-lab',
    name: 'Chemistry Lab Report',
    subject: 'Chemistry',
    estimatedDuration: 180, // 3 hours
    remainingDuration: 180,
    dueDate: getRelativeDateStr(5), // Due next week
    dueTime: '17:00',
    priority: 'medium',
    focusRequirement: 'high',
    canDoAtSchool: false,
    splittable: true,
    notes: 'Acid-base titration analysis and error calculations.',
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'hw-econ-worksheet',
    name: 'Economics Worksheet',
    subject: 'Economics',
    estimatedDuration: 45,
    remainingDuration: 45,
    dueDate: getRelativeDateStr(3),
    dueTime: '08:30',
    priority: 'medium',
    focusRequirement: 'low',
    canDoAtSchool: true, // Can do during school free periods
    splittable: false,
    notes: 'Supply & demand shift practice problems.',
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'hw-spanish-vocab',
    name: 'Spanish 3 Quizlet Review',
    subject: 'Spanish',
    estimatedDuration: 30,
    remainingDuration: 30,
    dueDate: getRelativeDateStr(1),
    dueTime: '08:15',
    priority: 'low',
    focusRequirement: 'low',
    canDoAtSchool: true,
    splittable: false,
    notes: 'Subjunctive mood flashcards.',
    completed: false,
    createdAt: new Date().toISOString(),
  },
];

export const initialQuizzesAndTests: QuizTestItem[] = [
  {
    id: physicsTestId,
    name: 'Physics Unit 3 Test',
    subject: 'Physics',
    type: 'test',
    assessmentDate: getRelativeDateStr(2),
    assessmentTime: '09:00',
    studyMinutesRequired: 120,
    priority: 'high',
    notes: 'Comprehensive exam on kinematics and dynamics in Room 204.',
    completed: false,
    linkedStudyHomeworkId: physicsTestStudyId,
    createdAt: new Date().toISOString(),
  },
];

export const initialGoals: GoalItem[] = [
  {
    id: 'goal-usaco',
    name: 'USACO Practice',
    subject: 'Computer Science',
    weeklyTargetMinutes: 300, // 5 hours/week
    priority: 'high',
    focusRequirement: 'high',
    minutesCompletedThisWeek: 0,
    notes: 'Bronze to Silver division graph algorithms and DP.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'goal-psat',
    name: 'PSAT Prep',
    subject: 'Standardized Tests',
    weeklyTargetMinutes: 420, // 7 hours/week
    priority: 'high',
    focusRequirement: 'high',
    minutesCompletedThisWeek: 0,
    notes: 'Reading comprehension and digital math modules.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'goal-amc',
    name: 'AMC 10/12 Math Problems',
    subject: 'Math',
    weeklyTargetMinutes: 180, // 3 hours/week
    priority: 'medium',
    focusRequirement: 'high',
    minutesCompletedThisWeek: 0,
    notes: 'Number theory and geometry competition problems.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'goal-programming',
    name: 'Personal Programming Project',
    subject: 'Computer Science',
    weeklyTargetMinutes: 120, // 2 hours/week
    priority: 'low',
    focusRequirement: 'high',
    minutesCompletedThisWeek: 0,
    notes: 'Portfolio full-stack app development.',
    createdAt: new Date().toISOString(),
  },
];

export const initialFixedEvents: FixedEventItem[] = [
  {
    id: 'event-soccer-1',
    title: 'Soccer Practice',
    startTime: getRelativeDateTimeStr(1, 16, 0),
    endTime: getRelativeDateTimeStr(1, 17, 30),
    type: 'fixed',
    notes: 'Varsity field scrimmage',
  },
  {
    id: 'event-soccer-2',
    title: 'Soccer Practice',
    startTime: getRelativeDateTimeStr(3, 16, 0),
    endTime: getRelativeDateTimeStr(3, 17, 30),
    type: 'fixed',
    notes: 'Team conditioning and drills',
  },
];

export const initialScheduleBlocks: ScheduleBlock[] = [];
