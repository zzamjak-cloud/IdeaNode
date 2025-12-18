import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Palette } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { AnchoredPopover } from "../components/AnchoredPopover";
import { ColorPicker } from "../components/ColorPicker";
import { EmojiPicker } from "../components/EmojiPicker";
import { api } from "../lib/tauri";
import { formatYmdShort } from "../lib/date";
import { useAppStore } from "../store/appStore";
import type { Memo } from "../types";

type Mode =
  | { kind: "create"; categoryId: string; defaultColor: string }
  | { kind: "edit"; memo: Memo };

export default function MemoWindow() {
  const { categories, refresh } = useAppStore();

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const memoId = params.get("memo");
  const createCategoryId = params.get("create_category_id");
  const defaultColor = params.get("default_color") ?? "#ffffff";

  const mode: Mode | null = useMemo(() => {
    if (memoId) {
      for (const c of categories) {
        const m = c.memos.find((x) => x.id === memoId);
        if (m) return { kind: "edit", memo: m };
      }
      return null;
    }
    if (createCategoryId) return { kind: "create", categoryId: createCategoryId, defaultColor };
    return null;
  }, [categories, memoId, createCategoryId, defaultColor]);

  // 데이터가 아직 안 올라온 상태 대비
  useEffect(() => {
    refresh();
    let unlisten: (() => void) | null = null;
    listen("ideanode:data_changed", async () => {
      await refresh();
    }).then((fn) => (unlisten = fn));
    return () => unlisten?.();
  }, [refresh]);

  // ---- 이하 MemoEditorModal 로직을 "창 전용 UI"로 렌더링 ----
  const AUTOSAVE_DEBOUNCE_MS = 1200;
  const todayYmd = () => new Date().toLocaleDateString("sv-SE");
  const fromMsToYmd = (ms: number) => new Date(ms).toLocaleDateString("sv-SE");

  const initial = useMemo(() => {
    if (!mode) return { emoji: "", title: "", color: "#ffffff", date_ymd: todayYmd(), content_md: "", todo_done: false };
    if (mode.kind === "create") {
      return { emoji: "", title: "새 메모", color: mode.defaultColor, date_ymd: todayYmd(), content_md: "", todo_done: false };
    }
    return {
      emoji: mode.memo.emoji ?? "",
      title: mode.memo.title,
      color: mode.memo.color,
      date_ymd: mode.memo.date_ymd?.length ? mode.memo.date_ymd : fromMsToYmd(mode.memo.created_at),
      content_md: mode.memo.content_md,
      todo_done: !!mode.memo.todo_done,
    };
  }, [mode]);

  const [emoji, setEmoji] = useState(initial.emoji);
  const [title, setTitle] = useState(initial.title);
  const [color, setColor] = useState(initial.color);
  const [dateYmd, setDateYmd] = useState(initial.date_ymd);
  const [content, setContent] = useState<string>(initial.content_md);
  const debounceRef = useRef<number | null>(null);

  const [colorOpen, setColorOpen] = useState(false);
  const colorWrapRef = useRef<HTMLDivElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);

  const [draftMemoId, setDraftMemoId] = useState<string | null>(null);
  const lastSavedRef = useRef<{
    id: string;
    emoji: string;
    title: string;
    color: string;
    date_ymd: string;
    content_md: string;
    todo_done: boolean;
  } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "여기에 메모를 작성하세요…",
      }),
    ],
    content: initial.content_md?.length ? initial.content_md : "<p></p>",
    editorProps: { attributes: { class: "tiptapEditor" } },
    onUpdate: ({ editor }) => setContent(editor.getHTML()),
  });

  useEffect(() => {
    setEmoji(initial.emoji);
    setTitle(initial.title);
    setColor(initial.color);
    setDateYmd(initial.date_ymd);
    setContent(initial.content_md);
    setColorOpen(false);
    setEmojiOpen(false);
    setDraftMemoId(null);
    lastSavedRef.current = null;
    if (editor) editor.commands.setContent(initial.content_md?.length ? initial.content_md : "<p></p>");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.emoji, initial.title, initial.color, initial.date_ymd, initial.content_md]);

  // create 모드: 창이 열리면 초안 생성
  useEffect(() => {
    if (!mode || mode.kind !== "create") return;
    let cancelled = false;
    (async () => {
      try {
        const created = (await api.createMemo({
          category_id: mode.categoryId,
          emoji,
          title: title.trim().length ? title.trim() : "새 메모",
          color,
          date_ymd: dateYmd,
          content_md: editor?.getHTML() ?? content ?? "",
        })) as Memo;
        if (cancelled) return;
        setDraftMemoId(created.id);
        lastSavedRef.current = {
          id: created.id,
          emoji: created.emoji ?? "",
          title: created.title,
          color: created.color,
          date_ymd: created.date_ymd,
          content_md: created.content_md,
          todo_done: !!created.todo_done,
        };
        // 메인 창/다른 창에 새 메모가 즉시 보이도록
        try {
          await emit("ideanode:data_changed");
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode?.kind]);

  const getActiveMemoId = () => {
    if (!mode) return null;
    if (mode.kind === "edit") return mode.memo.id;
    return draftMemoId;
  };

  const getSnapshot = () => {
    const id = getActiveMemoId();
    if (!id) return null;
    return {
      id,
      emoji,
      title: title.trim().length ? title.trim() : "제목 없음",
      color,
      date_ymd: dateYmd,
      content_md: editor?.getHTML() ?? content ?? "",
      todo_done: mode?.kind === "edit" ? !!mode.memo.todo_done : false,
    };
  };

  const flushSave = async () => {
    const snap = getSnapshot();
    if (!snap) return;
    const last = lastSavedRef.current;
    if (
      last &&
      last.id === snap.id &&
      last.emoji === snap.emoji &&
      last.title === snap.title &&
      last.color === snap.color &&
      last.date_ymd === snap.date_ymd &&
      last.content_md === snap.content_md &&
      last.todo_done === snap.todo_done
    ) {
      return;
    }
    try {
      await api.updateMemo({
        id: snap.id,
        emoji: snap.emoji,
        title: snap.title,
        color: snap.color,
        date_ymd: snap.date_ymd,
        content_md: snap.content_md,
        todo_done: snap.todo_done,
      });
      lastSavedRef.current = snap;
      try {
        await emit("ideanode:data_changed");
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const id = getActiveMemoId();
    if (!id) return;
    if (!editor) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      await flushSave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, emoji, title, color, dateYmd, content, draftMemoId, mode?.kind]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (colorOpen && colorWrapRef.current && !colorWrapRef.current.contains(t)) setColorOpen(false);
    };
    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        await flushSave();
        try {
          await emit("ideanode:data_changed");
        } catch {}
        await getCurrentWindow().close();
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorOpen]);

  if (!mode) {
    return (
      <main className="archiveWindowRoot">
        <div className="globalLoading">로딩 중...</div>
      </main>
    );
  }

  return (
    <main className="memoWindowRoot">
      <div className="memoEditorHeader">
        <button
          className="emojiBtn"
          type="button"
          ref={emojiBtnRef}
          onClick={() => setEmojiOpen((v) => !v)}
          aria-label="이모지 변경"
          title="이모지"
        >
          {emoji?.trim().length ? emoji : "➕"}
        </button>

        <input
          className="memoHeaderTitleInput"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          style={{ color }}
          placeholder="메모 제목"
          aria-label="메모 제목"
        />

        <div className="memoHeaderControls">
          <div className="datePickerWrap" title="메모 날짜">
            <div className="dateDisplay">{formatYmdShort(dateYmd)}</div>
            <input
              className="dateInputOverlay"
              type="date"
              value={dateYmd}
              onChange={(e) => setDateYmd(e.currentTarget.value)}
              aria-label="메모 날짜 선택"
            />
          </div>

          <div className="colorMenuWrap" ref={colorWrapRef}>
            <button className="iconOnlyBtn" type="button" onClick={() => setColorOpen((v) => !v)} aria-label="텍스트 컬러 변경" title="텍스트 컬러">
              <Palette size={18} />
            </button>
            {colorOpen ? (
              <div className="popover">
                <ColorPicker value={color} onChange={setColor} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="memoWindowBody">
        <EditorContent editor={editor} />
      </div>

      <AnchoredPopover
        open={emojiOpen}
        anchorRef={emojiBtnRef}
        width={420}
        maxHeight={560}
        onClose={() => setEmojiOpen(false)}
      >
        <div className="popoverInner">
          <EmojiPicker
            value={emoji}
            onChange={(next) => {
              setEmoji(next);
              setEmojiOpen(false);
            }}
          />
        </div>
      </AnchoredPopover>
    </main>
  );
}


