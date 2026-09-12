import React from 'react';
import { useScheduler } from '../context/SchedulerContext';
import { HomeworkItem, QuizTestItem, GoalItem } from '../types';
import {
  BookOpen,
  FileCheck,
  Target,
  Plus,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Edit2,
  Trash2,
  School,
  Split,
  AlertCircle,
  AlertTriangle,
  X,
} from 'lucide-react';

interface WorkViewProps {
  onAddHomework: () => void;
  onAddQuizTest: () => void;
  onAddGoal: () => void;
  onEditHomework: (hw: HomeworkItem) => void;
  onEditQuizTest: (qt: QuizTestItem) => void;
  onEditGoal: (g: GoalItem) => void;
}

export const WorkView: React.FC<WorkViewProps> = ({
  onAddHomework,
  onAddQuizTest,
  onAddGoal,
  onEditHomework,
  onEditQuizTest,
  onEditGoal,
}) => {
  const {
    homework,
    quizzesAndTests,
    goals,
    scheduleBlocks,
    toggleHomeworkCompleted,
    toggleQuizTestCompleted,
    deleteHomework,
    deleteQuizTest,
    deleteGoal,
    scheduleWarnings,
    dismissWarning,
  } = useScheduler();

  // Helper to get scheduled blocks for a work item
  const getBlocksForWork = (workId: string) => {
    return scheduleBlocks.filter((b) => b.workId === workId);
  };

  const formatPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'medium':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'low':
        return 'bg-stone-100 text-stone-600 border-stone-200';
      default:
        return 'bg-stone-100 text-stone-600 border-stone-200';
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-8 pb-16">
      {/* Schedule Alerts Banner */}
      {scheduleWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-amber-200/70">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>Schedule alerts ({scheduleWarnings.length})</span>
            </div>
            <span className="text-xs text-amber-800">
              Review feasibility deficits or late manual reservations
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {scheduleWarnings.map((w) => (
              <div
                key={w.id}
                className="bg-white/80 p-3 rounded-lg border border-amber-200 text-xs flex items-start justify-between gap-3"
              >
                <div>
                  <span
                    className={`font-bold mr-1.5 ${
                      w.severity === 'error' ? 'text-red-700' : 'text-amber-800'
                    }`}
                  >
                    [{w.severity.toUpperCase()}]
                  </span>
                  <span className="text-stone-900 font-medium">{w.message}</span>
                  {w.shortfallMinutes && (
                    <span className="ml-1 text-red-700 font-semibold">
                      (Shortfall: {w.shortfallMinutes} mins)
                    </span>
                  )}
                  {w.suggestedAction && (
                    <div className="text-stone-600 mt-1 pl-2 border-l-2 border-amber-300">
                      Recommendation: {w.suggestedAction}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissWarning(w.id)}
                  className="text-stone-400 hover:text-stone-700 p-1 rounded shrink-0"
                  title="Dismiss warning"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1. HOMEWORK SECTION */}
      <section className="bg-white rounded-xl border border-stone-200 shadow-xs p-5 sm:p-6">
        <div className="flex items-center justify-between pb-4 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-stone-900">Homework</h2>
              <p className="text-xs text-stone-500">
                Assignments, problem sets, essays, and study prep sessions
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAddHomework}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Homework</span>
          </button>
        </div>

        <div className="divide-y divide-stone-100 mt-2">
          {homework.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-400">
              No homework assignments yet. Add one above or type in the AI bar!
            </div>
          ) : (
            homework.map((hw) => {
              const blocks = getBlocksForWork(hw.id);
              const isStudy = !!hw.linkedTestId;

              return (
                <div
                  key={hw.id}
                  className={`py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-opacity ${
                    hw.completed ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleHomeworkCompleted(hw.id)}
                      className="mt-0.5 text-stone-400 hover:text-stone-700 shrink-0"
                      title={hw.completed ? 'Mark incomplete' : 'Mark completed'}
                    >
                      {hw.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-semibold text-sm ${
                            hw.completed ? 'line-through text-stone-400' : 'text-stone-900'
                          }`}
                        >
                          {hw.name}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-medium">
                          {hw.subject}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded border uppercase font-bold tracking-wider ${formatPriorityBadge(
                            hw.priority
                          )}`}
                        >
                          {hw.priority}
                        </span>
                        {hw.canDoAtSchool && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <School className="w-3 h-3" />
                            <span>School OK</span>
                          </span>
                        )}
                        {hw.splittable && hw.estimatedDuration >= 75 && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                            <Split className="w-3 h-3" />
                            <span>Splittable</span>
                          </span>
                        )}
                      </div>

                      {/* Scheduled Blocks Breakdown */}
                      <div className="flex items-center gap-3 text-xs text-stone-500 mt-1 flex-wrap">
                        <span className="font-medium text-stone-700">
                          Remaining: {hw.remainingDuration}m of {hw.estimatedDuration}m
                        </span>
                        {hw.scheduledFutureMinutes !== undefined && hw.scheduledFutureMinutes > 0 && (
                          <span className="text-indigo-700 bg-indigo-50/70 border border-indigo-100 px-1.5 py-0.5 rounded text-[11px] font-medium">
                            {hw.scheduledFutureMinutes}m reserved ahead
                          </span>
                        )}
                        <span>•</span>
                        <span>
                          Due: {hw.dueDate} {hw.dueTime ? `@ ${hw.dueTime}` : ''}
                        </span>

                        {blocks.length > 0 && (
                          <>
                            <span>•</span>
                            <div className="flex items-center gap-1 text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded text-[11px]">
                              <Calendar className="w-3 h-3 shrink-0" />
                              <span>
                                {blocks.length} session{blocks.length > 1 ? 's' : ''} ({blocks.map((b) => `${b.durationMinutes}m`).join(', ')})
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {hw.notes && (
                        <p className="text-xs text-stone-400 mt-1 italic line-clamp-1">{hw.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => onEditHomework(hw)}
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-md transition-colors"
                      title="Edit details"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete assignment "${hw.name}"?`)) {
                          deleteHomework(hw.id);
                        }
                      }}
                      className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete assignment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 2. QUIZZES AND TESTS SECTION */}
      <section className="bg-white rounded-xl border border-stone-200 shadow-xs p-5 sm:p-6">
        <div className="flex items-center justify-between pb-4 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-stone-900">Quizzes & Tests</h2>
              <p className="text-xs text-stone-500">
                Scheduled exam dates with linked study requirements
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAddQuizTest}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Quiz / Test</span>
          </button>
        </div>

        <div className="divide-y divide-stone-100 mt-2">
          {quizzesAndTests.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-400">
              No upcoming exams or quizzes scheduled.
            </div>
          ) : (
            quizzesAndTests.map((qt) => {
              const linkedStudyHw = homework.find((h) => h.id === qt.linkedStudyHomeworkId);
              const studyBlocks = linkedStudyHw ? getBlocksForWork(linkedStudyHw.id) : [];

              return (
                <div
                  key={qt.id}
                  className={`py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    qt.completed ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleQuizTestCompleted(qt.id)}
                      className="mt-0.5 text-stone-400 hover:text-stone-700 shrink-0"
                    >
                      {qt.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-semibold text-sm ${
                            qt.completed ? 'line-through text-stone-400' : 'text-stone-900'
                          }`}
                        >
                          {qt.name}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-medium capitalize">
                          {qt.type}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-medium">
                          {qt.subject}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded border uppercase font-bold tracking-wider ${formatPriorityBadge(
                            qt.priority
                          )}`}
                        >
                          {qt.priority}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-stone-500 mt-1 flex-wrap">
                        <span className="font-medium text-stone-700">
                          Date: {qt.assessmentDate} {qt.assessmentTime ? `@ ${qt.assessmentTime}` : ''}
                        </span>
                        <span>•</span>
                        <span>Required Study: {qt.studyMinutesRequired}m</span>
                        {linkedStudyHw && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                              Study Remaining: {linkedStudyHw.remainingDuration}m (
                              {studyBlocks.length} session{studyBlocks.length === 1 ? '' : 's'}{' '}
                              scheduled)
                            </span>
                          </>
                        )}
                      </div>

                      {qt.notes && (
                        <p className="text-xs text-stone-400 mt-1 italic line-clamp-1">{qt.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => onEditQuizTest(qt)}
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-md transition-colors"
                      title="Edit assessment"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete ${qt.type} "${qt.name}"?`)) {
                          deleteQuizTest(qt.id);
                        }
                      }}
                      className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete assessment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 3. GOALS SECTION */}
      <section className="bg-white rounded-xl border border-stone-200 shadow-xs p-5 sm:p-6">
        <div className="flex items-center justify-between pb-4 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-stone-900">Goals</h2>
              <p className="text-xs text-stone-500">
                Ongoing weekly targets (USACO, PSAT, AMC, programming, etc.)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAddGoal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Goal</span>
          </button>
        </div>

        <div className="divide-y divide-stone-100 mt-2">
          {goals.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-400">
              No weekly goals created yet.
            </div>
          ) : (
            goals.map((g) => {
              const blocks = getBlocksForWork(g.id);
              const progressPct = Math.min(
                100,
                Math.round((g.minutesCompletedThisWeek / g.weeklyTargetMinutes) * 100)
              );

              return (
                <div
                  key={g.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 rounded-lg bg-amber-100/70 text-amber-800 mt-0.5 shrink-0">
                      <Target className="w-4 h-4" />
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-stone-900">{g.name}</span>
                        {g.subject && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-medium">
                            {g.subject}
                          </span>
                        )}
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded border uppercase font-bold tracking-wider ${formatPriorityBadge(
                            g.priority
                          )}`}
                        >
                          {g.priority}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-stone-100 text-stone-600">
                          Focus: {g.focusRequirement}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-2 max-w-md">
                        <div className="flex items-center justify-between text-[11px] text-stone-500 mb-1">
                          <span>
                            {g.minutesCompletedThisWeek}m logged / {g.weeklyTargetMinutes}m target
                            {g.scheduledFutureMinutes !== undefined && g.scheduledFutureMinutes > 0 && (
                              <span className="ml-2 font-medium text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                                +{g.scheduledFutureMinutes}m reserved
                              </span>
                            )}
                          </span>
                          <span className="font-medium text-stone-700">{progressPct}%</span>
                        </div>
                        <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden border border-stone-200">
                          <div
                            className="h-full bg-amber-500 rounded-full transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-stone-500 mt-2 flex-wrap">
                        <span>
                          Target: {(g.weeklyTargetMinutes / 60).toFixed(1)} hrs/week
                        </span>
                        {blocks.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded text-[11px]">
                              {blocks.length} session{blocks.length > 1 ? 's' : ''} planned this week
                            </span>
                          </>
                        )}
                        {g.deadline && (
                          <>
                            <span>•</span>
                            <span>Target Deadline: {g.deadline}</span>
                          </>
                        )}
                      </div>

                      {g.notes && (
                        <p className="text-xs text-stone-400 mt-1 italic line-clamp-1">{g.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => onEditGoal(g)}
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-md transition-colors"
                      title="Edit goal"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete goal "${g.name}"?`)) {
                          deleteGoal(g.id);
                        }
                      }}
                      className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete goal"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
