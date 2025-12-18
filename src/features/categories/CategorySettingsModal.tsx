import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftFromLine, Archive, Palette } from "lucide-react";
import { Modal } from "../../components/Modal";
import { ColorPicker } from "../../components/ColorPicker";
import { EmojiPicker } from "../../components/EmojiPicker";
import { AnchoredPopover } from "../../components/AnchoredPopover";
import type { Category } from "../../types";
import { useAppStore } from "../../store/appStore";

type Props = {
  open: boolean;
  category: Category | null;
  onClose: () => void;
  onSave: (next: { emoji: string; title: string; color: string }) => Promise<void>;
};

export function CategorySettingsModal({ open, category, onClose, onSave }: Props) {
  const { setCategoryArchived } = useAppStore();
  const initial = useMemo(
    () => ({
      emoji: category?.emoji ?? "",
      title: category?.title ?? "",
      color: category?.color ?? "#ffffff",
    }),
    [category],
  );

  const [emoji, setEmoji] = useState(initial.emoji);
  const [title, setTitle] = useState(initial.title);
  const [color, setColor] = useState(initial.color);
  const [colorOpen, setColorOpen] = useState(false);
  const colorWrapRef = useRef<HTMLDivElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<null | { nextArchived: boolean }>(null);
  const debounceRef = useRef<number | null>(null);
  const lastSavedRef = useRef<null | { emoji: string; title: string; color: string }>(null);

  useEffect(() => {
    if (!open) return;
    setEmoji(initial.emoji);
    setTitle(initial.title);
    setColor(initial.color);
    setColorOpen(false);
    setEmojiOpen(false);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = null;
    lastSavedRef.current = null;
  }, [open, initial.emoji, initial.title, initial.color]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (colorOpen && colorWrapRef.current && !colorWrapRef.current.contains(t)) setColorOpen(false);
      // emoji popover는 portal로 렌더링되므로 외부 클릭은 여기서 닫지 않고,
      // EmojiPicker 내부에서 선택/ESC로 닫도록 한다.
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

  const canSubmit = title.trim().length > 0;

  const flushSave = async () => {
    if (!open) return;
    if (!category) return;
    if (!canSubmit) return;
    const snap = { title: title.trim(), color, emoji };
    const last = lastSavedRef.current;
    if (last && last.title === snap.title && last.color === snap.color && last.emoji === snap.emoji) return;
    try {
      await onSave(snap);
      lastSavedRef.current = snap;
    } catch {
      // auto-save 실패는 조용히 무시(사용자 흐름 방해 방지)
    }
  };

  // 자동 저장(디바운스)
  useEffect(() => {
    if (!open) return;
    if (!category) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      await flushSave();
    }, 600);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category?.id, emoji, title, color]);

  const requestClose = () => {
    // 닫기 전에 마지막 1회 저장 시도(가능한 경우)
    void flushSave();
    onClose();
  };

  return (
    <>
      <Modal
        open={Boolean(confirmArchive) && open}
        title={confirmArchive?.nextArchived ? "보관" : "복원"}
        onClose={() => setConfirmArchive(null)}
        zIndex={1000}
        footer={
          <div className="modalFooterRow">
            <button className="btn" onClick={() => setConfirmArchive(null)}>
              취소
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                if (!category || !confirmArchive) return;
                try {
                  await setCategoryArchived({ id: category.id, archived: confirmArchive.nextArchived });
                  setConfirmArchive(null);
                  onClose();
                } finally {
                  setConfirmArchive(null);
                }
              }}
            >
              확인
            </button>
          </div>
        }
      >
        <div style={{ padding: 8, color: "rgba(255,255,255,0.8)" }}>
          {confirmArchive?.nextArchived ? "카테고리를 보관함으로 이동하시겠습니까?" : "카테고리를 복원하시겠습니까?"}
        </div>
      </Modal>

      <Modal
      open={open}
      placement="top"
      hideBody
      hideDefaultClose
      onClose={requestClose}
      headerContent={
        <div className="memoEditorHeader">
          {/* 이모지 버튼을 제목 왼쪽으로 이동 */}
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
            placeholder="카테고리 제목"
            aria-label="카테고리 제목"
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

            {category ? (
              <button
                className="iconOnlyBtn"
                type="button"
                onClick={() => setConfirmArchive({ nextArchived: !category.archived })}
                aria-label={category.archived ? "카테고리 꺼내기" : "카테고리 보관"}
                title={category.archived ? "꺼내기" : "보관"}
              >
                {category.archived ? <ArrowLeftFromLine size={18} /> : <Archive size={18} />}
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      <div />
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


