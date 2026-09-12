import React, { useState } from 'react';
import { useScheduler } from '../../context/SchedulerContext';
import {
  X,
  Clock,
  BookOpen,
  Calendar as CalendarIcon,
  FileCheck,
  Target,
  PlusCircle,
  Check,
} from 'lucide-react';
import { HomeworkItem, GoalItem } from '../../types';
import { toLocalDateString } from '../../utils/dateUtils';

interface SlotActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  selectedHour: number;
  selectedMinute: number;
  onCreateHomework: (initialDate: string, initialTime: string) => void;
  onCreateQuizTest: (initialDate: string, initialTime: string) => void;
  onCreateGoal: () => void;
  onCreateEvent: (initialStartTime: string, initialEndTime: string) => void;
}

export const SlotActionModal: React.FC<SlotActionModalProps> = ({
  isOpen,
  onClose,
  selectedDate,
  selectedHour,
  selectedMinute,
  onCreateHomework,
  onCreateQuizTest,
  onCreateGoal,
  onCreateEvent,
}) => {
  const { homework, goals, scheduleExistingWork } = useScheduler();
  const [tab, setTab] = useState<'schedule-existing' | 'create-new'>('schedule-existing');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [selectedWorkId, setSelectedWorkId] = useState<string>('');
  const [selectedWorkType, setSelectedWorkType] = useState<'homework' | 'study' | 'goal'>('homework');

  if (!isOpen) return null;

  const dateStr = toLocalDateString(selectedDate);
  const timeStr = `${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
  const startDateTime = new Date(selectedDate);
  startDateTime.setHours(selectedHour, selectedMinute, 0, 0);

  // Available homework & study items with remaining duration
  const availableHomework = homework.filter((hw) => !hw.completed && hw.remainingDuration > 0);
  const availableGoals = goals;

  const handleScheduleExisting = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkId) return;

    scheduleExistingWork(
      selectedWorkType,
      selectedWorkId,
      startDateTime.toISOString(),
      durationMinutes
    );
    onClose();
  };

  const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);
  const endTimeStr = `${String(endDateTime.getHours()).padStart(2, '0')}:${String(endDateTime.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-lg p-6 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div>
            <h2 className="text-base font-semibold text-stone-900">
              Schedule at {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, {timeStr}
            </h2>
            <p className="text-xs text-stone-500">Plan schoolwork or add an event in this time slot</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch: Schedule Existing Work vs Create New */}
        <div className="flex border-b border-stone-200 mt-4 mb-4">
          <button
            type="button"
            onClick={() => setTab('schedule-existing')}
            className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'schedule-existing'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            Schedule Existing Work
          </button>
          <button
            type="button"
            onClick={() => setTab('create-new')}
            className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'create-new'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            Create New Item
          </button>
        </div>

        {tab === 'schedule-existing' ? (
          <form onSubmit={handleScheduleExisting} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Select Work to Schedule:
              </label>
              <div className="max-h-56 overflow-y-auto space-y-1.5 border border-stone-200 rounded-lg p-2 bg-stone-50/50">
                {availableHomework.length === 0 && availableGoals.length === 0 && (
                  <div className="text-xs text-stone-500 p-3 text-center">
                    No unfinished work found. Switch to "Create New Item" to add some!
                  </div>
                )}

                {availableHomework.map((hw) => {
                  const isSelected = selectedWorkId === hw.id;
                  const isStudy = hw.linkedTestId;
                  return (
                    <div
                      key={hw.id}
                      onClick={() => {
                        setSelectedWorkId(hw.id);
                        setSelectedWorkType(isStudy ? 'study' : 'homework');
                        setDurationMinutes(Math.min(hw.remainingDuration, 60));
                      }}
                      className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/80 text-indigo-950 font-medium'
                          : 'border-stone-200 bg-white hover:border-stone-300 text-stone-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div
                          className={`p-1 rounded ${
                            isStudy ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                        </div>
                        <div className="truncate">
                          <div className="truncate font-medium">{hw.name}</div>
                          <div className="text-[11px] text-stone-500">
                            {hw.subject} • {hw.remainingDuration}m remaining of {hw.estimatedDuration}m
                          </div>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0 ml-2" />}
                    </div>
                  );
                })}

                {availableGoals.map((g) => {
                  const isSelected = selectedWorkId === g.id;
                  return (
                    <div
                      key={g.id}
                      onClick={() => {
                        setSelectedWorkId(g.id);
                        setSelectedWorkType('goal');
                        setDurationMinutes(60);
                      }}
                      className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/80 text-indigo-950 font-medium'
                          : 'border-stone-200 bg-white hover:border-stone-300 text-stone-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div className="p-1 rounded bg-amber-100 text-amber-700">
                          <Target className="w-3.5 h-3.5" />
                        </div>
                        <div className="truncate">
                          <div className="truncate font-medium">{g.name}</div>
                          <div className="text-[11px] text-stone-500">
                            Goal • {g.weeklyTargetMinutes}m/week ({g.minutesCompletedThisWeek}m logged)
                          </div>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0 ml-2" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Session duration selector */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Session Length ({timeStr} – {endTimeStr})
              </label>
              <div className="flex items-center gap-2">
                {[30, 45, 60, 75, 90, 120].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDurationMinutes(mins)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      durationMinutes === mins
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedWorkId}
                className="px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 rounded-lg shadow-xs"
              >
                Schedule Block
              </button>
            </div>
          </form>
        ) : (
          /* Create New Options */
          <div className="space-y-2.5 py-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onCreateHomework(dateStr, timeStr);
              }}
              className="w-full text-left p-3 rounded-lg border border-stone-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors flex items-center gap-3"
            >
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-stone-900">Create Homework</div>
                <div className="text-xs text-stone-500">Assignment, problem set, reading, or lab report</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onCreateQuizTest(dateStr, timeStr);
              }}
              className="w-full text-left p-3 rounded-lg border border-stone-200 hover:border-purple-300 hover:bg-purple-50/40 transition-colors flex items-center gap-3"
            >
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-stone-900">Create Quiz / Test</div>
                <div className="text-xs text-stone-500">Places exam on date & creates linked study time</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onCreateGoal();
              }}
              className="w-full text-left p-3 rounded-lg border border-stone-200 hover:border-amber-300 hover:bg-amber-50/40 transition-colors flex items-center gap-3"
            >
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-stone-900">Create Goal</div>
                <div className="text-xs text-stone-500">Ongoing weekly targets (USACO, AMC, PSAT, etc.)</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onCreateEvent(startDateTime.toISOString(), endDateTime.toISOString());
              }}
              className="w-full text-left p-3 rounded-lg border border-stone-200 hover:border-stone-300 hover:bg-stone-50 transition-colors flex items-center gap-3"
            >
              <div className="p-2 rounded-lg bg-stone-100 text-stone-600">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-stone-900">Create Fixed Event</div>
                <div className="text-xs text-stone-500">School commitment, sports practice, or doctor appointment</div>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
