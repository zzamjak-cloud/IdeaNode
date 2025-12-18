import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Palette, Plus, X } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import type { Category, Memo } from "../../types";
import { ColorPicker } from "../../components/ColorPicker";
import { Modal } from "../../components/Modal";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { SortableCategoryCard } from "./SortableCategoryCard";
import { CategorySettingsModal } from "./CategorySettingsModal";
import { CreateCategoryModal } from "./CreateCategoryModal";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export function CategoryGrid() {
  const {
    categories,
    createCategory,
    updateCategory,
    setCategoryCollapsed,
    deleteCategory,
    deleteMemo,
    moveMemo,
    reorderCategories,
    reorderMemos,
    updateMemo,
    settings,
    setBackgroundColorLocal,
    saveBackgroundColor,
  } = useAppStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<Category | null>(null);
  const [query, setQuery] = useState("");
  const [bgOpen, setBgOpen] = useState(false);
  const bgWrapRef = useRef<HTMLDivElement | null>(null);
  const bgDebounceRef = useRef<number | null>(null);

  const [confirm, setConfirm] = useState<
    | null
    | { kind: "category"; id: string; title: string }
    | { kind: "memo"; id: string; title: string }
  >(null);

  useEffect(() => {
    if (!bgOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (bgWrapRef.current && !bgWrapRef.current.contains(t)) setBgOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBgOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [bgOpen]);
  const openMemoWindow = async (url: string, label: string, title: string) => {
    try {
      const existing = await WebviewWindow.getByLabel(label);
      if (existing) {
        await existing.setFocus();
        return;
      }
      new WebviewWindow(label, {
        title,
        width: 900,
        height: 720,
        resizable: true,
        url,
      });
    } catch (e) {
      console.error("memo window open error", e);
      window.alert(`메모 창을 열 수 없습니다.\n${String(e)}`);
    }
  };

  const openMemoEdit = async (memo: Memo) => {
    await openMemoWindow(`/?memo=${encodeURIComponent(memo.id)}`, `memo-${memo.id}`, memo.title || "메모");
  };

  const openMemoCreate = async (categoryId: string, defColor: string) => {
    const label = `memo-new-${categoryId}-${Date.now()}`;
    await openMemoWindow(
      `/?create_category_id=${encodeURIComponent(categoryId)}&default_color=${encodeURIComponent(defColor)}`,
      label,
      "새 메모",
    );
  };

  const filtered = useMemo(() => {
    const visible = categories.filter((c) => !c.category.archived);
    const q = query.trim().toLowerCase();
    if (!q) return visible;

    return visible
      .map((item) => {
        const catMatch = item.category.title.toLowerCase().includes(q);
        const memos = item.memos.filter((m) => m.title.toLowerCase().includes(q));
        if (!catMatch && memos.length === 0) return null;
        return { category: item.category, memos };
      })
      .filter(Boolean) as typeof categories;
  }, [categories, query]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.category.position - b.category.position),
    [filtered],
  );

  const categoryIds = useMemo(() => sorted.map((c) => `cat:${c.category.id}`), [sorted]);
  const dndEnabled = query.trim().length === 0;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 2 },
    }),
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const openArchiveWindow = async () => {
    try {
      const existing = await WebviewWindow.getByLabel("archive");
      if (existing) {
        await existing.setFocus();
        return;
      }
      // SPA이므로 query로 분기
      new WebviewWindow("archive", {
        title: "보관함",
        width: 420,
        height: 720,
        resizable: true,
        url: "/?archive=1",
      });
    } catch (e) {
      // 권한(capability) 문제 등으로 창 생성이 막히면 사용자에게 바로 보이게
      console.error("archive window open error", e);
      window.alert(`보관함 창을 열 수 없습니다.\n${String(e)}`);
    }
  };

  return (
    <div className="page">
      <div className="topBar">
        <div className="searchWrap">
          <input
            className="searchInput"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="검색 (카테고리/메모 제목)"
            aria-label="검색"
          />
          {query.trim().length ? (
            <button
              className="iconOnlyBtn searchClearBtn"
              onClick={() => setQuery("")}
              aria-label="검색어 지우기"
              title="지우기"
              type="button"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
        <div className="topBarRight">
          <button
            className="iconOnlyBtn archiveBtn"
            type="button"
            onClick={openArchiveWindow}
            aria-label="보관함 열기"
            title="보관함"
          >
            <Archive size={18} />
          </button>
          <button className="iconOnlyBtn addBtn" onClick={() => setCreateOpen(true)} aria-label="카테고리 추가">
            <Plus size={18} />
          </button>
          <div className="colorMenuWrap" ref={bgWrapRef}>
            <button
              className="iconOnlyBtn"
              type="button"
              onClick={() => setBgOpen((v) => !v)}
              aria-label="배경 컬러 설정"
              title="배경 컬러"
            >
              <Palette size={18} />
            </button>
            {bgOpen ? (
              <div className="popover">
                <ColorPicker
                  value={settings.background_color?.trim().length ? settings.background_color : "#0b1020"}
                  onChange={(next) => {
                    // 미리보기는 즉시(로컬 상태만), 저장은 0.5s 디바운스
                    setBackgroundColorLocal(next);
                    if (bgDebounceRef.current) window.clearTimeout(bgDebounceRef.current);
                    bgDebounceRef.current = window.setTimeout(() => {
                      saveBackgroundColor({ background_color: next });
                    }, 500);
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="emptyHero">
          <div className="emptyHeroTitle">{query.trim() ? "검색 결과가 없습니다" : "아직 카테고리가 없습니다"}</div>
          <div className="emptyHeroDesc">
            {query.trim() ? "다른 키워드로 검색해보세요." : "오른쪽 위 + 로 시작해보세요."}
          </div>
        </div>
      ) : null}

      <DndContext
        sensors={dndEnabled ? sensors : []}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => {
          if (!dndEnabled) return;
          setActiveId(String(active.id));
        }}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={async ({ active, over }) => {
          if (!dndEnabled) return;
          if (!over) return;
          const activeId = String(active.id);
          const overId = String(over.id);

          // 카테고리 정렬
          if (activeId.startsWith("cat:") && overId.startsWith("cat:") && activeId !== overId) {
            const oldIndex = categoryIds.indexOf(activeId);
            const newIndex = categoryIds.indexOf(overId);
            if (oldIndex !== -1 && newIndex !== -1) {
              const next = arrayMove(categoryIds, oldIndex, newIndex);
              await reorderCategories({ ordered_ids: next.map((x) => x.replace("cat:", "")) });
            }
            setActiveId(null);
            return;
          }

          // 메모: 같은 카테고리 내 재정렬
          if (activeId.startsWith("memo:") && overId.startsWith("memo:") && activeId !== overId) {
            const activeData = active.data.current as { categoryId?: string } | undefined;
            const overData = over.data.current as { categoryId?: string } | undefined;
            const activeCat = activeData?.categoryId;
            const overCat = overData?.categoryId;
            if (activeCat && overCat && activeCat === overCat) {
              const cat = categories.find((c) => c.category.id === activeCat);
              if (!cat) return;
              const memoIds = cat.memos
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((m) => `memo:${m.id}`);
              const oldIndex = memoIds.indexOf(activeId);
              const newIndex = memoIds.indexOf(overId);
              if (oldIndex !== -1 && newIndex !== -1) {
                const next = arrayMove(memoIds, oldIndex, newIndex);
                await reorderMemos({
                  category_id: activeCat,
                  ordered_ids: next.map((x) => x.replace("memo:", "")),
                });
              }
              setActiveId(null);
              return;
            }
            // 다른 카테고리의 메모 위로 드롭한 경우: 해당 카테고리로 이동(끝에 붙이기)
            if (activeCat && overCat && activeCat !== overCat) {
              await moveMemo({ memo_id: activeId.replace("memo:", ""), to_category_id: overCat });
              setActiveId(null);
              return;
            }
          }

          // 메모를 다른 카테고리로 이동
          if (activeId.startsWith("memo:")) {
            const memoId = activeId.replace("memo:", "");
            let toCategoryId: string | null = null;
            if (overId.startsWith("catdrop:")) toCategoryId = overId.replace("catdrop:", "");
            if (overId.startsWith("cat:")) toCategoryId = overId.replace("cat:", "");
            if (!toCategoryId) return;

            const fromCategoryId = (active.data.current as { categoryId?: string } | undefined)?.categoryId;
            if (fromCategoryId && fromCategoryId === toCategoryId) return;

            await moveMemo({ memo_id: memoId, to_category_id: toCategoryId });
            setActiveId(null);
          }

          // 어떤 분기도 타지 않은 경우(실패/무시): 이때만 overlay를 내림(스냅백 연출 유지)
          setActiveId(null);
        }}
      >
        <DragOverlay dropAnimation={null}>
          {activeId?.startsWith("cat:") ? (
            <div className="dragOverlayCard">
              <div className="dragOverlayTitle">카테고리 이동</div>
            </div>
          ) : activeId?.startsWith("memo:") ? (
            <div className="dragOverlayCard">
              <div className="dragOverlayTitle">메모 이동</div>
            </div>
          ) : null}
        </DragOverlay>
        <SortableContext items={categoryIds} strategy={rectSortingStrategy}>
          <div className="categoryGrid">
            {sorted.map((item) => (
              <SortableCategoryCard
                key={item.category.id}
                item={item}
                disabled={!dndEnabled}
                onToggleCollapse={() =>
                  setCategoryCollapsed({
                    id: item.category.id,
                    is_collapsed: !item.category.is_collapsed,
                  })
                }
                onCreateMemo={() => {
                  openMemoCreate(item.category.id, "#ffffff");
                }}
                onOpenSettings={() => {
                  setSettingsCategory(item.category);
                  setSettingsOpen(true);
                }}
                onDelete={async () => {
                  setConfirm({
                    kind: "category",
                    id: item.category.id,
                    title: item.category.title,
                  });
                }}
                onOpenMemo={(memo) => {
                  openMemoEdit(memo);
                }}
                onToggleTodoDone={async (memo, next) => {
                  await updateMemo({
                    id: memo.id,
                    emoji: memo.emoji,
                    title: memo.title,
                    color: memo.color,
                    date_ymd: memo.date_ymd,
                    content_md: memo.content_md,
                    todo_done: next,
                  });
                }}
                onDeleteMemo={async (memo) => {
                  setConfirm({ kind: "memo", id: memo.id, title: memo.title });
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <CreateCategoryModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(input) => createCategory(input)}
      />

      <CategorySettingsModal
        open={settingsOpen}
        category={settingsCategory}
        onClose={() => setSettingsOpen(false)}
        onSave={async (next) => {
          if (!settingsCategory) return;
          await updateCategory({ id: settingsCategory.id, ...next });
        }}
      />

      <Modal
        open={Boolean(confirm)}
        title="삭제"
        onClose={() => setConfirm(null)}
        footer={
          <div className="modalFooterRow">
            <button className="btn" onClick={() => setConfirm(null)}>
              취소
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                if (!confirm) return;
                try {
                  if (confirm.kind === "category") {
                    await deleteCategory(confirm.id);
                  } else {
                    await deleteMemo(confirm.id);
                  }
                } finally {
                  setConfirm(null);
                }
              }}
            >
              삭제
            </button>
          </div>
        }
      >
        <div className="confirmBody">
          {confirm?.kind === "category" ? (
            <div>
              <div className="confirmTitle">카테고리를 삭제할까요?</div>
              <div className="confirmDesc">
                “{confirm.title}” 카테고리와 그 안의 메모가 함께 삭제됩니다.
              </div>
            </div>
          ) : confirm?.kind === "memo" ? (
            <div>
              <div className="confirmTitle">메모를 삭제할까요?</div>
              <div className="confirmDesc">“{confirm.title}” 메모가 삭제됩니다.</div>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}


