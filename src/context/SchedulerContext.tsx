import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  HomeworkItem,
  QuizTestItem,
  GoalItem,
  FixedEventItem,
  ScheduleBlock,
  UserScheduleSettings,
  ScheduleWarning,
} from '../types';
import {
  initialHomework,
  initialQuizzesAndTests,
  initialGoals,
  initialFixedEvents,
  initialScheduleBlocks,
  initialSettings,
} from '../data/initialData';
import { runScheduler, SchedulerOutput } from '../scheduler/engine';
import { isInLocalWeek } from '../utils/dateUtils';

interface SchedulerContextType {
  activeTab: 'calendar' | 'work';
  setActiveTab: (tab: 'calendar' | 'work') => void;
  homework: (HomeworkItem & { scheduledFutureMinutes?: number })[];
  quizzesAndTests: QuizTestItem[];
  goals: (GoalItem & { scheduledFutureMinutes?: number })[];
  fixedEvents: FixedEventItem[];
  scheduleBlocks: ScheduleBlock[];
  settings: UserScheduleSettings;
  updateSettings: (newSettings: Partial<UserScheduleSettings>) => void;
  
  // Work CRUD
  addHomework: (item: Omit<HomeworkItem, 'id' | 'createdAt' | 'remainingDuration'> & { remainingDuration?: number }) => HomeworkItem;
  updateHomework: (id: string, updates: Partial<HomeworkItem>) => void;
  deleteHomework: (id: string) => void;
  toggleHomeworkCompleted: (id: string) => void;

  addQuizTest: (item: Omit<QuizTestItem, 'id' | 'createdAt' | 'linkedStudyHomeworkId'>) => QuizTestItem;
  updateQuizTest: (id: string, updates: Partial<QuizTestItem>) => void;
  deleteQuizTest: (id: string) => void;
  toggleQuizTestCompleted: (id: string) => void;

  addGoal: (item: Omit<GoalItem, 'id' | 'createdAt' | 'minutesCompletedThisWeek'>) => GoalItem;
  updateGoal: (id: string, updates: Partial<GoalItem>) => void;
  deleteGoal: (id: string) => void;

  addFixedEvent: (item: Omit<FixedEventItem, 'id'>) => FixedEventItem;
  updateFixedEvent: (id: string, updates: Partial<FixedEventItem>) => void;
  deleteFixedEvent: (id: string) => void;

  // Calendar Block Operations
  scheduleExistingWork: (
    workType: 'homework' | 'study' | 'goal',
    workId: string,
    startTime: string,
    durationMinutes: number,
    notes?: string
  ) => ScheduleBlock;
  updateScheduleBlock: (id: string, updates: Partial<ScheduleBlock>) => void;
  deleteScheduleBlock: (id: string) => void; // Only removes calendar block, never underlying work!
  toggleBlockCompleted: (id: string) => void;

  // AI Schedule action & warnings
  isScheduling: boolean;
  lastScheduleResult: SchedulerOutput['summary'] | null;
  scheduleWarnings: ScheduleWarning[];
  dismissWarning: (id: string) => void;
  triggerAiSchedule: () => Promise<SchedulerOutput['summary']>;
  resetToDefaults: () => void;
}

const SchedulerContext = createContext<SchedulerContextType | null>(null);

const STORAGE_KEY = 'academic_scheduler_state_v1';

export const SchedulerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<'calendar' | 'work'>('calendar');

  // Load initial state from localStorage if available
  const [homework, setHomework] = useState<HomeworkItem[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_homework`);
      return saved ? JSON.parse(saved) : initialHomework;
    } catch {
      return initialHomework;
    }
  });

  const [quizzesAndTests, setQuizzesAndTests] = useState<QuizTestItem[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_quizzes`);
      return saved ? JSON.parse(saved) : initialQuizzesAndTests;
    } catch {
      return initialQuizzesAndTests;
    }
  });

  const [goals, setGoals] = useState<GoalItem[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_goals`);
      return saved ? JSON.parse(saved) : initialGoals;
    } catch {
      return initialGoals;
    }
  });

  const [fixedEvents, setFixedEvents] = useState<FixedEventItem[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_fixed_events`);
      return saved ? JSON.parse(saved) : initialFixedEvents;
    } catch {
      return initialFixedEvents;
    }
  });

  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_blocks`);
      return saved ? JSON.parse(saved) : initialScheduleBlocks;
    } catch {
      return initialScheduleBlocks;
    }
  });

  const [settings, setSettings] = useState<UserScheduleSettings>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_settings`);
      return saved ? JSON.parse(saved) : initialSettings;
    } catch {
      return initialSettings;
    }
  });

  const [isScheduling, setIsScheduling] = useState(false);
  const [lastScheduleResult, setLastScheduleResult] = useState<SchedulerOutput['summary'] | null>(null);
  const [scheduleWarnings, setScheduleWarnings] = useState<ScheduleWarning[]>([]);

  // Persistence to localStorage
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_homework`, JSON.stringify(homework));
  }, [homework]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_quizzes`, JSON.stringify(quizzesAndTests));
  }, [quizzesAndTests]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_goals`, JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_fixed_events`, JSON.stringify(fixedEvents));
  }, [fixedEvents]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_blocks`, JSON.stringify(scheduleBlocks));
  }, [scheduleBlocks]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_settings`, JSON.stringify(settings));
  }, [settings]);

  // Separate "scheduled" from "completed":
  // A future block reserves time, but does NOT prematurely mark work as completed!
  // Completed minutes strictly reflect blocks marked as completed or actual logged progress.
  const enrichedHomework = useMemo(() => {
    const now = new Date();
    return homework.map((hw) => {
      const hwBlocks = scheduleBlocks.filter((b) => b.workId === hw.id);
      const completedBlockMins = hw.completed
        ? hw.estimatedDuration
        : hwBlocks.reduce((sum, b) => {
            if (b.completed) {
              return sum + (b.actualMinutesCompleted !== undefined ? b.actualMinutesCompleted : b.durationMinutes);
            }
            return sum + (b.actualMinutesCompleted || 0);
          }, 0);

      const scheduledFutureMinutes = hwBlocks
        .filter((b) => !b.completed && new Date(b.endTime) > now)
        .reduce((sum, b) => {
          const worked = b.actualMinutesCompleted || 0;
          return sum + Math.max(0, b.durationMinutes - worked);
        }, 0);

      const remaining = hw.completed ? 0 : Math.max(0, hw.estimatedDuration - completedBlockMins);

      return {
        ...hw,
        remainingDuration: remaining,
        scheduledFutureMinutes,
      };
    });
  }, [homework, scheduleBlocks]);

  // Compute minutes completed this week for goals based purely on completed schedule blocks or logged minutes within the current week
  const enrichedGoals = useMemo(() => {
    const now = new Date();
    return goals.map((g) => {
      const goalBlocks = scheduleBlocks.filter((b) => b.workId === g.id);
      const completedBlockMins = goalBlocks
        .filter((b) => isInLocalWeek(b.startTime, now))
        .reduce((sum, b) => {
          if (b.completed) {
            return sum + (b.actualMinutesCompleted !== undefined ? b.actualMinutesCompleted : b.durationMinutes);
          }
          return sum + (b.actualMinutesCompleted || 0);
        }, 0);

      const scheduledFutureMinutes = goalBlocks
        .filter((b) => !b.completed && new Date(b.endTime) > now && isInLocalWeek(b.startTime, now))
        .reduce((sum, b) => {
          const worked = b.actualMinutesCompleted || 0;
          return sum + Math.max(0, b.durationMinutes - worked);
        }, 0);

      return {
        ...g,
        minutesCompletedThisWeek: completedBlockMins,
        scheduledFutureMinutes,
      };
    });
  }, [goals, scheduleBlocks]);

  const updateSettings = (newSettings: Partial<UserScheduleSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const dismissWarning = (id: string) => {
    setScheduleWarnings((prev) => prev.filter((w) => w.id !== id));
  };

  // --- Homework Actions ---
  const addHomework = (item: Omit<HomeworkItem, 'id' | 'createdAt' | 'remainingDuration'> & { remainingDuration?: number }) => {
    const newId = `hw-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newItem: HomeworkItem = {
      ...item,
      id: newId,
      remainingDuration: item.remainingDuration ?? item.estimatedDuration,
      createdAt: new Date().toISOString(),
    };
    setHomework((prev) => [newItem, ...prev]);
    return newItem;
  };

  const updateHomework = (id: string, updates: Partial<HomeworkItem>) => {
    setHomework((prev) =>
      prev.map((hw) => (hw.id === id ? { ...hw, ...updates } : hw))
    );
    // If name or subject changed, also sync associated schedule blocks
    if (updates.name || updates.subject) {
      setScheduleBlocks((prev) =>
        prev.map((b) => {
          if (b.workId === id) {
            return {
              ...b,
              title: updates.name || b.title,
              subject: updates.subject !== undefined ? updates.subject : b.subject,
            };
          }
          return b;
        })
      );
    }
  };

  const deleteHomework = (id: string) => {
    setHomework((prev) => prev.filter((hw) => hw.id !== id));
    // Remove associated schedule blocks
    setScheduleBlocks((prev) => prev.filter((b) => b.workId !== id));
  };

  const toggleHomeworkCompleted = (id: string) => {
    setHomework((prev) =>
      prev.map((hw) => {
        if (hw.id === id) {
          const newStatus = !hw.completed;
          return { ...hw, completed: newStatus };
        }
        return hw;
      })
    );
  };

  // --- Quiz / Test Actions ---
  const addQuizTest = (item: Omit<QuizTestItem, 'id' | 'createdAt' | 'linkedStudyHomeworkId'>) => {
    const testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const studyHwId = `hw-study-${testId}`;

    // 1. Automatically create linked study work item:
    // "Study: [Assessment Name]" with requested total study time
    const studyHw: HomeworkItem = {
      id: studyHwId,
      name: `Study: ${item.name}`,
      subject: item.subject,
      estimatedDuration: item.studyMinutesRequired,
      remainingDuration: item.studyMinutesRequired,
      dueDate: item.assessmentDate,
      dueTime: item.assessmentTime || '09:00',
      priority: item.priority,
      focusRequirement: 'high',
      canDoAtSchool: false,
      splittable: item.studyMinutesRequired > 60,
      notes: `Study prep for ${item.type === 'quiz' ? 'Quiz' : 'Test'}: ${item.name}`,
      completed: false,
      linkedTestId: testId,
      createdAt: new Date().toISOString(),
    };

    const newTest: QuizTestItem = {
      ...item,
      id: testId,
      linkedStudyHomeworkId: studyHwId,
      createdAt: new Date().toISOString(),
    };

    setHomework((prev) => [studyHw, ...prev]);
    setQuizzesAndTests((prev) => [newTest, ...prev]);
    return newTest;
  };

  const updateQuizTest = (id: string, updates: Partial<QuizTestItem>) => {
    setQuizzesAndTests((prev) =>
      prev.map((qt) => {
        if (qt.id === id) {
          const updated = { ...qt, ...updates };

          // Sync linked study homework if exists without creating duplicates
          if (qt.linkedStudyHomeworkId) {
            setHomework((hwList) =>
              hwList.map((hw) => {
                if (hw.id === qt.linkedStudyHomeworkId) {
                  return {
                    ...hw,
                    name: updates.name ? `Study: ${updates.name}` : hw.name,
                    subject: updates.subject ?? hw.subject,
                    dueDate: updates.assessmentDate ?? hw.dueDate,
                    dueTime: updates.assessmentTime ?? hw.dueTime,
                    estimatedDuration: updates.studyMinutesRequired ?? hw.estimatedDuration,
                    priority: updates.priority ?? hw.priority,
                  };
                }
                return hw;
              })
            );
          }

          return updated;
        }
        return qt;
      })
    );
  };

  const deleteQuizTest = (id: string) => {
    const test = quizzesAndTests.find((t) => t.id === id);
    if (test && test.linkedStudyHomeworkId) {
      deleteHomework(test.linkedStudyHomeworkId);
    }
    setQuizzesAndTests((prev) => prev.filter((qt) => qt.id !== id));
  };

  const toggleQuizTestCompleted = (id: string) => {
    setQuizzesAndTests((prev) =>
      prev.map((qt) => (qt.id === id ? { ...qt, completed: !qt.completed } : qt))
    );
  };

  // --- Goal Actions ---
  const addGoal = (item: Omit<GoalItem, 'id' | 'createdAt' | 'minutesCompletedThisWeek'>) => {
    const newId = `goal-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newGoal: GoalItem = {
      ...item,
      id: newId,
      minutesCompletedThisWeek: 0,
      createdAt: new Date().toISOString(),
    };
    setGoals((prev) => [newGoal, ...prev]);
    return newGoal;
  };

  const updateGoal = (id: string, updates: Partial<GoalItem>) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...updates } : g))
    );
    if (updates.name || updates.subject) {
      setScheduleBlocks((prev) =>
        prev.map((b) => {
          if (b.workId === id) {
            return {
              ...b,
              title: updates.name || b.title,
              subject: updates.subject !== undefined ? updates.subject : b.subject,
            };
          }
          return b;
        })
      );
    }
  };

  const deleteGoal = (id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    setScheduleBlocks((prev) => prev.filter((b) => b.workId !== id));
  };

  // --- Fixed Event Actions ---
  const addFixedEvent = (item: Omit<FixedEventItem, 'id'>) => {
    const newId = `event-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newEvent: FixedEventItem = { ...item, id: newId };
    setFixedEvents((prev) => [newEvent, ...prev]);
    return newEvent;
  };

  const updateFixedEvent = (id: string, updates: Partial<FixedEventItem>) => {
    setFixedEvents((prev) =>
      prev.map((fe) => (fe.id === id ? { ...fe, ...updates } : fe))
    );
  };

  const deleteFixedEvent = (id: string) => {
    setFixedEvents((prev) => prev.filter((fe) => fe.id !== id));
  };

  // --- Manual Scheduling Actions ---
  const scheduleExistingWork = (
    workType: 'homework' | 'study' | 'goal',
    workId: string,
    startTime: string,
    durationMinutes: number,
    notes?: string
  ) => {
    let title = 'Work Session';
    let subject: string | undefined;

    if (workType === 'homework' || workType === 'study') {
      const hw = enrichedHomework.find((h) => h.id === workId);
      if (hw) {
        title = hw.name;
        subject = hw.subject;
      }
    } else if (workType === 'goal') {
      const g = enrichedGoals.find((goal) => goal.id === workId);
      if (g) {
        title = g.name;
        subject = g.subject;
      }
    }

    const start = new Date(startTime);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    const newBlock: ScheduleBlock = {
      id: `manual-block-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      workType,
      workId,
      title,
      subject,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationMinutes,
      completed: false,
      isManual: true, // manually scheduled by student
      notes,
    };

    setScheduleBlocks((prev) => [...prev, newBlock]);
    return newBlock;
  };

  const updateScheduleBlock = (id: string, updates: Partial<ScheduleBlock>) => {
    setScheduleBlocks((prev) =>
      prev.map((b) => {
        if (b.id === id) {
          const updated = { ...b, ...updates };
          // If startTime or endTime updated, recompute durationMinutes
          if (updates.startTime || updates.endTime) {
            const s = new Date(updated.startTime);
            const e = new Date(updated.endTime);
            updated.durationMinutes = Math.max(15, Math.round((e.getTime() - s.getTime()) / (60 * 1000)));
          }

          // Automatically mark the block completed when actual minutes equal its duration
          if (updated.actualMinutesCompleted !== undefined) {
            if (updated.actualMinutesCompleted >= updated.durationMinutes) {
              updated.completed = true;
              updated.actualMinutesCompleted = updated.durationMinutes;
            } else if (updates.completed === undefined && updates.actualMinutesCompleted !== b.actualMinutesCompleted) {
              // If actual minutes is less than planned duration, it is not fully completed
              updated.completed = false;
            }
          } else if (updated.completed && updated.actualMinutesCompleted === undefined) {
            updated.actualMinutesCompleted = updated.durationMinutes;
          }

          return updated;
        }
        return b;
      })
    );
  };

  const deleteScheduleBlock = (id: string) => {
    // Crucial rule: unscheduling a work block ONLY removes the block!
    // The underlying work item in Work is NEVER deleted.
    setScheduleBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const toggleBlockCompleted = (id: string) => {
    setScheduleBlocks((prev) =>
      prev.map((b) => {
        if (b.id === id) {
          const willBeCompleted = !b.completed;
          return {
            ...b,
            completed: willBeCompleted,
            actualMinutesCompleted: willBeCompleted ? b.durationMinutes : 0,
          };
        }
        return b;
      })
    );
  };

  // --- AI Scheduling Trigger ---
  const triggerAiSchedule = async () => {
    setIsScheduling(true);
    // Simulate brief processing state for tactile UX
    await new Promise((r) => setTimeout(r, 450));

    const result = runScheduler({
      homework: enrichedHomework,
      quizzesAndTests,
      goals: enrichedGoals,
      fixedEvents,
      existingBlocks: scheduleBlocks,
      settings,
      currentTime: new Date(),
      horizonDays: 14,
    });

    setScheduleBlocks(result.scheduledBlocks);
    setLastScheduleResult(result.summary);
    setScheduleWarnings(result.warnings);
    setIsScheduling(false);
    return result.summary;
  };

  const resetToDefaults = () => {
    setHomework(initialHomework);
    setQuizzesAndTests(initialQuizzesAndTests);
    setGoals(initialGoals);
    setFixedEvents(initialFixedEvents);
    setScheduleBlocks(initialScheduleBlocks);
    setSettings(initialSettings);
    setScheduleWarnings([]);
    localStorage.clear();
  };

  return (
    <SchedulerContext.Provider
      value={{
        activeTab,
        setActiveTab,
        homework: enrichedHomework,
        quizzesAndTests,
        goals: enrichedGoals,
        fixedEvents,
        scheduleBlocks,
        settings,
        updateSettings,

        addHomework,
        updateHomework,
        deleteHomework,
        toggleHomeworkCompleted,

        addQuizTest,
        updateQuizTest,
        deleteQuizTest,
        toggleQuizTestCompleted,

        addGoal,
        updateGoal,
        deleteGoal,

        addFixedEvent,
        updateFixedEvent,
        deleteFixedEvent,

        scheduleExistingWork,
        updateScheduleBlock,
        deleteScheduleBlock,
        toggleBlockCompleted,

        isScheduling,
        lastScheduleResult,
        scheduleWarnings,
        dismissWarning,
        triggerAiSchedule,
        resetToDefaults,
      }}
    >
      {children}
    </SchedulerContext.Provider>
  );
};

export const useScheduler = () => {
  const context = useContext(SchedulerContext);
  if (!context) {
    throw new Error('useScheduler must be used within a SchedulerProvider');
  }
  return context;
};
