import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { Extension } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";
import { Save, X } from "lucide-react";
import { Modal } from "../../components/Modal";
import { ColorPicker, TEXT_COLOR_PRESETS } from "../../components/ColorPicker";
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
  const colorChipRef = useRef<HTMLButtonElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiWrapRef = useRef<HTMLDivElement | null>(null);
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);

  type HeadingMarker = {
    key: string;
    level: 1 | 2 | 3;
    text: string;
    topPct: number; // 0..1 within scroll container
    domTop: number; // absolute top within scroll content
    pos: number | null; // prosemirror document position (stable)
  };
  const [headingMarkers, setHeadingMarkers] = useState<HeadingMarker[]>([]);
  const [activeHeadingKey, setActiveHeadingKey] = useState<string | null>(null);
  const railRafRef = useRef<number | null>(null);
  const persistRafRef = useRef<number | null>(null);

  const HIGHLIGHT_PRESETS = useMemo(
    () => [
      "#00000000", // "없음" 자리(표시만)
      "#FDE68A", // amber-200
      "#BBF7D0", // green-200
      "#BFDBFE", // blue-200
      "#FBCFE8", // pink-200
      "#DDD6FE", // violet-200
      "#FED7AA", // orange-200
      "#A7F3D0", // emerald-200
      "#C7D2FE", // indigo-200
      "#FECDD3", // rose-200
    ],
    [],
  );

  const [selMenu, setSelMenu] = useState<{ open: boolean; left: number; top: number }>({
    open: false,
    left: 0,
    top: 0,
  });
  const selMenuRef = useRef<HTMLDivElement | null>(null);
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);

  const MoveLineShortcuts = useMemo(() => {
    return Extension.create({
      name: "ideanodeMoveLines",
      addKeyboardShortcuts() {
        const moveTopLevelBlocks = (dir: "up" | "down") => {
          const { state, dispatch } = this.editor.view;
          const { doc, selection } = state;
          const from = selection.from;
          const to = selection.to;

          // top-level block 단위로만 이동(노션/코드 편집기의 "라인 이동" 느낌)
          let pos = 0;
          const ranges: { idx: number; start: number; end: number }[] = [];
          for (let i = 0; i < doc.childCount; i++) {
            const node = doc.child(i);
            const start = pos;
            const end = pos + node.nodeSize;
            if (end >= from && start <= to) ranges.push({ idx: i, start, end });
            pos = end;
          }
          if (!ranges.length) return false;
          const startIdx = ranges[0].idx;
          const endIdx = ranges[ranges.length - 1].idx;

          if (dir === "up" && startIdx === 0) return true;
          if (dir === "down" && endIdx === doc.childCount - 1) return true;

          // 선택된 블럭 slice
          const selStart = ranges[0].start;
          const selEnd = ranges[ranges.length - 1].end;
          const slice = doc.slice(selStart, selEnd);
          const deletedSize = selEnd - selStart;

          // 이동 대상 위치(원본 doc 기준)
          let targetPos = 0;
          if (dir === "up") {
            // 이전 블럭 시작 위치
            let p = 0;
            for (let i = 0; i < startIdx - 1; i++) p += doc.child(i).nodeSize;
            targetPos = p; // start of prev
          } else {
            // 다음 블럭 뒤 위치 = (endIdx+1) 블럭의 end
            let p = 0;
            for (let i = 0; i <= endIdx + 1; i++) p += doc.child(i).nodeSize;
            targetPos = p; // end of next
            // delete 후 좌측으로 당겨지는 만큼 보정
            targetPos = targetPos - deletedSize;
          }

          const tr = state.tr;
          tr.delete(selStart, selEnd);
          tr.insert(targetPos, slice.content);

          // 커서/선택 범위 재설정(이동된 블럭의 앞쪽으로)
          const anchor = Math.max(0, Math.min(tr.doc.content.size, targetPos + 1));
          try {
            tr.setSelection(Selection.near(tr.doc.resolve(anchor)));
          } catch {
            // ignore
          }
          dispatch(tr.scrollIntoView());
          return true;
        };

        const moveListItems = (dir: "up" | "down") => {
          const { state, dispatch } = this.editor.view;
          const { doc, selection } = state;
          const from = selection.from;
          const to = selection.to;

          const $from = doc.resolve(from);
          // listItem depth 찾기
          let liDepth = -1;
          for (let d = $from.depth; d > 0; d--) {
            const name = $from.node(d).type.name;
            if (name === "listItem" || name === "list_item") {
              liDepth = d;
              break;
            }
          }
          if (liDepth < 1) return false;

          const listDepth = liDepth - 1;
          const listNode = $from.node(listDepth);
          const listName = listNode.type.name;
          if (listName !== "bulletList" && listName !== "orderedList" && listName !== "bullet_list" && listName !== "ordered_list") {
            return false;
          }

          // selection이 동일 list 범위 밖으로 나가면 안전하게 포기
          const listStart = $from.start(listDepth);
          const listEnd = $from.end(listDepth);
          if (to > listEnd || from < listStart) return false;

          // list children(listItem) 중 selection과 겹치는 아이템 범위 계산
          let pos = listStart;
          const hits: { idx: number; start: number; end: number }[] = [];
          for (let i = 0; i < listNode.childCount; i++) {
            const child = listNode.child(i);
            const start = pos;
            const end = pos + child.nodeSize;
            if (end >= from && start <= to) hits.push({ idx: i, start, end });
            pos = end;
          }
          if (!hits.length) return false;

          const startIdx = hits[0].idx;
          const endIdx = hits[hits.length - 1].idx;
          if (dir === "up" && startIdx === 0) return true;
          if (dir === "down" && endIdx === listNode.childCount - 1) return true;

          const selStart = hits[0].start;
          const selEnd = hits[hits.length - 1].end;
          const slice = doc.slice(selStart, selEnd);
          const deletedSize = selEnd - selStart;

          // target position은 같은 list content 안에서만 계산
          let targetPos = selStart;
          if (dir === "up") {
            // 이전 아이템 시작
            let p = listStart;
            for (let i = 0; i < startIdx - 1; i++) p += listNode.child(i).nodeSize;
            targetPos = p;
          } else {
            // 다음 아이템 뒤
            let p = listStart;
            for (let i = 0; i <= endIdx + 1; i++) p += listNode.child(i).nodeSize;
            targetPos = p - deletedSize;
          }

          const tr = state.tr;
          tr.delete(selStart, selEnd);
          tr.insert(targetPos, slice.content);

          const anchor = Math.max(listStart + 1, Math.min(tr.doc.content.size, targetPos + 1));
          try {
            tr.setSelection(Selection.near(tr.doc.resolve(anchor)));
          } catch {}
          dispatch(tr.scrollIntoView());
          return true;
        };

        const moveLinesWithinTextblock = (dir: "up" | "down") => {
          const { state, dispatch } = this.editor.view;
          const { doc, selection } = state;
          const from = selection.from;
          const to = selection.to;
          const $from = doc.resolve(from);
          // 현재 커서가 있는 textblock depth 찾기
          let depth = $from.depth;
          while (depth > 0 && !$from.node(depth).isTextblock) depth--;
          if (depth <= 0) return false;

          const tb = $from.node(depth);
          const tbStart = $from.start(depth);

          // hard_break로 라인 분리
          const breaks: { start: number; end: number }[] = [];
          tb.descendants((node, pos) => {
            if (node.type.name === "hardBreak" || node.type.name === "hard_break") {
              breaks.push({ start: pos, end: pos + node.nodeSize });
            }
            return true;
          });
          breaks.sort((a, b) => a.start - b.start);

          // 라인 목록 생성(브레이크 제외, 컨텐츠만)
          const lines: { from: number; to: number }[] = [];
          let cur = 0;
          for (const b of breaks) {
            lines.push({ from: cur, to: b.start });
            cur = b.end;
          }
          lines.push({ from: cur, to: tb.content.size });
          if (lines.length <= 1) return false;

          const fromOff = Math.max(0, Math.min(tb.content.size, from - tbStart));
          const toOff = Math.max(0, Math.min(tb.content.size, to - tbStart));
          let startLine = 0;
          let endLine = 0;
          for (let i = 0; i < lines.length; i++) {
            const L = lines[i];
            if (fromOff >= L.from && fromOff <= L.to) startLine = i;
            if (toOff >= L.from && toOff <= L.to) endLine = i;
          }

          if (dir === "up" && startLine === 0) return true;
          if (dir === "down" && endLine === lines.length - 1) return true;

          const neighborLine = dir === "up" ? startLine - 1 : endLine + 1;
          const group = { from: lines[startLine].from, to: lines[endLine].to };
          const neigh = lines[neighborLine];

          // 두 구간이 붙어있고 사이에 hard_break가 있는 형태가 일반적이지만,
          // 여기서는 "컨텐츠만" swap 한다. (hard_break는 그대로 유지)
          const firstIsNeighbor = neigh.from < group.from;
          const range1 = firstIsNeighbor ? { from: tbStart + neigh.from, to: tbStart + neigh.to } : { from: tbStart + group.from, to: tbStart + group.to };
          const range2 = firstIsNeighbor ? { from: tbStart + group.from, to: tbStart + group.to } : { from: tbStart + neigh.from, to: tbStart + neigh.to };

          const slice1 = doc.slice(range1.from, range1.to);
          const slice2 = doc.slice(range2.from, range2.to);

          const tr = state.tr;
          // 뒤쪽 먼저 교체 -> 앞쪽 위치 유지
          tr.replaceRange(range2.from, range2.to, slice1);
          tr.replaceRange(range1.from, range1.to, slice2);

          // 선택 영역을 이동 후에도 유지(대략적인 anchor)
          const anchor = Math.max(tbStart + 1, Math.min(tr.doc.content.size, dir === "up" ? tbStart + lines[startLine - 1].from + 1 : tbStart + lines[startLine + 1].from + 1));
          try {
            tr.setSelection(Selection.near(tr.doc.resolve(anchor)));
          } catch {}
          dispatch(tr.scrollIntoView());
          return true;
        };

        const move = (dir: "up" | "down") => {
          // 0) 리스트 안에서는 listItem을 "라인"으로 취급해 먼저 이동
          if (moveListItems(dir)) return true;
          // 1) 가능하면 같은 textblock 안에서 hard_break 기준으로 라인 이동
          if (moveLinesWithinTextblock(dir)) return true;
          // 2) 아니면 top-level block 이동(문단 단위)
          return moveTopLevelBlocks(dir);
        };

        return {
          // 충돌 가능성이 낮은 조합으로 고정: Ctrl+Shift+Alt+↑/↓
          // (Alt/Option 단독은 OS/에디터 기본 이동과 충돌하는 환경이 있어 배제)
          "Ctrl-Shift-Alt-ArrowUp": () => move("up"),
          "Ctrl-Shift-Alt-ArrowDown": () => move("down"),
          // macOS에서 Ctrl 조합이 먹지 않는 경우를 대비한 대안(⌘+⌥+⇧+↑/↓)
          "Mod-Alt-Shift-ArrowUp": () => move("up"),
          "Mod-Alt-Shift-ArrowDown": () => move("down"),
        };
      },
    });
  }, []);

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
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      MoveLineShortcuts,
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

  const storageKey = (id: string) => `ideanode:memo:lastpos:${id}`;

  const persistLastPos = () => {
    if (!open) return;
    if (!editor) return;
    const id = getActiveMemoId();
    if (!id) return;
    const scroller = editorScrollRef.current;
    const scrollTop = scroller ? scroller.scrollTop : 0;
    const pos = editor.state.selection.from;
    try {
      window.localStorage.setItem(
        storageKey(id),
        JSON.stringify({ pos, scrollTop, t: Date.now() }),
      );
    } catch {
      // ignore
    }
  };

  const schedulePersistLastPos = () => {
    if (persistRafRef.current) window.cancelAnimationFrame(persistRafRef.current);
    persistRafRef.current = window.requestAnimationFrame(() => {
      persistRafRef.current = null;
      persistLastPos();
    });
  };

  const recomputeHeadingRail = () => {
    if (!open) return;
    if (!editor) return;
    const scroller = editorScrollRef.current;
    if (!scroller) return;
    const scrollRect = scroller.getBoundingClientRect();
    const next: HeadingMarker[] = [];
    const denom = Math.max(1, scroller.scrollHeight);

    // DOM query 대신 ProseMirror doc 기반으로 안정적으로 헤더 목록/pos를 생성
    // (HMR/레이아웃 타이밍/중복 텍스트에 영향 없음)
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== "heading") return true;
      const level = (node.attrs?.level as 1 | 2 | 3 | undefined) ?? 1;
      if (level < 1 || level > 3) return true;
      const text = (node.textContent ?? "").trim();
      if (!text.length) return true;
      // heading 노드의 시작 위치로 커서를 둘 수 있도록 +1
      const anchorPos = pos + 1;
      let domTop = 0;
      try {
        const coords = editor.view.coordsAtPos(anchorPos);
        domTop = coords.top - scrollRect.top + scroller.scrollTop;
      } catch {
        domTop = 0;
      }
      const topPct = Math.min(1, Math.max(0, domTop / denom));
      next.push({
        key: `h:${anchorPos}:${level}`,
        level,
        text,
        topPct,
        domTop,
        pos: anchorPos,
      });
      return true;
    });

    setHeadingMarkers(next);

    // 현재 보고 있는 섹션(스크롤 위치 기준) 계산
    const anchor = scroller.scrollTop + 80;
    let active: string | null = null;
    for (const h of next) {
      if (h.domTop <= anchor) active = h.key;
      else break;
    }
    setActiveHeadingKey(active);
  };

  const scheduleRecomputeHeadingRail = () => {
    if (railRafRef.current) window.cancelAnimationFrame(railRafRef.current);
    railRafRef.current = window.requestAnimationFrame(() => {
      railRafRef.current = null;
      recomputeHeadingRail();
    });
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

  // 마지막 커서/스크롤 위치 저장 + 복원
  useEffect(() => {
    if (!open) return;
    if (!editor) return;

    // selection 변화에 따라 커서 위치 저장
    const onSelection = () => schedulePersistLastPos();
    editor.on("selectionUpdate", onSelection);

    const updateSelectionMenu = () => {
      if (!editor) return;
      const { from, to, empty } = editor.state.selection;
      if (empty || from === to) {
        setSelMenu((s) => (s.open ? { ...s, open: false } : s));
        return;
      }
      lastSelectionRef.current = { from, to };
      try {
        const a = editor.view.coordsAtPos(from);
        const b = editor.view.coordsAtPos(to);
        const left = (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2;
        const top = Math.min(a.top, b.top) - 12;
        const pad = 10;
        const safeLeft = Math.max(pad, Math.min(window.innerWidth - pad, left));
        const safeTop = Math.max(pad, Math.min(window.innerHeight - pad, top));
        setSelMenu({ open: true, left: safeLeft, top: safeTop });
      } catch {
        setSelMenu((s) => (s.open ? { ...s, open: false } : s));
      }
    };

    const onSelectionForMenu = () => updateSelectionMenu();
    editor.on("selectionUpdate", onSelectionForMenu);
    // mouseup/keyup에서도 강제 갱신(선택 드래그 종료 시점 보장)
    const dom = editor.view.dom as HTMLElement;
    const onMouseUp = () => window.setTimeout(updateSelectionMenu, 0);
    const onKeyUp = () => window.setTimeout(updateSelectionMenu, 0);
    dom.addEventListener("mouseup", onMouseUp);
    dom.addEventListener("keyup", onKeyUp);

    // 스크롤 위치 저장 + 헤더 레일 갱신
    const scroller = editorScrollRef.current;
    const onScroll = () => {
      schedulePersistLastPos();
      scheduleRecomputeHeadingRail();
      updateSelectionMenu();
    };
    scroller?.addEventListener("scroll", onScroll, { passive: true });

    // 툴바가 열린 상태에서 바깥 클릭하면 닫기(에디터 blur로 바로 닫히는 문제 방지)
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      const menuEl = selMenuRef.current;
      const inMenu = menuEl ? menuEl.contains(t) : false;
      const inEditor = dom.contains(t);
      if (inMenu || inEditor) return;
      setSelMenu((s) => (s.open ? { ...s, open: false } : s));
    };
    window.addEventListener("mousedown", onDocMouseDown);

    // 초기 복원(메모 id가 준비된 뒤 수행)
    const tryRestore = () => {
      const id = getActiveMemoId();
      if (!id) return;
      let raw: string | null = null;
      try {
        raw = window.localStorage.getItem(storageKey(id));
      } catch {
        raw = null;
      }
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as { pos?: number; scrollTop?: number };
        const pos = typeof parsed.pos === "number" ? parsed.pos : null;
        const scrollTop = typeof parsed.scrollTop === "number" ? parsed.scrollTop : null;
        if (scrollTop != null && editorScrollRef.current) {
          editorScrollRef.current.scrollTop = Math.max(0, scrollTop);
        }
        if (pos != null) {
          const docSize = editor.state.doc.content.size;
          const clamped = Math.max(0, Math.min(docSize, pos));
          try {
            editor.commands.setTextSelection(clamped);
          } catch {
            // ignore
          }
        }
        // 레일도 즉시 갱신
        scheduleRecomputeHeadingRail();
      } catch {
        // ignore
      }
    };

    // open 직후/초안 생성 직후 모두 대응
    const t1 = window.setTimeout(() => tryRestore(), 0);
    const t2 = window.setTimeout(() => tryRestore(), 200);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      editor.off("selectionUpdate", onSelection);
      editor.off("selectionUpdate", onSelectionForMenu);
      scroller?.removeEventListener("scroll", onScroll as EventListener);
      dom.removeEventListener("mouseup", onMouseUp);
      dom.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onDocMouseDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editor, draftMemoId, mode?.kind]);

  // 헤더 레일: editor 업데이트/리사이즈 시 갱신
  useEffect(() => {
    if (!open) return;
    if (!editor) return;
    const onUpdate = () => scheduleRecomputeHeadingRail();
    editor.on("update", onUpdate);
    const onResize = () => scheduleRecomputeHeadingRail();
    window.addEventListener("resize", onResize);
    // 최초 1회
    scheduleRecomputeHeadingRail();
    return () => {
      editor.off("update", onUpdate);
      window.removeEventListener("resize", onResize);
    };
  }, [open, editor]);

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
        persistLastPos();
        await flushSave();
        await onCreatedOrUpdated();
        onClose();
      }}
      hideDefaultClose
      cardClassName="memoEditorModalCard"
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

          <div className="titleInputWrap" ref={colorWrapRef}>
            <input
              className="memoHeaderTitleInput"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              style={{ color }}
              placeholder="메모 제목"
              aria-label="메모 제목"
            />
            <button
              type="button"
              className="titleColorChipBtn"
              ref={colorChipRef}
              onClick={() => setColorOpen((v) => !v)}
              aria-label="텍스트 컬러 변경"
              title="텍스트 컬러"
              style={{ background: color }}
            />
          </div>

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
                persistLastPos();
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
        <div className="richEditorWrap">
          <div className="richEditorShell">
            <div className="richEditorScroll" ref={editorScrollRef}>
              {editor ? <EditorContent editor={editor} /> : null}
            </div>
            <div className="headingRail" aria-hidden="true">
              {headingMarkers.map((h) => (
                <button
                  key={h.key}
                  type="button"
                  className={`headingRailMark level${h.level}${activeHeadingKey === h.key ? " active" : ""}`}
                  style={{ top: `${h.topPct * 100}%` }}
                  onClick={() => {
                    const scroller = editorScrollRef.current;
                    if (!scroller || !editor) return;
                    scroller.scrollTo({ top: Math.max(0, h.domTop - 24), behavior: "smooth" });
                    if (typeof h.pos === "number") {
                      try {
                        editor.commands.setTextSelection(h.pos);
                        editor.commands.focus();
                      } catch {
                        // ignore
                      }
                    }
                  }}
                  aria-label={`제목 이동: ${h.text}`}
                />
              ))}
              {headingMarkers.map((h) => (
                <button
                  key={`${h.key}:label`}
                  type="button"
                  className={`headingRailLabel${activeHeadingKey === h.key ? " active" : ""}`}
                  style={{ top: `${h.topPct * 100}%` }}
                  onClick={() => {
                    const scroller = editorScrollRef.current;
                    if (!scroller || !editor) return;
                    scroller.scrollTo({ top: Math.max(0, h.domTop - 24), behavior: "smooth" });
                    if (typeof h.pos === "number") {
                      try {
                        editor.commands.setTextSelection(h.pos);
                        editor.commands.focus();
                      } catch {}
                    }
                  }}
                  aria-label={`제목 이동: ${h.text}`}
                >
                  {h.text}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>

    {selMenu.open && editor ? (
      <div
        className="selectionToolbar"
        ref={selMenuRef}
        style={{ left: selMenu.left, top: selMenu.top, transform: "translate(-50%, -100%)" }}
        onMouseDown={(e) => {
          // 툴바 클릭 시 selection이 깨지는 것을 방지(색 적용 안 되는 원인)
          e.preventDefault();
        }}
      >
        <div className="selectionToolbarRow">
          <div className="selectionToolbarLabel">텍스트</div>
          <div className="selectionChipRow">
            {TEXT_COLOR_PRESETS.slice(0, 12).map((p) => (
              <button
                key={`tc:${p.value}`}
                type="button"
                className="selectionChip"
                style={{ background: p.value }}
                aria-label={`텍스트 컬러 ${p.name}`}
                title={p.name}
                onClick={() => {
                  const r = lastSelectionRef.current;
                  if (!r) return;
                  editor.chain().setTextSelection(r).focus().setColor(p.value).run();
                }}
              />
            ))}
            <button
              type="button"
              className="selectionClearBtn"
              onClick={() => {
                const r = lastSelectionRef.current;
                if (!r) return;
                editor.chain().setTextSelection(r).focus().unsetColor().run();
              }}
              aria-label="텍스트 컬러 제거"
              title="텍스트 컬러 제거"
            >
              제거
            </button>
          </div>
        </div>
        <div className="selectionToolbarRow">
          <div className="selectionToolbarLabel">배경</div>
          <div className="selectionChipRow">
            {HIGHLIGHT_PRESETS.slice(1).map((c) => (
              <button
                key={`bg:${c}`}
                type="button"
                className="selectionChip"
                style={{ background: c }}
                aria-label={`배경 컬러 ${c}`}
                onClick={() => {
                  const r = lastSelectionRef.current;
                  if (!r) return;
                  editor.chain().setTextSelection(r).focus().setHighlight({ color: c }).run();
                }}
              />
            ))}
            <button
              type="button"
              className="selectionClearBtn"
              onClick={() => {
                const r = lastSelectionRef.current;
                if (!r) return;
                editor.chain().setTextSelection(r).focus().unsetHighlight().run();
              }}
              aria-label="배경 컬러 제거"
              title="배경 컬러 제거"
            >
              제거
            </button>
          </div>
        </div>
      </div>
    ) : null}
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

    <AnchoredPopover
      open={open && colorOpen}
      anchorRef={colorChipRef}
      width={360}
      maxHeight={420}
      placement="bottom-end"
      onClose={() => setColorOpen(false)}
    >
      <div className="popoverInner">
        <ColorPicker value={color} presets={TEXT_COLOR_PRESETS} onChange={setColor} />
      </div>
    </AnchoredPopover>
    </>
  );
}


