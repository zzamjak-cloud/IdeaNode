import { useEffect, useMemo, useRef, useState } from "react";
import { Palette, Save, X } from "lucide-react";
import { Modal } from "../../components/Modal";
import { ColorPicker } from "../../components/ColorPicker";
import { EmojiPicker } from "../../components/EmojiPicker";
import { AnchoredPopover } from "../../components/AnchoredPopover";
import type { Category } from "../../types";

type Props = {
  open: boolean;
  category: Category | null;
  onClose: () => void;
  onSave: (next: { emoji: string; title: string; color: string }) => Promise<void>;
};

export function CategorySettingsModal({ open, category, onClose, onSave }: Props) {
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
  const [saving, setSaving] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const colorWrapRef = useRef<HTMLDivElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmoji(initial.emoji);
    setTitle(initial.title);
    setColor(initial.color);
    setColorOpen(false);
    setEmojiOpen(false);
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

  const doSave = async () => {
    if (!category) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), color, emoji });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
      open={open}
      placement="top"
      hideBody
      hideDefaultClose
      onClose={onClose}
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

            <button
              className="iconOnlyBtn"
              onClick={doSave}
              disabled={saving || !category || !canSubmit}
              aria-label="저장"
              title="저장"
            >
              <Save size={18} />
            </button>
            <button className="iconOnlyBtn" onClick={onClose} aria-label="닫기" title="닫기">
              <X size={18} />
            </button>
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


