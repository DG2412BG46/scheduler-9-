import React, { useState } from 'react';
import { useScheduler } from '../context/SchedulerContext';
import {
  Calendar as CalendarIcon,
  CheckSquare,
  Sparkles,
  Sliders,
  RotateCcw,
  Clock,
  X,
  Plus,
  Trash2,
} from 'lucide-react';

interface NavbarProps {
  onOpenQuickAdd: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenQuickAdd }) => {
  const {
    activeTab,
    setActiveTab,
    triggerAiSchedule,
    isScheduling,
    lastScheduleResult,
    settings,
    updateSettings,
    resetToDefaults,
  } = useScheduler();

  const [showSettings, setShowSettings] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New free period state
  const [newFreePeriodName, setNewFreePeriodName] = useState('Free Period');
  const [newFreePeriodDay, setNewFreePeriodDay] = useState(1); // Monday
  const [newFreePeriodStart, setNewFreePeriodStart] = useState('11:30');
  const [newFreePeriodEnd, setNewFreePeriodEnd] = useState('12:15');

  // New holiday state
  const [newHolidayDate, setNewHolidayDate] = useState('');

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const handleAddFreePeriod = (e: React.FormEvent) => {
    e.preventDefault();
    const period = {
      id: `sfp-${Date.now()}`,
      name: newFreePeriodName || 'Study Hall',
      dayOfWeek: Number(newFreePeriodDay),
      startTime: newFreePeriodStart,
      endTime: newFreePeriodEnd,
    };
    updateSettings({
      schoolFreePeriods: [...(settings.schoolFreePeriods || []), period],
    });
  };

  const handleRemoveFreePeriod = (id: string) => {
    updateSettings({
      schoolFreePeriods: (settings.schoolFreePeriods || []).filter((p) => p.id !== id),
    });
  };

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayDate) return;
    if (!(settings.holidays || []).includes(newHolidayDate)) {
      updateSettings({
        holidays: [...(settings.holidays || []), newHolidayDate].sort(),
      });
    }
    setNewHolidayDate('');
  };

  const handleRemoveHoliday = (date: string) => {
    updateSettings({
      holidays: (settings.holidays || []).filter((h) => h !== date),
    });
  };

  const handleAiSchedule = async () => {
    try {
      const summary = await triggerAiSchedule();
      setToastMessage(
        `AI Schedule updated: ${summary.blocksCreated} work sessions placed intelligently.`
      );
      setTimeout(() => setToastMessage(null), 4000);
    } catch {
      setToastMessage('Scheduling failed. Please check inputs.');
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-200 px-4 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Logo & Views */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center font-bold text-base shadow-sm">
                S
              </div>
              <span className="font-semibold text-stone-900 tracking-tight text-lg">
                Scheduler
              </span>
            </div>

            {/* Main Tabs */}
            <div className="flex items-center bg-stone-100 p-1 rounded-lg border border-stone-200/80">
              <button
                id="nav-tab-calendar"
                type="button"
                onClick={() => setActiveTab('calendar')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'calendar'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <CalendarIcon className="w-4 h-4 text-stone-500" />
                <span>Calendar</span>
              </button>
              <button
                id="nav-tab-work"
                type="button"
                onClick={() => setActiveTab('work')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'work'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <CheckSquare className="w-4 h-4 text-stone-500" />
                <span>Work</span>
              </button>
            </div>
          </div>

          {/* Quick Add & Primary AI Schedule Button */}
          <div className="flex items-center gap-2.5">
            {/* Quick Natural Language Add */}
            <button
              id="btn-quick-add"
              type="button"
              onClick={onOpenQuickAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-stone-700 bg-stone-100 hover:bg-stone-200/80 rounded-lg border border-stone-200 transition-colors"
              title="Add task via natural language"
            >
              <Plus className="w-4 h-4 text-stone-500" />
              <span className="hidden sm:inline">Add with AI</span>
            </button>

            {/* Primary Action: AI Schedule */}
            <button
              id="btn-ai-schedule"
              type="button"
              onClick={handleAiSchedule}
              disabled={isScheduling}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg text-white transition-all shadow-sm ${
                isScheduling
                  ? 'bg-stone-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]'
              }`}
            >
              <Sparkles className={`w-4 h-4 ${isScheduling ? 'animate-spin' : ''}`} />
              <span>{isScheduling ? 'Optimizing...' : 'AI Schedule'}</span>
            </button>

            {/* Settings & Reset */}
            <button
              id="btn-schedule-settings"
              type="button"
              onClick={() => setShowSettings(true)}
              className="p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors"
              title="Sleep & Wake Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Minimal Toast Feedback */}
        {toastMessage && (
          <div className="absolute top-16 right-6 z-50 bg-stone-900 text-white text-xs sm:text-sm px-4 py-2.5 rounded-lg shadow-lg border border-stone-800 flex items-center gap-2 animate-fade-in">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}
      </header>

      {/* Settings Modal (Sleep / Wake / School) */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-stone-200 w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 animate-scale-in">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-stone-700" />
                <h2 className="text-base font-semibold text-stone-900">Sleep & Schedule Settings</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-sm text-stone-700">
              <p className="text-xs text-stone-500 leading-relaxed">
                The scheduler strictly honors your sleep. It will never schedule study sessions during sleep or violate school hours.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Wake Time</label>
                  <input
                    type="time"
                    value={settings.wakeTime}
                    onChange={(e) => updateSettings({ wakeTime: e.target.value })}
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-md text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Sleep Time</label>
                  <input
                    type="time"
                    value={settings.sleepTime}
                    onChange={(e) => updateSettings({ sleepTime: e.target.value })}
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-md text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-stone-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.hasSchoolOnWeekdays}
                    onChange={(e) => updateSettings({ hasSchoolOnWeekdays: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-stone-800">Weekday School Schedule</span>
                </label>

                {settings.hasSchoolOnWeekdays && (
                  <div className="space-y-3 mt-3 pl-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-stone-500 mb-1">School Starts</label>
                        <input
                          type="time"
                          value={settings.schoolStartTime}
                          onChange={(e) => updateSettings({ schoolStartTime: e.target.value })}
                          className="w-full px-2.5 py-1.5 border border-stone-300 rounded-md text-xs focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-stone-500 mb-1">School Ends</label>
                        <input
                          type="time"
                          value={settings.schoolEndTime}
                          onChange={(e) => updateSettings({ schoolEndTime: e.target.value })}
                          className="w-full px-2.5 py-1.5 border border-stone-300 rounded-md text-xs focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Recurring Free Periods / Study Halls */}
                    <div className="pt-2 border-t border-stone-100">
                      <div className="text-xs font-semibold text-stone-800 mb-1">
                        School Free Periods (Study Halls)
                      </div>
                      <p className="text-[11px] text-stone-500 mb-2">
                        Recurring free periods during the school day suitable for assignments flagged with "School OK".
                      </p>

                      <div className="space-y-1.5 mb-2.5">
                        {(settings.schoolFreePeriods || []).length === 0 ? (
                          <div className="text-[11px] text-stone-400 italic">No free periods configured.</div>
                        ) : (
                          (settings.schoolFreePeriods || []).map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between px-2.5 py-1.5 bg-stone-50 rounded border border-stone-200 text-xs"
                            >
                              <div>
                                <span className="font-semibold text-stone-900">{dayNames[p.dayOfWeek]}: </span>
                                <span className="text-stone-700">{p.startTime} – {p.endTime}</span>
                                <span className="text-stone-400 ml-1.5 font-normal">({p.name})</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveFreePeriod(p.id)}
                                className="text-stone-400 hover:text-red-600 p-1"
                                title="Remove free period"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Add Free Period Form */}
                      <form onSubmit={handleAddFreePeriod} className="flex items-center gap-1.5 flex-wrap">
                        <select
                          value={newFreePeriodDay}
                          onChange={(e) => setNewFreePeriodDay(Number(e.target.value))}
                          className="px-2 py-1 border border-stone-300 rounded text-xs bg-white"
                        >
                          <option value={1}>Mon</option>
                          <option value={2}>Tue</option>
                          <option value={3}>Wed</option>
                          <option value={4}>Thu</option>
                          <option value={5}>Fri</option>
                        </select>
                        <input
                          type="time"
                          value={newFreePeriodStart}
                          onChange={(e) => setNewFreePeriodStart(e.target.value)}
                          className="px-1.5 py-1 border border-stone-300 rounded text-xs"
                        />
                        <span className="text-xs text-stone-400">–</span>
                        <input
                          type="time"
                          value={newFreePeriodEnd}
                          onChange={(e) => setNewFreePeriodEnd(e.target.value)}
                          className="px-1.5 py-1 border border-stone-300 rounded text-xs"
                        />
                        <input
                          type="text"
                          value={newFreePeriodName}
                          onChange={(e) => setNewFreePeriodName(e.target.value)}
                          placeholder="Name"
                          className="px-2 py-1 border border-stone-300 rounded text-xs w-24"
                        />
                        <button
                          type="submit"
                          className="px-2 py-1 bg-stone-800 text-white rounded text-xs hover:bg-stone-700 font-medium"
                        >
                          + Add
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>

              {/* Holidays and Days Off */}
              <div className="pt-2 border-t border-stone-100">
                <div className="text-xs font-semibold text-stone-800 mb-1">
                  School Holidays & Days Off
                </div>
                <p className="text-[11px] text-stone-500 mb-2">
                  Dates when school is not in session (full day opens for daytime study).
                </p>

                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {(settings.holidays || []).length === 0 ? (
                    <span className="text-[11px] text-stone-400 italic">No holidays added.</span>
                  ) : (
                    (settings.holidays || []).map((h) => (
                      <span
                        key={h}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-900 border border-indigo-200 rounded text-xs font-mono"
                      >
                        <span>{h}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveHoliday(h)}
                          className="text-indigo-400 hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <form onSubmit={handleAddHoliday} className="flex items-center gap-2">
                  <input
                    type="date"
                    value={newHolidayDate}
                    onChange={(e) => setNewHolidayDate(e.target.value)}
                    className="px-2.5 py-1 border border-stone-300 rounded text-xs"
                  />
                  <button
                    type="submit"
                    disabled={!newHolidayDate}
                    className="px-3 py-1 bg-stone-800 disabled:opacity-50 text-white rounded text-xs hover:bg-stone-700 font-medium"
                  >
                    + Add Day Off
                  </button>
                </form>
              </div>

              <div className="pt-4 border-t border-stone-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Reset sample academic data to original state?')) {
                      resetToDefaults();
                      setShowSettings(false);
                    }
                  }}
                  className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-medium"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Sample Data</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-sm font-medium"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
