import React, { useState, useEffect } from 'react';
import { useScheduler } from '../../context/SchedulerContext';
import {
  HomeworkItem,
  QuizTestItem,
  GoalItem,
  FixedEventItem,
  Priority,
  FocusRequirement,
  AssessmentType,
} from '../../types';
import { toLocalDateString } from '../../utils/dateUtils';
import { X, BookOpen, FileCheck, Target, Calendar as CalendarIcon } from 'lucide-react';

export type WorkItemModalMode = 'homework' | 'quiz_test' | 'goal' | 'event';

interface WorkItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: WorkItemModalMode;
  editHomework?: HomeworkItem | null;
  editQuizTest?: QuizTestItem | null;
  editGoal?: GoalItem | null;
  initialDate?: string;
  initialTime?: string;
  initialStartTime?: string;
  initialEndTime?: string;
}

export const WorkItemModal: React.FC<WorkItemModalProps> = ({
  isOpen,
  onClose,
  mode,
  editHomework,
  editQuizTest,
  editGoal,
  initialDate,
  initialTime,
  initialStartTime,
  initialEndTime,
}) => {
  const {
    addHomework,
    updateHomework,
    addQuizTest,
    updateQuizTest,
    addGoal,
    updateGoal,
    addFixedEvent,
  } = useScheduler();

  const todayStr = toLocalDateString(new Date());

  // Homework state
  const [hwName, setHwName] = useState('');
  const [hwSubject, setHwSubject] = useState('');
  const [hwDuration, setHwDuration] = useState(60);
  const [hwDueDate, setHwDueDate] = useState(initialDate || todayStr);
  const [hwDueTime, setHwDueTime] = useState(initialTime || '');
  const [hwPriority, setHwPriority] = useState<Priority>('medium');
  const [hwFocus, setHwFocus] = useState<FocusRequirement>('medium');
  const [hwCanDoAtSchool, setHwCanDoAtSchool] = useState(false);
  const [hwSplittable, setHwSplittable] = useState(true);
  const [hwNotes, setHwNotes] = useState('');

  // Quiz/Test state
  const [testName, setTestName] = useState('');
  const [testSubject, setTestSubject] = useState('');
  const [testType, setTestType] = useState<AssessmentType>('test');
  const [testDate, setTestDate] = useState(initialDate || todayStr);
  const [testTime, setTestTime] = useState(initialTime || '09:00');
  const [testStudyMinutes, setTestStudyMinutes] = useState(120);
  const [testPriority, setTestPriority] = useState<Priority>('high');
  const [testNotes, setTestNotes] = useState('');

  // Goal state
  const [goalName, setGoalName] = useState('');
  const [goalSubject, setGoalSubject] = useState('');
  const [goalTargetMinutes, setGoalTargetMinutes] = useState(300);
  const [goalPriority, setGoalPriority] = useState<Priority>('high');
  const [goalFocus, setGoalFocus] = useState<FocusRequirement>('high');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [goalNotes, setGoalNotes] = useState('');

  // Event state
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState(initialStartTime || new Date().toISOString());
  const [eventEnd, setEventEnd] = useState(initialEndTime || new Date().toISOString());
  const [eventNotes, setEventNotes] = useState('');

  // Initialize values when editing
  useEffect(() => {
    if (editHomework) {
      setHwName(editHomework.name);
      setHwSubject(editHomework.subject);
      setHwDuration(editHomework.estimatedDuration);
      setHwDueDate(editHomework.dueDate);
      setHwDueTime(editHomework.dueTime || '');
      setHwPriority(editHomework.priority);
      setHwFocus(editHomework.focusRequirement);
      setHwCanDoAtSchool(editHomework.canDoAtSchool);
      setHwSplittable(editHomework.splittable);
      setHwNotes(editHomework.notes || '');
    } else {
      setHwName('');
      setHwSubject('');
      setHwDuration(60);
      setHwDueDate(initialDate || todayStr);
      setHwDueTime(initialTime || '');
      setHwPriority('medium');
      setHwFocus('medium');
      setHwCanDoAtSchool(false);
      setHwSplittable(true);
      setHwNotes('');
    }
  }, [editHomework, initialDate, initialTime, todayStr]);

  useEffect(() => {
    if (editQuizTest) {
      setTestName(editQuizTest.name);
      setTestSubject(editQuizTest.subject);
      setTestType(editQuizTest.type);
      setTestDate(editQuizTest.assessmentDate);
      setTestTime(editQuizTest.assessmentTime || '09:00');
      setTestStudyMinutes(editQuizTest.studyMinutesRequired);
      setTestPriority(editQuizTest.priority);
      setTestNotes(editQuizTest.notes || '');
    } else {
      setTestName('');
      setTestSubject('');
      setTestType('test');
      setTestDate(initialDate || todayStr);
      setTestTime(initialTime || '09:00');
      setTestStudyMinutes(120);
      setTestPriority('high');
      setTestNotes('');
    }
  }, [editQuizTest, initialDate, initialTime, todayStr]);

  useEffect(() => {
    if (editGoal) {
      setGoalName(editGoal.name);
      setGoalSubject(editGoal.subject || '');
      setGoalTargetMinutes(editGoal.weeklyTargetMinutes);
      setGoalPriority(editGoal.priority);
      setGoalFocus(editGoal.focusRequirement);
      setGoalDeadline(editGoal.deadline || '');
      setGoalNotes(editGoal.notes || '');
    } else {
      setGoalName('');
      setGoalSubject('');
      setGoalTargetMinutes(300);
      setGoalPriority('high');
      setGoalFocus('high');
      setGoalDeadline('');
      setGoalNotes('');
    }
  }, [editGoal]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'homework') {
      if (editHomework) {
        updateHomework(editHomework.id, {
          name: hwName,
          subject: hwSubject || 'General',
          estimatedDuration: hwDuration,
          dueDate: hwDueDate,
          dueTime: hwDueTime || undefined,
          priority: hwPriority,
          focusRequirement: hwFocus,
          canDoAtSchool: hwCanDoAtSchool,
          splittable: hwSplittable,
          notes: hwNotes,
        });
      } else {
        addHomework({
          name: hwName,
          subject: hwSubject || 'General',
          estimatedDuration: hwDuration,
          dueDate: hwDueDate,
          dueTime: hwDueTime || undefined,
          priority: hwPriority,
          focusRequirement: hwFocus,
          canDoAtSchool: hwCanDoAtSchool,
          splittable: hwSplittable,
          notes: hwNotes,
          completed: false,
        });
      }
    } else if (mode === 'quiz_test') {
      if (editQuizTest) {
        updateQuizTest(editQuizTest.id, {
          name: testName,
          subject: testSubject || 'General',
          type: testType,
          assessmentDate: testDate,
          assessmentTime: testTime,
          studyMinutesRequired: testStudyMinutes,
          priority: testPriority,
          notes: testNotes,
        });
      } else {
        addQuizTest({
          name: testName,
          subject: testSubject || 'General',
          type: testType,
          assessmentDate: testDate,
          assessmentTime: testTime,
          studyMinutesRequired: testStudyMinutes,
          priority: testPriority,
          notes: testNotes,
          completed: false,
        });
      }
    } else if (mode === 'goal') {
      if (editGoal) {
        updateGoal(editGoal.id, {
          name: goalName,
          subject: goalSubject || undefined,
          weeklyTargetMinutes: goalTargetMinutes,
          priority: goalPriority,
          focusRequirement: goalFocus,
          deadline: goalDeadline || undefined,
          notes: goalNotes,
        });
      } else {
        addGoal({
          name: goalName,
          subject: goalSubject || undefined,
          weeklyTargetMinutes: goalTargetMinutes,
          priority: goalPriority,
          focusRequirement: goalFocus,
          deadline: goalDeadline || undefined,
          notes: goalNotes,
        });
      }
    } else if (mode === 'event') {
      addFixedEvent({
        title: eventTitle || 'Calendar Event',
        startTime: eventStart,
        endTime: eventEnd,
        type: 'fixed',
        notes: eventNotes,
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2">
            {mode === 'homework' && (
              <div className="p-1.5 rounded bg-blue-100 text-blue-700">
                <BookOpen className="w-4 h-4" />
              </div>
            )}
            {mode === 'quiz_test' && (
              <div className="p-1.5 rounded bg-purple-100 text-purple-700">
                <FileCheck className="w-4 h-4" />
              </div>
            )}
            {mode === 'goal' && (
              <div className="p-1.5 rounded bg-amber-100 text-amber-700">
                <Target className="w-4 h-4" />
              </div>
            )}
            {mode === 'event' && (
              <div className="p-1.5 rounded bg-stone-100 text-stone-700">
                <CalendarIcon className="w-4 h-4" />
              </div>
            )}
            <h2 className="text-base font-semibold text-stone-900">
              {mode === 'homework' && (editHomework ? 'Edit Homework' : 'Create Homework')}
              {mode === 'quiz_test' && (editQuizTest ? 'Edit Assessment' : 'Create Quiz / Test')}
              {mode === 'goal' && (editGoal ? 'Edit Goal' : 'Create Weekly Goal')}
              {mode === 'event' && 'Create Calendar Event'}
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

        <form onSubmit={handleSubmit} className="py-4 space-y-4 text-xs text-stone-700">
          {/* HOMEWORK FORM */}
          {mode === 'homework' && (
            <>
              <div>
                <label className="block font-medium text-stone-700 mb-1">Assignment Name</label>
                <input
                  type="text"
                  value={hwName}
                  onChange={(e) => setHwName(e.target.value)}
                  placeholder="e.g. Chemistry Lab Report"
                  required
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Subject / Class</label>
                  <input
                    type="text"
                    value={hwSubject}
                    onChange={(e) => setHwSubject(e.target.value)}
                    placeholder="e.g. Chemistry, AP Lang"
                    required
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-stone-700 mb-1">
                    Estimated Duration (mins)
                  </label>
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={hwDuration}
                    onChange={(e) => setHwDuration(Number(e.target.value))}
                    required
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={hwDueDate}
                    onChange={(e) => setHwDueDate(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Optional Due Time</label>
                  <input
                    type="time"
                    value={hwDueTime}
                    onChange={(e) => setHwDueTime(e.target.value)}
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Priority</label>
                  <select
                    value={hwPriority}
                    onChange={(e) => setHwPriority(e.target.value as Priority)}
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs bg-white"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Focus Level</label>
                  <select
                    value={hwFocus}
                    onChange={(e) => setHwFocus(e.target.value as FocusRequirement)}
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs bg-white"
                  >
                    <option value="low">Low (Light review, routine)</option>
                    <option value="medium">Medium (Standard homework)</option>
                    <option value="high">High (Deep thinking, lab, essay)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hwCanDoAtSchool}
                    onChange={(e) => setHwCanDoAtSchool(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-semibold text-stone-800">Can do at school</span>
                    <p className="text-[11px] text-stone-500">
                      Eligible to be scheduled into school free periods / study halls.
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer pt-1 border-t border-stone-200">
                  <input
                    type="checkbox"
                    checked={hwSplittable}
                    onChange={(e) => setHwSplittable(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-semibold text-stone-800">Allow multi-day splitting</span>
                    <p className="text-[11px] text-stone-500">
                      Enables the scheduler to distribute across multiple calendar sessions.
                    </p>
                  </div>
                </label>
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">Notes</label>
                <textarea
                  value={hwNotes}
                  onChange={(e) => setHwNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional details, chapters, or guidelines..."
                  className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                />
              </div>
            </>
          )}

          {/* QUIZ / TEST FORM */}
          {mode === 'quiz_test' && (
            <>
              <div>
                <label className="block font-medium text-stone-700 mb-1">Assessment Name</label>
                <input
                  type="text"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  placeholder="e.g. Physics Unit 3 Test"
                  required
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Subject / Class</label>
                  <input
                    type="text"
                    value={testSubject}
                    onChange={(e) => setTestSubject(e.target.value)}
                    placeholder="e.g. Physics"
                    required
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Type</label>
                  <select
                    value={testType}
                    onChange={(e) => setTestType(e.target.value as AssessmentType)}
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs bg-white"
                  >
                    <option value="test">Test / Exam</option>
                    <option value="quiz">Quiz</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Assessment Date</label>
                  <input
                    type="date"
                    value={testDate}
                    onChange={(e) => setTestDate(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Time of Exam</label>
                  <input
                    type="time"
                    value={testTime}
                    onChange={(e) => setTestTime(e.target.value)}
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-stone-700 mb-1">
                    Total Study Minutes Required
                  </label>
                  <input
                    type="number"
                    min={30}
                    step={30}
                    value={testStudyMinutes}
                    onChange={(e) => setTestStudyMinutes(Number(e.target.value))}
                    required
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Priority</label>
                  <select
                    value={testPriority}
                    onChange={(e) => setTestPriority(e.target.value as Priority)}
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs bg-white"
                  >
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-lg text-[11px] text-purple-900 leading-relaxed">
                <span className="font-semibold">Linked Study Task:</span> Saving this automatically
                creates a linked work item{' '}
                <span className="font-semibold">"Study: {testName || 'Assessment'}"</span> for{' '}
                {testStudyMinutes} minutes. The scheduler will schedule study time strictly BEFORE the
                test!
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">Notes / Topics</label>
                <textarea
                  value={testNotes}
                  onChange={(e) => setTestNotes(e.target.value)}
                  rows={2}
                  placeholder="Exam topics or room number..."
                  className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                />
              </div>
            </>
          )}

          {/* GOAL FORM */}
          {mode === 'goal' && (
            <>
              <div>
                <label className="block font-medium text-stone-700 mb-1">Goal Name</label>
                <input
                  type="text"
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  placeholder="e.g. USACO Practice, PSAT Prep, AMC"
                  required
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-stone-700 mb-1">
                    Weekly Target (minutes)
                  </label>
                  <input
                    type="number"
                    min={30}
                    step={30}
                    value={goalTargetMinutes}
                    onChange={(e) => setGoalTargetMinutes(Number(e.target.value))}
                    required
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                  />
                  <span className="text-[10px] text-stone-500">
                    ({(goalTargetMinutes / 60).toFixed(1)} hours per week)
                  </span>
                </div>
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={goalSubject}
                    onChange={(e) => setGoalSubject(e.target.value)}
                    placeholder="e.g. Computer Science, Math"
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Priority</label>
                  <select
                    value={goalPriority}
                    onChange={(e) => setGoalPriority(e.target.value as Priority)}
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs bg-white"
                  >
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Focus Requirement</label>
                  <select
                    value={goalFocus}
                    onChange={(e) => setGoalFocus(e.target.value as FocusRequirement)}
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs bg-white"
                  >
                    <option value="high">High (Deep uninterrupted sessions)</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">Optional Deadline</label>
                <input
                  type="date"
                  value={goalDeadline}
                  onChange={(e) => setGoalDeadline(e.target.value)}
                  className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">Notes</label>
                <textarea
                  value={goalNotes}
                  onChange={(e) => setGoalNotes(e.target.value)}
                  rows={2}
                  placeholder="Focus topics, resource links, etc."
                  className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                />
              </div>
            </>
          )}

          {/* FIXED EVENT FORM */}
          {mode === 'event' && (
            <>
              <div>
                <label className="block font-medium text-stone-700 mb-1">Event Title</label>
                <input
                  type="text"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="e.g. Soccer Practice, Doctor, Piano Lesson"
                  required
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Start Time (ISO)</label>
                  <input
                    type="datetime-local"
                    value={eventStart.slice(0, 16)}
                    onChange={(e) => setEventStart(new Date(e.target.value).toISOString())}
                    required
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-stone-700 mb-1">End Time (ISO)</label>
                  <input
                    type="datetime-local"
                    value={eventEnd.slice(0, 16)}
                    onChange={(e) => setEventEnd(new Date(e.target.value).toISOString())}
                    required
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                  placeholder="Location or equipment"
                  className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                />
              </div>
            </>
          )}

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
              className="px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
