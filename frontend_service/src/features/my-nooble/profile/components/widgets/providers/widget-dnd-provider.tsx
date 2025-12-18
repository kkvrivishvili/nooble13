// src/features/my-nooble/profile/components/widgets/providers/widget-dnd-provider.tsx
import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  restrictToVerticalAxis,
  restrictToWindowEdges,
} from '@dnd-kit/modifiers';
import { BaseWidget } from '@/types/widget';
import { WidgetOverlay } from '../common/widget-overlay';

interface WidgetDndProviderProps {
  widgets: BaseWidget[];
  widgetsData: Map<string, any>; // Map de widget.id -> data
  onReorderWidgets: (widgets: BaseWidget[]) => Promise<void>;
  children: React.ReactNode;
}

export function WidgetDndProvider({ 
  widgets, 
  widgetsData,
  onReorderWidgets, 
  children 
}: WidgetDndProviderProps) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  // Configure sensors for different input types
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Prevents accidental drags
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = widgets.findIndex(w => w.id === active.id);
      const newIndex = widgets.findIndex(w => w.id === over.id);
      
      const reorderedWidgets = arrayMove(widgets, oldIndex, newIndex);
      
      // Update positions
      const updatedWidgets = reorderedWidgets.map((widget, index) => ({
        ...widget,
        position: index
      }));
      
      await onReorderWidgets(updatedWidgets);
    }
    
    setActiveId(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  // Find the active widget and its data for the overlay
  const activeWidget = activeId ? widgets.find(w => w.id === activeId) : null;
  const activeWidgetData = activeWidget ? widgetsData.get(activeWidget.id) : null;

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
    >
      <SortableContext 
        items={widgets.map(w => w.id)} 
        strategy={verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
      
      <DragOverlay>
        {activeWidget && activeWidgetData ? (
          <WidgetOverlay widget={activeWidget} data={activeWidgetData} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}