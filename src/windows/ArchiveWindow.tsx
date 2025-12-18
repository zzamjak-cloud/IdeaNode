import { useEffect, useMemo, useState } from "react";
import { ArrowRightFromLine, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store/appStore";
import type { CategoryWithMemos } from "../types";
import { Modal } from "../components/Modal";

function ArchiveCategoryRow({
  item,
  expanded,
  onToggleExpanded,
  onRestore,
}: {
  item: CategoryWithMemos;
  expanded: boolean;
  onToggleExpanded: () => void;
  onRestore: () => void;
}) {
  const memos = item.memos.slice().sort((a, b) => a.position - b.position);
  return (
    <div className={`archiveRow ${expanded ? "expanded" : ""}`}>
      <div className="archiveRowHeader">
        <button
          className="archiveRowMain"
          type="button"
          aria-label="보관된 카테고리 메모 보기"
          title="클릭해서 메모 목록 보기"
          onClick={(e) => {
            e.preventDefault();
            onToggleExpanded();
          }}
        >
          {item.category.emoji?.length ? <span className="categoryEmoji">{item.category.emoji}</span> : null}
          <span className="archiveRowTitle" style={{ color: item.category.color }}>
            {item.category.title}
          </span>
          <span className="archiveRowMeta">{memos.length}</span>
        </button>

        <button
          className="iconOnlyBtn archiveRestoreBtn"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRestore();
          }}
          aria-label="카테고리 꺼내기"
          title="꺼내기"
        >
          <ArrowRightFromLine size={18} />
        </button>
      </div>

      {expanded ? (
        <div className="archiveMemoList">
          {memos.length === 0 ? (
            <div className="archiveMemoEmpty">메모가 없습니다.</div>
          ) : (
            memos.map((m) => (
              <div key={m.id} className="archiveMemoRow" title={m.title}>
                {item.category.is_todo ? (
                  <input className="todoCheckbox" type="checkbox" checked={!!m.todo_done} disabled />
                ) : m.emoji?.length ? (
                  <span className="memoEmoji">{m.emoji}</span>
                ) : null}
                <span className={`archiveMemoTitle ${item.category.is_todo && m.todo_done ? "memoDone" : ""}`}>
                  {m.title}
                </span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function ArchiveWindow() {
  const { categories, refresh, setCategoryArchived } = useAppStore();
  const [query, setQuery] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<null | { id: string; title: string }>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    refresh();
    let unlisten: (() => void) | null = null;
    listen("ideanode:data_changed", async () => {
      await refresh();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [refresh]);

  const archived = useMemo(() => {
    const all = categories.filter((c) => c.category.archived).sort((a, b) => a.category.position - b.category.position);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) => {
      if (c.category.title.toLowerCase().includes(q)) return true;
      return c.memos.some((m) => m.title.toLowerCase().includes(q));
    });
  }, [categories, query]);

  return (
    <main className="archiveWindowRoot">
      <div className="archiveTopBar">
        <div className="searchWrap archiveSearchWrap">
          <input
            className="searchInput archiveSearchInput"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="보관함 검색"
            aria-label="보관함 검색"
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
        <div className="spacer" />
        <div className="archiveCount">{archived.length}</div>
      </div>

      <Modal
        open={Boolean(confirmRestore)}
        title="복원"
        onClose={() => setConfirmRestore(null)}
        zIndex={1000}
        footer={
          <div className="modalFooterRow">
            <button className="btn" onClick={() => setConfirmRestore(null)}>
              취소
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                if (!confirmRestore) return;
                try {
                  await setCategoryArchived({ id: confirmRestore.id, archived: false });
                  setExpandedId((prev) => (prev === confirmRestore.id ? null : prev));
                } finally {
                  setConfirmRestore(null);
                }
              }}
            >
              확인
            </button>
          </div>
        }
      >
        <div style={{ padding: 8, color: "rgba(255,255,255,0.8)" }}>카테고리를 복원하시겠습니까?</div>
      </Modal>

      {archived.length === 0 ? (
        <div className="archiveEmpty">
          <div className="archiveEmptyTitle">{query.trim() ? "검색 결과가 없습니다" : "보관된 카테고리가 없습니다"}</div>
          <div className="archiveEmptyDesc">
            {query.trim() ? "다른 키워드로 검색해보세요." : "보관 기능은 카테고리 편집창 우측의 보관 아이콘에서 사용할 수 있어요."}
          </div>
        </div>
      ) : null}

      <div className="archiveList">
        {archived.map((item) => (
          <ArchiveCategoryRow
            key={item.category.id}
            item={item}
            expanded={expandedId === item.category.id}
            onToggleExpanded={() => setExpandedId((prev) => (prev === item.category.id ? null : item.category.id))}
            onRestore={() => setConfirmRestore({ id: item.category.id, title: item.category.title })}
          />
        ))}
      </div>
    </main>
  );
}


