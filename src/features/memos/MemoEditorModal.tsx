import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Palette, Save, X } from "lucide-react";
import { Modal } from "../../components/Modal";
import { ColorPicker } from "../../components/ColorPicker";
import { EmojiPicker } from "../../components/EmojiPicker";
import { AnchoredPopover } from "../../components/AnchoredPopover";
import type { Memo } from "../../types";
import { api } from "../../lib/tauri";
import { formatYmdShort } from "../../lib/date";

type Mode =
  | { kind: "create"; categoryId: string; defaultColor: string }
  | { kind: "edit"; memo: Memo };

type Props = {
  open: boolean;
  mode: Mode | null;
  onClose: () => void;
  onCreatedOrUpdated: () => Promise<void>;
};

export function MemoEditorModal({ open, mode, onClose, onCreatedOrUpdated }: Props) {
  // 자동 저장 정책:
  // - 편집 중에는 "변경이 멈춘 뒤"에만 저장(디바운스)해서 DB 부하 최소화
  // - 닫기/ESC 등으로 모달이 닫히기 직전에 마지막 1회 플러시 저장(유실 방지)
  // - create 모드도 즉시 "초안 메모"를 DB에 생성해두고 이후 edit처럼 자동 저장
  const AUTOSAVE_DEBOUNCE_MS = 1200;

  const todayYmd = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
  const fromMsToYmd = (ms: number) => new Date(ms).toLocaleDateString("sv-SE");

  const initial = useMemo(() => {
    if (!mode) return { emoji: "", title: "", color: "#ffffff", date_ymd: todayYmd(), content_md: "" };
    if (mode.kind === "create") {
      return {
        emoji: "",
        title: "새 메모",
        color: mode.defaultColor,
        date_ymd: todayYmd(),
        content_md: "",
      };
    }
    return {
      emoji: mode.memo.emoji ?? "",
      title: mode.memo.title,
      color: mode.memo.color,
      date_ymd: mode.memo.date_ymd?.length ? mode.memo.date_ymd : fromMsToYmd(mode.memo.created_at),
      content_md: mode.memo.content_md,
    };
  }, [mode]);

  const [emoji, setEmoji] = useState(initial.emoji);
  const [title, setTitle] = useState(initial.title);
  const [color, setColor] = useState(initial.color);
  const [dateYmd, setDateYmd] = useState(initial.date_ymd);
  const [content, setContent] = useState<string>(initial.content_md);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const colorWrapRef = useRef<HTMLDivElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiWrapRef = useRef<HTMLDivElement | null>(null);
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);

  // create 모드에서 "초안"을 DB에 1회 생성하고 얻은 memoId를 통해 이후 자동 저장
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
    editorProps: {
      attributes: {
        class: "tiptapEditor",
      },
    },
    onUpdate: ({ editor }) => {
      setContent(editor.getHTML());
    },
  });

  useEffect(() => {
    if (!open) return;
    setEmoji(initial.emoji);
    setTitle(initial.title);
    setColor(initial.color);
    setDateYmd(initial.date_ymd);
    setContent(initial.content_md);
    setColorOpen(false);
    setEmojiOpen(false);
    setDraftMemoId(null);
    lastSavedRef.current = null;
    if (editor) {
      editor.commands.setContent(initial.content_md?.length ? initial.content_md : "<p></p>");
    }
  }, [open, initial.emoji, initial.title, initial.color, initial.date_ymd, initial.content_md, editor]);

  // create 모드: 모달이 열리면 DB에 초안 메모를 즉시 생성해 유실을 방지한다.
  useEffect(() => {
    if (!open) return;
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
      } catch {
        // v1: 초안 생성 실패 시에도 사용자는 계속 작성 가능(단, 닫기 전에 수동 저장 필요)
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode?.kind]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (colorOpen && colorWrapRef.current && !colorWrapRef.current.contains(t)) setColorOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setColorOpen(false);
        setEmojiOpen(false);
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, colorOpen, emojiOpen]);

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
    } catch {
      // v1: 자동 저장 실패는 조용히 무시(사용자 흐름 방해 방지)
    }
  };

  // 자동 저장: edit 모드 + create 모드(초안 생성 후) 모두 적용
  useEffect(() => {
    if (!open) return;
    if (!editor) return;
    const id = getActiveMemoId();
    if (!id) return; // create 모드에서 초안 생성되기 전

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      await flushSave();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [open, editor, emoji, title, color, dateYmd, content, draftMemoId, mode?.kind]);

  if (!mode) return null;

  const canSubmit = title.trim().length > 0;

  const doSaveAndClose = async () => {
    setSaving(true);
    try {
      // create 모드에서 초안 생성 전에 저장 버튼을 누른 경우를 대비
      if (mode?.kind === "create" && !draftMemoId) {
        const created = (await api.createMemo({
          category_id: mode.categoryId,
          emoji,
          title: title.trim().length ? title.trim() : "새 메모",
          color,
          date_ymd: dateYmd,
          content_md: editor?.getHTML() ?? content ?? "",
        })) as Memo;
        setDraftMemoId(created.id);
      } else {
        await flushSave();
      }
      await onCreatedOrUpdated();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Modal
      open={open}
      onClose={async () => {
        // 닫기 전 마지막 1회 저장(가능한 경우)
        await flushSave();
        await onCreatedOrUpdated();
        onClose();
      }}
      hideDefaultClose
      headerContent={
        <div className="memoEditorHeader">
          <div className="memoHeaderEmojiWrap" ref={emojiWrapRef}>
            <button
              className="emojiBtn"
              type="button"
              ref={emojiBtnRef}
              onClick={() => setEmojiOpen((v) => !v)}
              aria-label="이모지 추가"
              title="이모지"
            >
              {emoji?.trim().length ? emoji : "➕"}
            </button>
          </div>

          <input
            className="memoHeaderTitleInput"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            style={{ color }}
            placeholder="메모 제목"
            aria-label="메모 제목"
          />

          <div className="memoHeaderControls">
            <div className="colorMenuWrap" ref={colorWrapRef}>
              <button
                className="iconOnlyBtn"
                type="button"
                onClick={() => setColorOpen((v) => !v)}
                aria-label="텍스트 컬러 변경"
                title="텍스트 컬러"
              >
                <Palette size={18} />
              </button>
              {colorOpen ? (
                <div className="popover">
                  <ColorPicker value={color} onChange={setColor} />
                </div>
              ) : null}
            </div>

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

            <button
              className="iconOnlyBtn"
              onClick={doSaveAndClose}
              disabled={saving || !canSubmit}
              aria-label="저장"
              title="저장"
            >
              <Save size={18} />
            </button>
            <button
              className="iconOnlyBtn"
              onClick={async () => {
                await flushSave();
                await onCreatedOrUpdated();
                onClose();
              }}
              aria-label="닫기"
              title="닫기"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      }
    >
      <div className="memoEditorBody">
        <div className="richEditorWrap">{editor ? <EditorContent editor={editor} /> : null}</div>
      </div>
    </Modal>
    <AnchoredPopover
      open={open && emojiOpen}
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
    </>
  );
}


