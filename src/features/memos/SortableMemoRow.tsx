import { Trash2 } from "lucide-react";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { useDndContext } from "@dnd-kit/core";
import type { Memo } from "../../types";
import { formatYmdShort } from "../../lib/date";

type Props = {
  memo: Memo;
  isTodo?: boolean;
  onToggleTodo?: (next: boolean) => void;
  disabled?: boolean;
  onOpen: () => void;
  onDelete: () => void;
};

export function SortableMemoRow({ memo, isTodo, onToggleTodo, disabled, onOpen, onDelete }: Props) {
  const id = `memo:${memo.id}`;
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging, isOver } =
    useSortable({
      id,
      disabled,
      data: { memoId: memo.id, categoryId: memo.category_id },
    });
  const { active } = useDndContext();
  const isMemoDragging = typeof active?.id === "string" && active.id.startsWith("memo:");

  const style: React.CSSProperties = {
    // DragOverlay 사용: 드래그 중 원본 아이템은 자리 고정
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      className={`memoListItem ${isDragging ? "isDragging" : ""} ${
        isMemoDragging && isOver && !isDragging ? "dropTarget" : ""
      }`}
      style={style}
    >
      {/* 제목바로 드래그(아이콘 영역 제거) */}
      <button
        className="memoMainBtn"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        onClick={(e) => {
          if (isDragging) {
            e.preventDefault();
            return;
          }
          onOpen();
        }}
        aria-label="메모 열기/드래그"
      >
        {isTodo ? (
          <input
            className="todoCheckbox"
            type="checkbox"
            checked={!!memo.todo_done}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onToggleTodo?.(e.currentTarget.checked)}
            aria-label="Todo 완료"
          />
        ) : memo.emoji?.length ? (
          <span className="memoEmoji">{memo.emoji}</span>
        ) : null}
        <span
          className={`memoTitle ${isTodo && memo.todo_done ? "memoDone" : ""}`}
          style={{ color: isTodo && memo.todo_done ? undefined : memo.color }}
        >
          {memo.title}
        </span>
      </button>

      <div className="memoRight">
        {/* [삭제]는 호버 시에만 */}
        <div className="hoverOnly hoverOnlyMemo row">
          <button className="iconOnlyBtn danger" onClick={onDelete} aria-label="메모 삭제">
            <Trash2 size={18} />
          </button>
        </div>

        {/* [날짜]는 항상 표시 + 우측 정렬 */}
        <div className="memoDateText" title={memo.date_ymd}>
          {formatYmdShort(memo.date_ymd)}
        </div>
      </div>
    </li>
  );
}


