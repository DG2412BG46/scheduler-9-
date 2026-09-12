import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useScheduler } from '../context/SchedulerContext';
import {
  ScheduleBlock,
  FixedEventItem,
} from '../types';
import { toLocalDateString } from '../utils/dateUtils';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  Circle,
  Clock,
  BookOpen,
  Target,
  FileCheck,
  AlertTriangle,
  Sparkles,
  X,
  Info,
} from 'lucide-react';

interface CalendarViewProps {
  onSelectSlot: (date: Date, hour: number, minute: number) => void;
  onEditBlock: (block: ScheduleBlock) => void;
  onEditFixedEvent: (event: FixedEventItem) => void;
}

const HOUR_HEIGHT = 56; // px per hour
const START_HOUR = 7; // 7:00 AM
const END_HOUR = 23; // 11:00 PM
const TOTAL_HOURS = END_HOUR - START_HOUR;

export const CalendarView: React.FC<CalendarViewProps> = ({
  onSelectSlot,
  onEditBlock,
  onEditFixedEvent,
}) => {
  const {
    scheduleBlocks,
    fixedEvents,
    quizzesAndTests,
    toggleBlockCompleted,
    settings,
    scheduleWarnings,
    dismissWarning,
    lastScheduleResult,
  } = useScheduler();
  const [viewMode, setViewMode] = useState<'day' | 'week'>('week');
  const [currentAnchorDate, setCurrentAnchorDate] = useState<Date>(() => new Date());
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to near current time on load
  useEffect(() => {
    if (gridContainerRef.current) {
      const now = new Date();
      const currentH = now.getHours();
      const targetScroll = Math.max(0, (currentH - START_HOUR - 1) * HOUR_HEIGHT);
      gridContainerRef.current.scrollTop = targetScroll;
    }
  }, []);

  // Compute displayed dates
  const displayedDates = useMemo(() => {
    if (viewMode === 'day') {
      return [new Date(currentAnchorDate)];
    }
    // Week view: Find start of week (e.g. Monday or Sunday; let's do Monday start for academic calendar)
    const anchor = new Date(currentAnchorDate);
    const dayOfWeek = anchor.getDay(); // 0 = Sun, 1 = Mon ...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() + diffToMonday);

    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      week.push(d);
    }
    return week;
  }, [currentAnchorDate, viewMode]);

  const handlePrev = () => {
    const next = new Date(currentAnchorDate);
    if (viewMode === 'day') {
      next.setDate(next.getDate() - 1);
    } else {
      next.setDate(next.getDate() - 7);
    }
    setCurrentAnchorDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentAnchorDate);
    if (viewMode === 'day') {
      next.setDate(next.getDate() + 1);
    } else {
      next.setDate(next.getDate() + 7);
    }
    setCurrentAnchorDate(next);
  };

  const handleToday = () => {
    setCurrentAnchorDate(new Date());
  };

  // Assessment events derived from quizzes & tests
  const assessmentEvents = useMemo(() => {
    return quizzesAndTests.map((qt) => {
      const [y, m, d] = qt.assessmentDate.split('-').map(Number);
      const [h, min] = (qt.assessmentTime || '09:00').split(':').map(Number);
      const start = new Date(y, m - 1, d, h, min, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      return {
        id: `assessment-${qt.id}`,
        title: `${qt.type === 'quiz' ? 'Quiz' : 'Test'}: ${qt.name}`,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        type: 'assessment' as const,
        notes: qt.notes,
        subject: qt.subject,
      };
    });
  }, [quizzesAndTests]);

  // Combined fixed & assessment events
  const allEvents = useMemo(() => {
    return [...fixedEvents, ...assessmentEvents];
  }, [fixedEvents, assessmentEvents]);

  // Current time position
  const now = new Date();
  const currentMinutesFromStart = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
  const currentTimeTop = (currentMinutesFromStart / 60) * HOUR_HEIGHT;
  const isCurrentTimeInRange = now.getHours() >= START_HOUR && now.getHours() < END_HOUR;

  const formatDateHeader = (d: Date) => {
    const isToday = d.toDateString() === now.toDateString();
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const dayNumber = d.getDate();
    return { dayName, dayNumber, isToday };
  };

  // Header range title
  const headerTitle = useMemo(() => {
    if (viewMode === 'day') {
      return currentAnchorDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    const first = displayedDates[0];
    const last = displayedDates[displayedDates.length - 1];
    if (first.getMonth() === last.getMonth()) {
      return `${first.toLocaleDateString('en-US', { month: 'long' })} ${first.getDate()} – ${last.getDate()}, ${first.getFullYear()}`;
    }
    return `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, [currentAnchorDate, displayedDates, viewMode]);

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] bg-stone-50 overflow-hidden">
      {/* Calendar Controls Toolbar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 bg-white border-b border-stone-200">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToday}
            className="px-3 py-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200/80 rounded-md transition-colors"
          >
            Today
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-md transition-colors"
              title="Previous"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="p-1 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-md transition-colors"
              title="Next"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <h1 className="text-base font-semibold text-stone-900 ml-1">{headerTitle}</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* AI Plan-and-Score Optimizer Summary Pill */}
          {lastScheduleResult && (
            <div
              className="hidden lg:flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-200/80 rounded-lg text-xs text-indigo-900"
              title={`Optimizer: ${lastScheduleResult.selectedPlanStrategy}. Free horizon: ${Math.round(lastScheduleResult.freeMinutesRemaining / 60)}h open`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span className="font-semibold">{lastScheduleResult.selectedPlanStrategy.split(':')[0]}</span>
              <span className="text-indigo-400">•</span>
              <span className="text-indigo-700">Score: {lastScheduleResult.planScore}</span>
              <span className="text-indigo-400">•</span>
              <span className="text-indigo-700 font-mono text-[11px]">
                {Math.round(lastScheduleResult.freeMinutesRemaining / 60)}h free
              </span>
            </div>
          )}

          {/* Day / Week View Toggle */}
          <div className="flex items-center bg-stone-100 p-1 rounded-lg border border-stone-200">
            <button
              type="button"
              onClick={() => setViewMode('day')}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                viewMode === 'day'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                viewMode === 'week'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Week
            </button>
          </div>
        </div>
      </div>

      {/* Schedule Alerts Banner */}
      {scheduleWarnings.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 space-y-1.5 z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Schedule alerts ({scheduleWarnings.length})
              </span>
            </div>
            <span className="text-[11px] text-amber-700 hidden sm:inline">
              Review feasibility deficits or late manual reservations
            </span>
          </div>

          <div className="space-y-1 max-h-24 overflow-y-auto">
            {scheduleWarnings.map((w) => (
              <div
                key={w.id}
                className="flex items-start justify-between gap-3 text-xs bg-white/70 px-2.5 py-1.5 rounded border border-amber-200/60"
              >
                <div className="flex items-start gap-1.5">
                  <span
                    className={`font-semibold shrink-0 ${
                      w.severity === 'error' ? 'text-red-700' : 'text-amber-800'
                    }`}
                  >
                    [{w.severity.toUpperCase()}]
                  </span>
                  <span className="text-stone-800">{w.message}</span>
                  {w.suggestedAction && (
                    <span className="text-stone-500 hidden md:inline">— {w.suggestedAction}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissWarning(w.id)}
                  className="text-stone-400 hover:text-stone-700 p-0.5 rounded shrink-0"
                  title="Dismiss warning"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Days of Week Header */}
      <div className="flex border-b border-stone-200 bg-white sticky top-0 z-20">
        {/* Time Gutter Header */}
        <div className="w-16 sm:w-20 shrink-0 border-r border-stone-200 py-2.5 text-center text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
          Time
        </div>

        {/* Day Columns Header */}
        <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${displayedDates.length}, minmax(0, 1fr))` }}>
          {displayedDates.map((date, idx) => {
            const { dayName, dayNumber, isToday } = formatDateHeader(date);
            return (
              <div
                key={idx}
                className={`py-2 text-center border-r border-stone-100 last:border-r-0 ${
                  isToday ? 'bg-indigo-50/40' : ''
                }`}
              >
                <div className="text-[11px] font-medium text-stone-500">{dayName}</div>
                <div
                  className={`inline-flex items-center justify-center w-7 h-7 text-xs font-semibold rounded-full mt-0.5 ${
                    isToday ? 'bg-indigo-600 text-white font-bold' : 'text-stone-800'
                  }`}
                >
                  {dayNumber}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Scrollable Time Grid */}
      <div ref={gridContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden relative bg-white">
        <div className="flex relative" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
          {/* Time Gutter Column */}
          <div className="w-16 sm:w-20 shrink-0 border-r border-stone-200 relative select-none bg-stone-50/40">
            {Array.from({ length: TOTAL_HOURS }).map((_, i) => {
              const hour = START_HOUR + i;
              const displayHour = hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`;
              return (
                <div
                  key={hour}
                  className="absolute w-full pr-2 text-right text-[11px] font-medium text-stone-400 -translate-y-2.5"
                  style={{ top: `${i * HOUR_HEIGHT}px` }}
                >
                  {displayHour}
                </div>
              );
            })}
          </div>

          {/* Grid Columns */}
          <div
            className="flex-1 grid relative"
            style={{ gridTemplateColumns: `repeat(${displayedDates.length}, minmax(0, 1fr))` }}
          >
            {/* Horizontal Hour Dividing Lines */}
            {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
              <div
                key={i}
                className="absolute w-full border-t border-stone-100 pointer-events-none"
                style={{ top: `${i * HOUR_HEIGHT}px` }}
              />
            ))}

            {/* Day Column Tracks */}
            {displayedDates.map((date, colIdx) => {
              const dateStr = toLocalDateString(date);
              const isToday = date.toDateString() === now.toDateString();

              // Scheduled blocks for this day
              const dayBlocks = scheduleBlocks.filter((b) => {
                const bDateStr = toLocalDateString(b.startTime);
                return bDateStr === dateStr;
              });

              // Fixed events & assessments for this day
              const dayEvents = allEvents.filter((fe) => {
                const feDateStr = toLocalDateString(fe.startTime);
                return feDateStr === dateStr;
              });

              // School hours shading on weekdays if enabled (and not a school holiday)
              const isWeekday = date.getDay() >= 1 && date.getDay() <= 5;
              const isHoliday = (settings.holidays || []).includes(dateStr);
              const hasSchool = isWeekday && settings.hasSchoolOnWeekdays && !isHoliday;
              const [sH, sM] = settings.schoolStartTime.split(':').map(Number);
              const [eH, eM] = settings.schoolEndTime.split(':').map(Number);
              const schoolTop = ((sH - START_HOUR) + sM / 60) * HOUR_HEIGHT;
              const schoolHeight = ((eH - sH) + (eM - sM) / 60) * HOUR_HEIGHT;

              return (
                <div
                  key={colIdx}
                  className={`relative border-r border-stone-100 last:border-r-0 h-full ${
                    isToday ? 'bg-indigo-50/10' : ''
                  }`}
                  onClick={(e) => {
                    // Click on empty space in this column
                    const rect = e.currentTarget.getBoundingClientRect();
                    const offsetY = e.clientY - rect.top;
                    const clickedFractionHour = offsetY / HOUR_HEIGHT;
                    const totalHours = START_HOUR + clickedFractionHour;
                    const hour = Math.floor(totalHours);
                    const minuteFraction = totalHours - hour;
                    // Snap to nearest 15-minute mark
                    const minute = Math.floor((minuteFraction * 60) / 15) * 15;
                    onSelectSlot(date, hour, minute);
                  }}
                >
                  {/* Subtle School Hours Shading */}
                  {hasSchool && schoolTop >= 0 && (
                    <div
                      className="absolute w-full bg-stone-100/50 border-y border-dashed border-stone-200 pointer-events-none z-0 px-2 py-1 text-[10px] text-stone-400 font-medium"
                      style={{
                        top: `${schoolTop}px`,
                        height: `${schoolHeight}px`,
                      }}
                    >
                      School Hours
                    </div>
                  )}

                  {/* Current Time Red Line for Today */}
                  {isToday && isCurrentTimeInRange && (
                    <div
                      className="absolute w-full z-20 pointer-events-none flex items-center"
                      style={{ top: `${currentTimeTop}px` }}
                    >
                      <div className="w-2.5 h-2.5 -ml-1 rounded-full bg-red-600 shadow-xs" />
                      <div className="flex-1 border-t-2 border-red-600" />
                    </div>
                  )}

                  {/* Fixed Events & Assessments */}
                  {dayEvents.map((fe) => {
                    const start = new Date(fe.startTime);
                    const end = new Date(fe.endTime);
                    const startMin = (start.getHours() - START_HOUR) * 60 + start.getMinutes();
                    const endMin = (end.getHours() - START_HOUR) * 60 + end.getMinutes();
                    const top = Math.max(0, (startMin / 60) * HOUR_HEIGHT);
                    const height = Math.max(26, ((endMin - startMin) / 60) * HOUR_HEIGHT);

                    const isAssessment = fe.type === 'assessment';

                    return (
                      <div
                        key={fe.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (fe.type !== 'assessment') {
                            onEditFixedEvent(fe);
                          }
                        }}
                        style={{ top: `${top}px`, height: `${height}px` }}
                        className={`absolute left-1 right-1 rounded-md px-2 py-1 z-10 text-xs shadow-xs border cursor-pointer transition-all hover:scale-[1.01] overflow-hidden ${
                          isAssessment
                            ? 'bg-purple-600 text-white border-purple-700 font-semibold'
                            : 'bg-stone-200 text-stone-800 border-stone-300 hover:bg-stone-300'
                        }`}
                        title={fe.title}
                      >
                        <div className="flex items-center justify-between gap-1 leading-tight truncate">
                          <span className="truncate">{fe.title}</span>
                          {isAssessment && (
                            <span className="text-[10px] px-1 py-0.2 bg-purple-700 rounded text-purple-100 font-bold shrink-0">
                              EXAM
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] opacity-80 mt-0.5 truncate">
                          {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} –{' '}
                          {end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Scheduled Work Blocks */}
                  {dayBlocks.map((block) => {
                    const start = new Date(block.startTime);
                    const end = new Date(block.endTime);
                    const startMin = (start.getHours() - START_HOUR) * 60 + start.getMinutes();
                    const endMin = (end.getHours() - START_HOUR) * 60 + end.getMinutes();
                    const top = Math.max(0, (startMin / 60) * HOUR_HEIGHT);
                    const height = Math.max(28, ((endMin - startMin) / 60) * HOUR_HEIGHT);

                    // Styling by workType
                    let colorClasses = 'bg-blue-50/90 text-blue-950 border-blue-200 hover:border-blue-400';
                    let badgeClass = 'bg-blue-200/80 text-blue-800';

                    if (block.workType === 'study') {
                      colorClasses = 'bg-emerald-50/90 text-emerald-950 border-emerald-200 hover:border-emerald-400';
                      badgeClass = 'bg-emerald-200/80 text-emerald-800';
                    } else if (block.workType === 'goal') {
                      colorClasses = 'bg-amber-50/90 text-amber-950 border-amber-200 hover:border-amber-400';
                      badgeClass = 'bg-amber-200/80 text-amber-800';
                    }

                    if (block.completed) {
                      colorClasses = 'bg-stone-100 text-stone-400 border-stone-200 line-through';
                      badgeClass = 'bg-stone-200 text-stone-500';
                    }

                    return (
                      <div
                        key={block.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Clicking existing calendar item edits THAT item!
                          onEditBlock(block);
                        }}
                        style={{ top: `${top}px`, height: `${height}px` }}
                        className={`absolute left-1 right-1 rounded-md px-2 py-1 z-10 text-xs shadow-xs border cursor-pointer transition-all hover:scale-[1.01] flex flex-col justify-between overflow-hidden group ${colorClasses}`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 leading-snug">
                            <span className="font-semibold truncate text-[11px] sm:text-xs">
                              {block.title}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleBlockCompleted(block.id);
                              }}
                              className="opacity-75 hover:opacity-100 text-stone-500 shrink-0"
                              title={block.completed ? 'Mark incomplete' : 'Mark completed'}
                            >
                              {block.completed ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Circle className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {height >= 45 && (
                            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] opacity-85">
                              {block.subject && (
                                <span className={`px-1 py-0.2 rounded text-[9px] font-medium ${badgeClass}`}>
                                  {block.subject}
                                </span>
                              )}
                              <span>
                                {block.actualMinutesCompleted !== undefined && block.actualMinutesCompleted > 0 && !block.completed
                                  ? `${block.actualMinutesCompleted}/${block.durationMinutes}m`
                                  : `${block.durationMinutes}m`}
                              </span>
                              {block.explanation && (
                                <span title={block.explanation} className="text-indigo-600 flex items-center">
                                  <Sparkles className="w-3 h-3" />
                                </span>
                              )}
                            </div>
                          )}

                          {!block.completed && block.actualMinutesCompleted !== undefined && block.actualMinutesCompleted > 0 && height >= 55 && (
                            <div className="w-full bg-stone-200/80 rounded-full h-1 overflow-hidden mt-1">
                              <div
                                className="bg-indigo-600 h-1 rounded-full"
                                style={{
                                  width: `${Math.min(100, Math.round((block.actualMinutesCompleted / block.durationMinutes) * 100))}%`,
                                }}
                              />
                            </div>
                          )}
                        </div>

                        {height >= 65 && (
                          <div className="text-[10px] opacity-75 font-mono">
                            {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} –{' '}
                            {end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
