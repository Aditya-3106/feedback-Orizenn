"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { QUESTION_TYPE_LABELS, type QuestionDefinition } from "@/lib/forms/definitions";
import { cn, truncate } from "@/lib/utils/format";

export function QuestionList({
  questions,
  selectedId,
  onSelect,
  onReorder,
  disabled,
}: {
  questions: QuestionDefinition[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  disabled?: boolean;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = questions.map((q) => q.id);

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    onReorder(arrayMove(ids, from, to));
  }

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    onReorder(arrayMove(ids, i, j));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="space-y-1" aria-label="Questions">
          {questions.map((q, i) => (
            <SortableItem key={q.id} question={q} index={i} selected={q.id === selectedId} onSelect={() => onSelect(q.id)} onMove={(d) => move(i, d)} isFirst={i === 0} isLast={i === questions.length - 1} disabled={disabled} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  question,
  index,
  selected,
  onSelect,
  onMove,
  isFirst,
  isLast,
  disabled,
}: {
  question: QuestionDefinition;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: question.id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-2 rounded-lg border px-2 py-2",
        selected ? "border-orizenn-blue bg-orizenn-blue-soft/40" : "border-transparent hover:border-orizenn-border hover:bg-orizenn-bg",
        isDragging && "opacity-70 shadow-lg",
      )}
    >
      <button type="button" className="cursor-grab touch-none text-orizenn-subtle hover:text-orizenn-ink" aria-label={`Drag to reorder question ${index + 1}`} {...attributes} {...listeners} disabled={disabled}>
        ⋮⋮
      </button>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left" aria-current={selected ? "true" : undefined}>
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] text-orizenn-subtle">{String(index + 1).padStart(2, "0")}</span>
          <span className={cn("min-w-0 flex-1 truncate text-sm", selected ? "font-medium text-orizenn-ink" : "text-orizenn-ink")}>{truncate(question.text, 60) || <em className="text-orizenn-subtle">Untitled question</em>}</span>
        </span>
        <span className="mt-0.5 block pl-6 text-[11px] text-orizenn-subtle">
          {QUESTION_TYPE_LABELS[question.type]}
          {question.required ? " · required" : ""}
          {question.category ? ` · ${question.category}` : ""}
        </span>
      </button>
      <span className="flex flex-col opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <button type="button" className="text-[10px] leading-none text-orizenn-subtle hover:text-orizenn-ink disabled:opacity-30" onClick={() => onMove(-1)} disabled={isFirst || disabled} aria-label={`Move question ${index + 1} up`}>
          ▲
        </button>
        <button type="button" className="text-[10px] leading-none text-orizenn-subtle hover:text-orizenn-ink disabled:opacity-30" onClick={() => onMove(1)} disabled={isLast || disabled} aria-label={`Move question ${index + 1} down`}>
          ▼
        </button>
      </span>
    </li>
  );
}
