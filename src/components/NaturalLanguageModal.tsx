import React, { useState } from 'react';
import { useScheduler } from '../context/SchedulerContext';
import { toLocalDateString } from '../utils/dateUtils';
import { Sparkles, ArrowRight, X, BookOpen, FileCheck, Target, Loader2 } from 'lucide-react';

interface NaturalLanguageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EXAMPLE_PROMPTS = [
  'Physics test Friday, need about 2 hours to study',
  'Finish economics worksheet, about 45 minutes, due Monday',
  'Practice USACO for 5 hours this week',
  'Chemistry lab report, 3 hours, due next Wednesday',
];

export const NaturalLanguageModal: React.FC<NaturalLanguageModalProps> = ({ isOpen, onClose }) => {
  const { addHomework, addQuizTest, addGoal, triggerAiSchedule } = useScheduler();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedItemName, setAddedItemName] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (textToParse: string) => {
    const query = textToParse.trim();
    if (!query) return;

    setLoading(true);
    setError(null);
    setAddedItemName(null);

    try {
      const res = await fetch('/api/parse-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: query,
          referenceDate: toLocalDateString(new Date()),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.item) {
        throw new Error(data.error || 'Failed to understand task');
      }

      const item = data.item;
      let nameCreated = '';

      if (item.workType === 'quiz_test') {
        const test = addQuizTest({
          name: item.name || 'Assessment',
          subject: item.subject || 'General',
          type: item.assessmentType === 'quiz' ? 'quiz' : 'test',
          assessmentDate: item.assessmentDate || toLocalDateString(new Date()),
          assessmentTime: item.assessmentTime || '09:00',
          studyMinutesRequired: item.durationMinutes || item.studyMinutesRequired || 60,
          priority: item.priority || 'high',
          notes: item.notes || '',
          completed: false,
        });
        nameCreated = `${test.type === 'quiz' ? 'Quiz' : 'Test'}: ${test.name} (+ Study: ${test.name})`;
      } else if (item.workType === 'goal') {
        const goal = addGoal({
          name: item.name || 'Weekly Goal',
          subject: item.subject || 'General',
          weeklyTargetMinutes: item.weeklyTargetMinutes || item.durationMinutes || 180,
          priority: item.priority || 'medium',
          focusRequirement: item.focusRequirement || 'high',
          notes: item.notes || '',
        });
        nameCreated = `Goal: ${goal.name} (${goal.weeklyTargetMinutes} min/wk)`;
      } else {
        // Homework
        const hw = addHomework({
          name: item.name || 'Homework Assignment',
          subject: item.subject || 'General',
          estimatedDuration: item.durationMinutes || 60,
          dueDate: item.dueDate || toLocalDateString(new Date()),
          dueTime: item.dueTime,
          priority: item.priority || 'medium',
          focusRequirement: item.focusRequirement || 'medium',
          canDoAtSchool: !!item.canDoAtSchool,
          splittable: item.splittable !== undefined ? item.splittable : (item.durationMinutes || 60) > 60,
          notes: item.notes || '',
          completed: false,
        });
        nameCreated = `Homework: ${hw.name} (${hw.estimatedDuration} min)`;
      }

      setAddedItemName(nameCreated);
      setInput('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-lg p-6 animate-scale-in">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-indigo-50 text-indigo-600">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-stone-900">Add Work with AI</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-4">
          <p className="text-xs text-stone-600 leading-relaxed">
            Type your assignments, upcoming tests, or ongoing weekly goals in plain English. Gemini extracts dates, subjects, durations, and requirements automatically.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(input);
            }}
            className="space-y-3"
          >
            <div className="relative">
              <input
                id="ai-natural-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. Physics test Friday, need about 2 hours to study..."
                className="w-full px-4 py-3 text-sm border border-stone-300 rounded-lg pr-12 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-stone-50/50"
                autoFocus
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="absolute right-2 top-2 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 text-white rounded-md transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </form>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-md border border-red-200">
              {error}
            </div>
          )}

          {addedItemName && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 truncate">
                <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium truncate">{addedItemName} added!</span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await triggerAiSchedule();
                  onClose();
                }}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-xs whitespace-nowrap transition-colors"
              >
                Schedule with AI
              </button>
            </div>
          )}

          <div className="pt-2">
            <div className="text-xs font-medium text-stone-500 mb-2">Try clicking an example:</div>
            <div className="space-y-1.5">
              {EXAMPLE_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setInput(prompt);
                    handleSubmit(prompt);
                  }}
                  className="w-full text-left text-xs text-stone-700 hover:text-indigo-700 hover:bg-indigo-50/60 p-2 rounded-md transition-colors border border-stone-100 flex items-center justify-between"
                >
                  <span className="truncate">"{prompt}"</span>
                  <ArrowRight className="w-3 h-3 text-stone-400 shrink-0 ml-2" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-stone-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
