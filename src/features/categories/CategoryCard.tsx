import type { HTMLAttributes } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { CategoryWithMemos, Memo } from "../../types";
import { SortableMemoRow } from "../memos/SortableMemoRow";

type Props = {
  item: CategoryWithMemos;
  onToggleCollapse: () => void;
  onCreateMemo: () => void;
  onOpenSettings: () => void;
  onDelete: () => void;
  onOpenMemo: (memo: Memo) => void;
  onDeleteMemo: (memo: Memo) => void;
  onToggleTodoDone?: (memo: Memo, next: boolean) => void;
  dragHandleProps?: HTMLAttributes<HTMLElement>;
  setDragHandleRef?: (element: HTMLElement | null) => void;
  cardClassName?: string;
  dndEnabled?: boolean;
  isDraggingCategory?: boolean;
};

export function CategoryCard({
  item,
  onToggleCollapse,
  onCreateMemo,
  onOpenSettings,
  onDelete,
  onOpenMemo,
  onDeleteMemo,
  onToggleTodoDone,
  dragHandleProps,
  setDragHandleRef,
  cardClassName,
  dndEnabled = true,
  isDraggingCategory,
}: Props) {
  const { category, memos } = item;
  const collapsed = category.is_collapsed;
  const memoIds = memos
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((m) => `memo:${m.id}`);

  const { active } = useDndContext();
  const isMemoDragging = typeof active?.id === "string" && active.id.startsWith("memo:");

  const { setNodeRef, isOver } = useDroppable({
    id: `catdrop:${category.id}`,
    disabled: !dndEnabled || !isMemoDragging,
  });

  return (
    <div
      ref={setNodeRef}
      className={`categoryCard ${isOver && isMemoDragging ? "over" : ""} ${cardClassName ?? ""}`}
      style={{ borderColor: "rgba(255,255,255,0.12)" }}
    >
      <div className="categoryHeader">
        {/* 제목바(드래그 영역) */}
        <div className="categoryTitleBar">
          <div
            className="categoryTitleDragArea"
            ref={setDragHandleRef}
            {...(dragHandleProps ?? {})}
            aria-label="카테고리 드래그"
          >
            <button
              className="categoryTitleBtn"
              type="button"
              onClick={(e) => {
                // 드래그로 인한 클릭(마우스 업)에서는 편집창이 뜨지 않도록 방지
                if (isDraggingCategory) {
                  e.preventDefault();
                  return;
                }
                onOpenSettings();
              }}
              aria-label="카테고리 제목 편집"
              title={category.title}
            >
              {category.emoji?.length ? <span className="categoryEmoji">{category.emoji}</span> : null}
              <span className="categoryTitleText" style={{ color: category.color }}>
                {category.title}
              </span>
            </button>
          </div>

          {/* 카테고리 기능 아이콘: 제목바 hover에서만 */}
          <div className="categoryActions">
            {/* [접기][삭제]는 호버 시에만 */}
            <div className="hoverOnly hoverOnlyCategory row">
              <button className="iconOnlyBtn" onClick={onToggleCollapse} aria-label="접기/펼치기">
                {collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
              </button>
              <button className="iconOnlyBtn danger" onClick={onDelete} aria-label="카테고리 삭제">
                <Trash2 size={18} />
              </button>
            </div>

            {/* [추가]는 상시 표시 */}
            <button className="iconOnlyBtn categoryAddBtn" onClick={onCreateMemo} aria-label="메모 추가">
              <Plus size={18} />
            </button>
          </div>
        </div>
      </div>

      {collapsed ? null : (
        <div className="categoryBody">
          {memos.length === 0 ? (
            <div className="emptyHint">메모가 없습니다. + 를 눌러 추가하세요.</div>
          ) : (
            <SortableContext items={memoIds} strategy={verticalListSortingStrategy}>
              <ul className="memoList">
                {memos
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((m) => (
                    <SortableMemoRow
                      key={m.id}
                      memo={m}
                      isTodo={category.is_todo}
                      onToggleTodo={(next) => onToggleTodoDone?.(m, next)}
                      disabled={!dndEnabled}
                      onOpen={() => onOpenMemo(m)}
                      onDelete={() => onDeleteMemo(m)}
                    />
                  ))}
              </ul>
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
}


