import type { HTMLAttributes } from "react";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { useDndContext } from "@dnd-kit/core";
import type { CategoryWithMemos, Memo } from "../../types";
import { CategoryCard } from "./CategoryCard";

type Props = {
  item: CategoryWithMemos;
  disabled?: boolean;
  onToggleCollapse: () => void;
  onCreateMemo: () => void;
  onOpenSettings: () => void;
  onDelete: () => void;
  onOpenMemo: (memo: Memo) => void;
  onDeleteMemo: (memo: Memo) => void;
};

export function SortableCategoryCard(props: Props) {
  const id = `cat:${props.item.category.id}`;
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
    isOver,
  } =
    useSortable({ id, disabled: props.disabled });
  const { active } = useDndContext();
  const isCategoryDragging = typeof active?.id === "string" && active.id.startsWith("cat:");

  const style: React.CSSProperties = {
    // DragOverlay를 쓰므로, 드래그 중에는 원본 아이템은 자리 고정(placeholder)시키고
    // Overlay만 이동하게 해서 "복귀 연출"처럼 보이는 잔상을 없앤다.
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.75 : 1,
  };

  const handleProps: HTMLAttributes<HTMLElement> = {
    ...attributes,
    ...listeners,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <CategoryCard
        {...props}
        dragHandleProps={handleProps}
        setDragHandleRef={setActivatorNodeRef}
        dndEnabled={!props.disabled}
        isDraggingCategory={isDragging}
        cardClassName={[
          isDragging ? "isDragging" : "",
          isCategoryDragging && isOver && !isDragging ? "dropTarget" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
    </div>
  );
}


