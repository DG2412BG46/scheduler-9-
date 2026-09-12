import {
  FixedEventItem,
  QuizTestItem,
  ScheduleBlock,
  UserScheduleSettings,
} from '../types';
import { FreeInterval } from './types';
import {
  toLocalDateString,
  formatDate,
  parseTimeToMinutes,
  makeDateTime,
  roundUpTo15,
} from '../utils/dateUtils';

export {
  toLocalDateString,
  formatDate,
  parseTimeToMinutes,
  makeDateTime,
  roundUpTo15,
};

export interface BusyInterval {
  start: Date;
  end: Date;
  label?: string;
}

/**
 * Merges a list of busy intervals that overlap or are adjacent.
 */
export function mergeBusyIntervals(intervals: BusyInterval[]): BusyInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: BusyInterval[] = [{ start: new Date(sorted[0].start), end: new Date(sorted[0].end) }];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const prev = merged[merged.length - 1];

    if (curr.start.getTime() <= prev.end.getTime()) {
      if (curr.end.getTime() > prev.end.getTime()) {
        prev.end = new Date(curr.end);
      }
    } else {
      merged.push({ start: new Date(curr.start), end: new Date(curr.end) });
    }
  }

  return merged;
}

/**
 * Subtracts busy intervals from a base interval [baseStart, baseEnd].
 * Returns remaining open sub-intervals.
 */
export function subtractIntervals(
  baseStart: Date,
  baseEnd: Date,
  busyList: BusyInterval[]
): { start: Date; end: Date }[] {
  if (baseStart >= baseEnd) return [];

  // Filter and clip busy intervals that intersect with base interval
  const intersecting = busyList
    .filter((b) => b.end > baseStart && b.start < baseEnd)
    .map((b) => ({
      start: b.start < baseStart ? new Date(baseStart) : new Date(b.start),
      end: b.end > baseEnd ? new Date(baseEnd) : new Date(b.end),
    }));

  const merged = mergeBusyIntervals(intersecting);
  const results: { start: Date; end: Date }[] = [];
  let pointer = new Date(baseStart);

  for (const b of merged) {
    if (b.start > pointer) {
      results.push({ start: new Date(pointer), end: new Date(b.start) });
    }
    if (b.end > pointer) {
      pointer = new Date(b.end);
    }
  }

  if (pointer < baseEnd) {
    results.push({ start: new Date(pointer), end: new Date(baseEnd) });
  }

  return results;
}

/**
 * Calculates all free time intervals over the horizon, factoring in:
 * - Sleep / wake boundaries per day
 * - Weekday school hours and recurring free periods per weekday
 * - Holiday / day-off calendar exceptions
 * - Fixed events and quizzes/tests (and collisions between fixed events & school free periods)
 * - Preserved blocks (past, completed, manual)
 */
export function computeFreeIntervals(params: {
  settings: UserScheduleSettings;
  fixedEvents: FixedEventItem[];
  quizzesAndTests: QuizTestItem[];
  preservedBlocks: ScheduleBlock[];
  currentTime: Date;
  horizonDays: number;
}): { freeIntervals: FreeInterval[]; totalFreeMinutes: number } {
  const { settings, fixedEvents, quizzesAndTests, preservedBlocks, currentTime, horizonDays } = params;

  // 1. Build Assessment Events
  const assessmentEvents: FixedEventItem[] = [];
  quizzesAndTests.forEach((qt) => {
    if (!qt.completed) {
      const timeStr = qt.assessmentTime || '09:00';
      const start = makeDateTime(qt.assessmentDate, timeStr);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // 60 mins
      assessmentEvents.push({
        id: `assessment-event-${qt.id}`,
        title: `${qt.type === 'quiz' ? 'Quiz' : 'Test'}: ${qt.name}`,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        type: 'assessment',
        linkedAssessmentId: qt.id,
      });
    }
  });

  const allCalendarEvents = [...fixedEvents, ...assessmentEvents];

  // Map of external busy intervals
  const externalBusy: BusyInterval[] = [
    ...allCalendarEvents.map((e) => ({
      start: new Date(e.startTime),
      end: new Date(e.endTime),
      label: e.title,
    })),
    ...preservedBlocks.map((b) => ({
      start: new Date(b.startTime),
      end: new Date(b.endTime),
      label: b.title,
    })),
  ];

  const freeIntervals: FreeInterval[] = [];
  let intervalCounter = 0;

  for (let dayOffset = 0; dayOffset < horizonDays; dayOffset++) {
    const dayDate = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate() + dayOffset);
    const dayStr = formatDate(dayDate);
    const dayOfWeek = dayDate.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = (settings.holidays || []).includes(dayStr);

    // Wake and sleep bounds
    const wakeDate = makeDateTime(dayStr, settings.wakeTime || '07:00');
    const sleepDate = makeDateTime(dayStr, settings.sleepTime || '23:00');

    // Earliest start today cannot be in the past
    let effectiveStart = wakeDate;
    if (dayOffset === 0 && currentTime > effectiveStart) {
      effectiveStart = roundUpTo15(currentTime);
      if (effectiveStart >= sleepDate) {
        continue; // No waking hours left today
      }
    }

    // Daily busy intervals for non-school time
    const dailyBusy: BusyInterval[] = [];

    // Filter external busy for today's waking period
    externalBusy.forEach((b) => {
      if (b.end > effectiveStart && b.start < sleepDate) {
        dailyBusy.push({
          start: b.start < effectiveStart ? new Date(effectiveStart) : new Date(b.start),
          end: b.end > sleepDate ? new Date(sleepDate) : new Date(b.end),
          label: b.label,
        });
      }
    });

    // School availability handling
    const hasSchoolToday = settings.hasSchoolOnWeekdays && !isWeekend && !isHoliday;

    if (hasSchoolToday) {
      const schoolStart = makeDateTime(dayStr, settings.schoolStartTime || '08:15');
      const schoolEnd = makeDateTime(dayStr, settings.schoolEndTime || '15:00');

      // Free periods configured for this weekday
      const configuredFreePeriods = (settings.schoolFreePeriods || []).filter((fp) => {
        if (Array.isArray((fp as any).daysOfWeek)) {
          return (fp as any).daysOfWeek.includes(dayOfWeek);
        }
        return (fp.weekday !== undefined ? fp.weekday : (fp as any).dayOfWeek) === dayOfWeek;
      });

      // Raw free periods as intervals within school bounds
      const freePeriodIntervals: { start: Date; end: Date; name: string }[] = [];
      configuredFreePeriods.forEach((fp) => {
        const fpStart = makeDateTime(dayStr, fp.startTime);
        const fpEnd = makeDateTime(dayStr, fp.endTime);
        if (fpEnd > fpStart && fpEnd > effectiveStart && fpStart < schoolEnd) {
          freePeriodIntervals.push({
            start: fpStart < effectiveStart ? new Date(effectiveStart) : fpStart,
            end: fpEnd,
            name: fp.name || 'Free Period',
          });
        }
      });

      // Crucial: Any fixed event or preserved block that occurs during a school free period
      // blocks that free period!
      freePeriodIntervals.forEach((fp) => {
        const openFpSubIntervals = subtractIntervals(fp.start, fp.end, dailyBusy);
        openFpSubIntervals.forEach((sub) => {
          const durMin = Math.round((sub.end.getTime() - sub.start.getTime()) / (60 * 1000));
          if (durMin >= 20) {
            freeIntervals.push({
              id: `free-slot-${++intervalCounter}`,
              start: sub.start,
              end: sub.end,
              durationMinutes: durMin,
              isSchoolPeriod: true,
              schoolPeriodName: fp.name,
              dayStr,
              dayOfWeek,
              isEveningOrWeekend: false,
            });
          }
        });
      });

      // Entire school block [schoolStart, schoolEnd] blocks general non-school waking time
      if (schoolEnd > effectiveStart && schoolStart < sleepDate) {
        dailyBusy.push({
          start: schoolStart < effectiveStart ? new Date(effectiveStart) : schoolStart,
          end: schoolEnd > sleepDate ? new Date(sleepDate) : schoolEnd,
          label: 'School Hours',
        });
      }
    }

    // Now carve out non-school waking free intervals from [effectiveStart, sleepDate]
    const openWakingIntervals = subtractIntervals(effectiveStart, sleepDate, dailyBusy);

    openWakingIntervals.forEach((interval) => {
      const durMin = Math.round((interval.end.getTime() - interval.start.getTime()) / (60 * 1000));
      if (durMin >= 20) {
        const startHour = interval.start.getHours();
        const isEvening = startHour >= 16;
        const isEveOrWknd = isWeekend || isEvening;

        freeIntervals.push({
          id: `free-slot-${++intervalCounter}`,
          start: interval.start,
          end: interval.end,
          durationMinutes: durMin,
          isSchoolPeriod: false,
          dayStr,
          dayOfWeek,
          isEveningOrWeekend: isEveOrWknd,
        });
      }
    });
  }

  // Sort all free intervals strictly chronologically
  freeIntervals.sort((a, b) => a.start.getTime() - b.start.getTime());

  const totalFreeMinutes = freeIntervals.reduce((sum, int) => sum + int.durationMinutes, 0);

  return { freeIntervals, totalFreeMinutes };
}

export function calculateFreeIntervals(params: {
  settings: UserScheduleSettings;
  allCalendarEvents?: FixedEventItem[];
  fixedEvents?: FixedEventItem[];
  quizzesAndTests?: QuizTestItem[];
  preservedBlocks?: ScheduleBlock[];
  currentTime: Date;
  horizonDays: number;
}): FreeInterval[] {
  const events = params.allCalendarEvents || params.fixedEvents || [];
  return computeFreeIntervals({
    settings: params.settings,
    fixedEvents: events,
    quizzesAndTests: params.quizzesAndTests || [],
    preservedBlocks: params.preservedBlocks || [],
    currentTime: params.currentTime,
    horizonDays: params.horizonDays,
  }).freeIntervals;
}
