import React, { useState } from 'react';
import { useScheduler } from '../../context/SchedulerContext';
import { ScheduleBlock, FixedEventItem } from '../../types';
import { toLocalDateString } from '../../utils/dateUtils';
import { X, Trash2, CheckCircle2, Circle, Clock, Tag, Sparkles } from 'lucide-react';

interface EditBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  block: ScheduleBlock | null;
  fixedEvent: FixedEventItem | null;
}

export const EditBlockModal: React.FC<EditBlockModalProps> = ({
  isOpen,
  onClose,
  block,
  fixedEvent,
}) => {
  const {
    updateScheduleBlock,
    deleteScheduleBlock,
    updateFixedEvent,
    deleteFixedEvent,
    homework,
    goals,
  } = useScheduler();

  if (!isOpen || (!block && !fixedEvent)) return null;

  // Handle schedule block editing
  if (block) {
    const startObj = new Date(block.startTime);
    const endObj = new Date(block.endTime);

    const [title, setTitle] = useState(block.title);
    const [dateStr, setDateStr] = useState(toLocalDateString(startObj));
    const [startTimeStr, setStartTimeStr] = useState(
      `${String(startObj.getHours()).padStart(2, '0')}:${String(startObj.getMinutes()).padStart(2, '0')}`
    );
    const [endTimeStr, setEndTimeStr] = useState(
      `${String(endObj.getHours()).padStart(2, '0')}:${String(endObj.getMinutes()).padStart(2, '0')}`
    );
    const [completed, setCompleted] = useState(block.completed);
    const [notes, setNotes] = useState(block.notes || '');

    // Current planned duration based on start and end time inputs
    const [sH, sM] = startTimeStr.split(':').map(Number);
    const [eH, eM] = endTimeStr.split(':').map(Number);
    const currentPlannedDuration = (!isNaN(sH) && !isNaN(eH))
      ? Math.max(15, (eH * 60 + eM) - (sH * 60 + sM))
      : block.durationMinutes;

    // Log progress state: defaults to 0 (or previous actualMinutesCompleted or duration if already completed)
    const [actualMinutesCompleted, setActualMinutesCompleted] = useState<number>(() => {
      if (block.actualMinutesCompleted !== undefined) {
        return Math.min(block.durationMinutes, Math.max(0, block.actualMinutesCompleted));
      }
      return block.completed ? block.durationMinutes : 0;
    });

    const handleProgressChange = (val: number) => {
      const clamped = Math.max(0, Math.min(currentPlannedDuration, val));
      setActualMinutesCompleted(clamped);
      if (clamped >= currentPlannedDuration) {
        setCompleted(true);
      } else if (completed && clamped < currentPlannedDuration) {
        setCompleted(false);
      }
    };

    const handleToggleCompleted = () => {
      const nextCompleted = !completed;
      setCompleted(nextCompleted);
      if (nextCompleted) {
        setActualMinutesCompleted(currentPlannedDuration);
      } else {
        if (actualMinutesCompleted >= currentPlannedDuration) {
          setActualMinutesCompleted(0);
        }
      }
    };

    // Underlying work item info
    const underlyingHw = homework.find((h) => h.id === block.workId);
    const underlyingGoal = goals.find((g) => g.id === block.workId);

    const handleSave = (e: React.FormEvent) => {
      e.preventDefault();

      const [startHour, startMinute] = startTimeStr.split(':').map(Number);
      const [endHour, endMinute] = endTimeStr.split(':').map(Number);
      const [y, m, d] = dateStr.split('-').map(Number);

      const newStart = new Date(y, m - 1, d, startHour, startMinute, 0, 0);
      const newEnd = new Date(y, m - 1, d, endHour, endMinute, 0, 0);

      const durationMinutes = Math.max(15, Math.round((newEnd.getTime() - newStart.getTime()) / (60 * 1000)));
      const finalActualMins = Math.max(0, Math.min(durationMinutes, actualMinutesCompleted));
      const finalCompleted = finalActualMins >= durationMinutes ? true : completed;

      updateScheduleBlock(block.id, {
        title,
        startTime: newStart.toISOString(),
        endTime: newEnd.toISOString(),
        durationMinutes,
        actualMinutesCompleted: finalActualMins,
        completed: finalCompleted,
        notes,
        isManual: true, // User edited this block manually
      });
      onClose();
    };

    const handleUnschedule = () => {
      // Unschedules this block ONLY - underlying work item in Work remains!
      deleteScheduleBlock(block.id);
      onClose();
    };

    return (
      <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-md p-6 animate-scale-in">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
                  block.workType === 'homework'
                    ? 'bg-blue-100 text-blue-800'
                    : block.workType === 'study'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {block.workType === 'study' ? 'Study Session' : block.workType}
              </span>
              <h2 className="text-base font-semibold text-stone-900 truncate max-w-xs">
                Edit Schedule Block
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-stone-400 hover:text-stone-700 p-1 rounded-md"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSave} className="py-4 space-y-3.5 text-xs text-stone-700">
            {/* Underlying item link info banner */}
            {(underlyingHw || underlyingGoal) && (
              <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-stone-500">Linked Work Item</div>
                  <div className="font-medium text-stone-900 truncate">
                    {underlyingHw?.name || underlyingGoal?.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-stone-500">Subject</div>
                  <div className="font-medium text-stone-800">
                    {underlyingHw?.subject || underlyingGoal?.subject || 'General'}
                  </div>
                </div>
              </div>
            )}

            {/* AI Scheduling Rationale / Explanation */}
            {block.explanation && (
              <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-lg text-xs text-indigo-900 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-indigo-950 mb-0.5">AI Placement Rationale</div>
                  <div className="text-indigo-800 leading-relaxed">{block.explanation}</div>
                </div>
              </div>
            )}

            <div>
              <label className="block font-medium text-stone-700 mb-1">Session Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block font-medium text-stone-700 mb-1">Date</label>
                <input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 border border-stone-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block font-medium text-stone-700 mb-1">Start Time</label>
                <input
                  type="time"
                  value={startTimeStr}
                  onChange={(e) => setStartTimeStr(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 border border-stone-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block font-medium text-stone-700 mb-1">End Time</label>
                <input
                  type="time"
                  value={endTimeStr}
                  onChange={(e) => setEndTimeStr(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 border border-stone-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-stone-700 mb-1">Notes / Focus Plan</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Specific problem sets or chapters for this session..."
                className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
              />
            </div>

            {/* Log Progress Control */}
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-xs text-stone-900">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Log progress</span>
                </div>
                <div className="text-xs font-mono font-medium text-stone-700">
                  <span className="text-indigo-600 font-bold text-sm">{actualMinutesCompleted}</span>
                  <span className="text-stone-400"> / </span>
                  <span>{currentPlannedDuration}m planned</span>
                  {actualMinutesCompleted > 0 && actualMinutesCompleted < currentPlannedDuration && (
                    <span className="ml-2 text-[10px] font-sans font-medium text-amber-700 bg-amber-100/90 px-1.5 py-0.5 rounded">
                      {currentPlannedDuration - actualMinutesCompleted}m remaining
                    </span>
                  )}
                  {actualMinutesCompleted >= currentPlannedDuration && (
                    <span className="ml-2 text-[10px] font-sans font-medium text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded">
                      Completed
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Slider */}
              <div className="space-y-1">
                <input
                  type="range"
                  min={0}
                  max={currentPlannedDuration}
                  step={5}
                  value={actualMinutesCompleted}
                  onChange={(e) => handleProgressChange(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-stone-200 rounded-lg appearance-none"
                />
                <div className="flex items-center justify-between text-[10px] text-stone-400 font-mono">
                  <span>0m</span>
                  <span>{Math.round(currentPlannedDuration / 2)}m</span>
                  <span>{currentPlannedDuration}m</span>
                </div>
              </div>

              {/* Direct numeric input and quick presets */}
              <div className="flex items-center justify-between pt-1 gap-2 border-t border-stone-200/60">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-stone-600">Minutes worked:</span>
                  <input
                    type="number"
                    min={0}
                    max={currentPlannedDuration}
                    value={actualMinutesCompleted}
                    onChange={(e) => handleProgressChange(Number(e.target.value))}
                    className="w-16 px-2 py-1 border border-stone-300 rounded text-xs text-center font-mono font-medium bg-white"
                  />
                </div>
                <div className="flex items-center gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleProgressChange(0)}
                    className="px-2 py-1 bg-stone-200/70 hover:bg-stone-200 text-stone-700 rounded transition-colors"
                  >
                    0m
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProgressChange(Math.round(currentPlannedDuration / 2))}
                    className="px-2 py-1 bg-stone-200/70 hover:bg-stone-200 text-stone-700 rounded transition-colors"
                  >
                    Half
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProgressChange(currentPlannedDuration)}
                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium rounded transition-colors"
                  >
                    All ({currentPlannedDuration}m)
                  </button>
                </div>
              </div>
            </div>

            {/* Completed toggle */}
            <div className="pt-0.5">
              <div
                onClick={handleToggleCompleted}
                className="flex items-center gap-2 cursor-pointer p-2 bg-stone-50 rounded-lg border border-stone-200 hover:bg-stone-100/70 transition-colors"
              >
                {completed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-stone-400 shrink-0" />
                )}
                <div>
                  <div className="text-xs font-semibold text-stone-800">
                    {completed ? 'Session Completed' : 'Mark as Completed'}
                  </div>
                  <div className="text-[11px] text-stone-500">
                    Auto-completes when logged minutes equal planned duration. Unfinished minutes replan automatically.
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
              <button
                type="button"
                onClick={handleUnschedule}
                className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 hover:bg-red-50 rounded-md transition-colors"
                title="Remove only this calendar block (keeps work in Work list)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Unschedule Block</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Handle fixed event editing
  if (fixedEvent) {
    const startObj = new Date(fixedEvent.startTime);
    const endObj = new Date(fixedEvent.endTime);

    const [title, setTitle] = useState(fixedEvent.title);
    const [dateStr, setDateStr] = useState(toLocalDateString(startObj));
    const [startTimeStr, setStartTimeStr] = useState(
      `${String(startObj.getHours()).padStart(2, '0')}:${String(startObj.getMinutes()).padStart(2, '0')}`
    );
    const [endTimeStr, setEndTimeStr] = useState(
      `${String(endObj.getHours()).padStart(2, '0')}:${String(endObj.getMinutes()).padStart(2, '0')}`
    );
    const [notes, setNotes] = useState(fixedEvent.notes || '');

    const handleSaveFixed = (e: React.FormEvent) => {
      e.preventDefault();
      const [sH, sM] = startTimeStr.split(':').map(Number);
      const [eH, eM] = endTimeStr.split(':').map(Number);
      const [y, m, d] = dateStr.split('-').map(Number);

      const newStart = new Date(y, m - 1, d, sH, sM, 0, 0);
      const newEnd = new Date(y, m - 1, d, eH, eM, 0, 0);

      updateFixedEvent(fixedEvent.id, {
        title,
        startTime: newStart.toISOString(),
        endTime: newEnd.toISOString(),
        notes,
      });
      onClose();
    };

    return (
      <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-md p-6 animate-scale-in">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <h2 className="text-base font-semibold text-stone-900">Edit Fixed Event</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-stone-400 hover:text-stone-700 p-1 rounded-md"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveFixed} className="py-4 space-y-3.5 text-xs text-stone-700">
            <div>
              <label className="block font-medium text-stone-700 mb-1">Event Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block font-medium text-stone-700 mb-1">Date</label>
                <input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 border border-stone-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block font-medium text-stone-700 mb-1">Start</label>
                <input
                  type="time"
                  value={startTimeStr}
                  onChange={(e) => setStartTimeStr(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 border border-stone-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block font-medium text-stone-700 mb-1">End</label>
                <input
                  type="time"
                  value={endTimeStr}
                  onChange={(e) => setEndTimeStr(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 border border-stone-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-stone-700 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Location or description"
                className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
              />
            </div>

            <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  deleteFixedEvent(fixedEvent.id);
                  onClose();
                }}
                className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Event</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return null;
};
