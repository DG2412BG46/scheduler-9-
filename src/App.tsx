import React, { useState } from 'react';
import { SchedulerProvider, useScheduler } from './context/SchedulerContext';
import { Navbar } from './components/Navbar';
import { CalendarView } from './components/CalendarView';
import { WorkView } from './components/WorkView';
import { SlotActionModal } from './components/Modals/SlotActionModal';
import { EditBlockModal } from './components/Modals/EditBlockModal';
import { WorkItemModal, WorkItemModalMode } from './components/Modals/WorkItemModal';
import { NaturalLanguageModal } from './components/NaturalLanguageModal';
import { ScheduleBlock, FixedEventItem, HomeworkItem, QuizTestItem, GoalItem } from './types';

function MainLayout() {
  const { activeTab } = useScheduler();

  // Natural Language modal state
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  // Calendar slot action modal state
  const [slotModalState, setSlotModalState] = useState<{
    isOpen: boolean;
    date: Date;
    hour: number;
    minute: number;
  }>({
    isOpen: false,
    date: new Date(),
    hour: 9,
    minute: 0,
  });

  // Edit existing calendar item modal state
  const [editBlockState, setEditBlockState] = useState<{
    isOpen: boolean;
    block: ScheduleBlock | null;
    fixedEvent: FixedEventItem | null;
  }>({
    isOpen: false,
    block: null,
    fixedEvent: null,
  });

  // Work item modal state (Homework, Quiz/Test, Goal, Event)
  const [workModalState, setWorkModalState] = useState<{
    isOpen: boolean;
    mode: WorkItemModalMode;
    editHomework?: HomeworkItem | null;
    editQuizTest?: QuizTestItem | null;
    editGoal?: GoalItem | null;
    initialDate?: string;
    initialTime?: string;
    initialStartTime?: string;
    initialEndTime?: string;
  }>({
    isOpen: false,
    mode: 'homework',
  });

  const handleSelectSlot = (date: Date, hour: number, minute: number) => {
    setSlotModalState({
      isOpen: true,
      date,
      hour,
      minute,
    });
  };

  const handleEditBlock = (block: ScheduleBlock) => {
    // Crucial rule: Clicking an existing calendar item edits THAT item! Never duplicate.
    setEditBlockState({
      isOpen: true,
      block,
      fixedEvent: null,
    });
  };

  const handleEditFixedEvent = (event: FixedEventItem) => {
    setEditBlockState({
      isOpen: true,
      block: null,
      fixedEvent: event,
    });
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col font-sans text-stone-900 selection:bg-indigo-100 selection:text-indigo-900">
      <Navbar onOpenQuickAdd={() => setIsQuickAddOpen(true)} />

      <main className="flex-1">
        {activeTab === 'calendar' ? (
          <CalendarView
            onSelectSlot={handleSelectSlot}
            onEditBlock={handleEditBlock}
            onEditFixedEvent={handleEditFixedEvent}
          />
        ) : (
          <WorkView
            onAddHomework={() =>
              setWorkModalState({
                isOpen: true,
                mode: 'homework',
              })
            }
            onAddQuizTest={() =>
              setWorkModalState({
                isOpen: true,
                mode: 'quiz_test',
              })
            }
            onAddGoal={() =>
              setWorkModalState({
                isOpen: true,
                mode: 'goal',
              })
            }
            onEditHomework={(hw) =>
              setWorkModalState({
                isOpen: true,
                mode: 'homework',
                editHomework: hw,
              })
            }
            onEditQuizTest={(qt) =>
              setWorkModalState({
                isOpen: true,
                mode: 'quiz_test',
                editQuizTest: qt,
              })
            }
            onEditGoal={(g) =>
              setWorkModalState({
                isOpen: true,
                mode: 'goal',
                editGoal: g,
              })
            }
          />
        )}
      </main>

      {/* 1. AI Natural Language Modal */}
      <NaturalLanguageModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
      />

      {/* 2. Slot Action Modal (Empty Slot on Calendar) */}
      <SlotActionModal
        isOpen={slotModalState.isOpen}
        onClose={() => setSlotModalState((prev) => ({ ...prev, isOpen: false }))}
        selectedDate={slotModalState.date}
        selectedHour={slotModalState.hour}
        selectedMinute={slotModalState.minute}
        onCreateHomework={(date, time) => {
          setWorkModalState({
            isOpen: true,
            mode: 'homework',
            initialDate: date,
            initialTime: time,
          });
        }}
        onCreateQuizTest={(date, time) => {
          setWorkModalState({
            isOpen: true,
            mode: 'quiz_test',
            initialDate: date,
            initialTime: time,
          });
        }}
        onCreateGoal={() => {
          setWorkModalState({
            isOpen: true,
            mode: 'goal',
          });
        }}
        onCreateEvent={(start, end) => {
          setWorkModalState({
            isOpen: true,
            mode: 'event',
            initialStartTime: start,
            initialEndTime: end,
          });
        }}
      />

      {/* 3. Edit Block Modal (Existing Calendar Block) */}
      <EditBlockModal
        isOpen={editBlockState.isOpen}
        onClose={() =>
          setEditBlockState({
            isOpen: false,
            block: null,
            fixedEvent: null,
          })
        }
        block={editBlockState.block}
        fixedEvent={editBlockState.fixedEvent}
      />

      {/* 4. Work Item Modal (Create/Edit Homework, Quiz/Test, Goal, Event) */}
      <WorkItemModal
        isOpen={workModalState.isOpen}
        onClose={() =>
          setWorkModalState((prev) => ({
            ...prev,
            isOpen: false,
            editHomework: null,
            editQuizTest: null,
            editGoal: null,
          }))
        }
        mode={workModalState.mode}
        editHomework={workModalState.editHomework}
        editQuizTest={workModalState.editQuizTest}
        editGoal={workModalState.editGoal}
        initialDate={workModalState.initialDate}
        initialTime={workModalState.initialTime}
        initialStartTime={workModalState.initialStartTime}
        initialEndTime={workModalState.initialEndTime}
      />
    </div>
  );
}

export default function App() {
  return (
    <SchedulerProvider>
      <MainLayout />
    </SchedulerProvider>
  );
}
