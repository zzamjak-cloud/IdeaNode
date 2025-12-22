import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { Extension } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
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

  const [hoverBlock, setHoverBlock] = useState<{
    show: boolean;
    topPx: number; // within richEditorShell
    pos: number; // prosemirror pos (for range calc)
  } | null>(null);
  const hoverHideTimerRef = useRef<number | null>(null);
  const handleHoveringRef = useRef(false);
  const dragRef = useRef<{
    active: boolean;
    from: number;
    to: number;
    slice: any; // Slice
    dropPos: number;
    indicatorTopPx: number;
  } | null>(null);

  const MoveBlockShortcuts = useMemo(() => {
    return Extension.create({
      name: "ideanodeMoveBlocks",
      addKeyboardShortcuts() {
        const move = (dir: "up" | "down") => {
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
      MoveBlockShortcuts,
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

  const getTopLevelBlockRange = (doc: PMNode, pos: number) => {
    const $pos = doc.resolve(Math.max(0, Math.min(doc.content.size, pos)));
    const idx = $pos.index(0);
    let start = 0;
    for (let i = 0; i < idx; i++) start += doc.child(i).nodeSize;
    const node = doc.child(idx);
    const end = start + node.nodeSize;
    return { idx, start, end };
  };

  const computeDropPosFromClientY = (clientY: number) => {
    if (!editor) return null;
    const scroller = editorScrollRef.current;
    if (!scroller) return null;
    const rect = scroller.getBoundingClientRect();
    const coords = editor.view.posAtCoords({ left: rect.left + 40, top: clientY });
    if (!coords) return null;
    const { doc } = editor.state;
    const r = getTopLevelBlockRange(doc, coords.pos);
    // 위/아래 절반으로 before/after 결정
    let insertPos = r.start;
    try {
      // target block의 화면 위치로 half 판정
      const dom = editor.view.nodeDOM(r.start) as HTMLElement | null;
      if (dom) {
        const br = dom.getBoundingClientRect();
        const mid = br.top + br.height / 2;
        insertPos = clientY < mid ? r.start : r.end;
      } else {
        insertPos = r.start;
      }
    } catch {
      insertPos = r.start;
    }
    const indicatorTopPx = (() => {
      // scroller content 기준 y 계산
      const y = clientY - rect.top + scroller.scrollTop;
      return Math.max(0, Math.min(scroller.scrollHeight, y));
    })();
    return { insertPos, indicatorTopPx };
  };

  // 블록 호버 감지 + 드래그 핸들 위치 계산
  useEffect(() => {
    if (!open) return;
    if (!editor) return;
    const scroller = editorScrollRef.current;
    if (!scroller) return;

    // 중요: 거터(핸들 영역)로 마우스를 옮겨도 핸들이 사라지지 않게
    // "현재 Y좌표"만으로 가장 가까운 블록을 찾는다.
    const clearHideTimer = () => {
      if (hoverHideTimerRef.current) window.clearTimeout(hoverHideTimerRef.current);
      hoverHideTimerRef.current = null;
    };

    const scheduleHide = () => {
      clearHideTimer();
      hoverHideTimerRef.current = window.setTimeout(() => {
        hoverHideTimerRef.current = null;
        if (handleHoveringRef.current) return;
        setHoverBlock(null);
      }, 220);
    };

    const pickBlockFromY = (clientY: number) => {
      const rect = scroller.getBoundingClientRect();
      if (clientY < rect.top || clientY > rect.bottom) return null;
      const coords = editor.view.posAtCoords({ left: rect.left + 40, top: clientY });
      if (!coords) return null;
      const { doc } = editor.state;
      const r = getTopLevelBlockRange(doc, coords.pos);
      // 블록의 시작 위치 기준으로 핸들 y를 계산
      let centerPx = 0;
      try {
        const startPos = Math.min(doc.content.size, r.start + 1);
        const endPos = Math.max(startPos, Math.min(doc.content.size, r.end - 1));
        const startCoords = editor.view.coordsAtPos(startPos);
        const endCoords = editor.view.coordsAtPos(endPos);
        const centerY = (startCoords.top + endCoords.bottom) / 2;
        centerPx = centerY - rect.top + scroller.scrollTop;
      } catch {
        centerPx = clientY - rect.top + scroller.scrollTop;
      }
      return { pos: r.start + 1, centerPx };
    };

    const onMove = (e: PointerEvent) => {
      if (dragRef.current?.active) return;
      const picked = pickBlockFromY(e.clientY);
      if (!picked) {
        // 핸들로 이동하는 순간/라인 경계에서 잠깐 벗어나도 바로 숨기지 않음
        if (!handleHoveringRef.current) scheduleHide();
        return;
      }
      clearHideTimer();
      setHoverBlock({ show: true, topPx: picked.centerPx, pos: picked.pos });
    };

    window.addEventListener("pointermove", onMove, true);
    return () => {
      window.removeEventListener("pointermove", onMove, true);
      clearHideTimer();
    };
  }, [open, editor]);

  const startBlockDrag = (e: React.MouseEvent) => {
    if (!editor) return;
    if (!hoverBlock) return;
    e.preventDefault();
    e.stopPropagation();
    const { doc } = editor.state;
    const r = getTopLevelBlockRange(doc, hoverBlock.pos);
    const slice = doc.slice(r.start, r.end);
    dragRef.current = {
      active: true,
      from: r.start,
      to: r.end,
      slice,
      dropPos: r.start,
      indicatorTopPx: hoverBlock.topPx,
    };

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current?.active) return;
      const drop = computeDropPosFromClientY(ev.clientY);
      if (!drop) return;
      dragRef.current.dropPos = drop.insertPos;
      dragRef.current.indicatorTopPx = drop.indicatorTopPx;
      // 상태 업데이트(렌더링용)
      setHoverBlock((hb) => (hb ? { ...hb } : hb));
    };

    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      if (!drag || !editor) return;
      const { state, dispatch } = editor.view;
      const { doc } = state;
      // 현재 doc 기준으로 from/to가 유효한지 방어
      const from = Math.max(0, Math.min(doc.content.size, drag.from));
      const to = Math.max(from, Math.min(doc.content.size, drag.to));
      let dropPos = Math.max(0, Math.min(doc.content.size, drag.dropPos));
      if (dropPos >= from && dropPos <= to) return; // 같은 영역에 드랍

      const tr = state.tr;
      const slice = doc.slice(from, to);
      tr.delete(from, to);
      const deletedSize = to - from;
      if (dropPos > from) dropPos = Math.max(0, dropPos - deletedSize);
      tr.insert(dropPos, slice.content);
      dispatch(tr.scrollIntoView());
      setHoverBlock(null);
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
  };

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
            {/* 좌측 블록 드래그 핸들 */}
            <button
              type="button"
              className={`blockDragHandle${hoverBlock?.show ? " visible" : ""}`}
              style={{ top: hoverBlock ? hoverBlock.topPx : 0 }}
              onMouseDown={startBlockDrag}
              onMouseEnter={() => {
                handleHoveringRef.current = true;
                if (hoverHideTimerRef.current) window.clearTimeout(hoverHideTimerRef.current);
                hoverHideTimerRef.current = null;
              }}
              onMouseLeave={() => {
                handleHoveringRef.current = false;
                // 핸들에서 빠져도 즉시 숨기지 않음
                if (hoverHideTimerRef.current) window.clearTimeout(hoverHideTimerRef.current);
                hoverHideTimerRef.current = window.setTimeout(() => {
                  hoverHideTimerRef.current = null;
                  if (!handleHoveringRef.current) setHoverBlock(null);
                }, 220);
              }}
              aria-label="블록 이동"
              title="블록 이동"
            >
              ⋮⋮
            </button>
            {/* 드롭 인디케이터 */}
            {dragRef.current?.active ? (
              <div className="blockDropIndicator" style={{ top: dragRef.current.indicatorTopPx }} />
            ) : null}
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


