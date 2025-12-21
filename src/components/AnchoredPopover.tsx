import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  width?: number;
  maxHeight?: number;
  offset?: number;
  placement?: "bottom-start" | "bottom-end";
  onClose?: () => void;
};

type Pos = { left: number; top: number };

export function AnchoredPopover({
  open,
  anchorRef,
  children,
  width = 360,
  maxHeight = 520,
  offset = 8,
  placement = "bottom-start",
  onClose,
}: Props) {
  const [pos, setPos] = useState<Pos>({ left: 0, top: 0 });
  const [effective, setEffective] = useState<{ width: number; maxHeight: number }>({ width, maxHeight });

  const style = useMemo(
    () =>
      ({
        position: "fixed",
        left: pos.left,
        top: pos.top,
        width: effective.width,
        maxHeight: effective.maxHeight,
        overflow: "auto",
        zIndex: 1000,
      }) as const,
    [pos.left, pos.top, effective.width, effective.maxHeight],
  );

  const compute = () => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // 창이 좁은 경우에는 팝오버 자체를 줄여서(최소 여백 8px) "잘림"을 방지
    const safeW = Math.max(220, Math.min(width, vw - 16));
    const safeH = Math.max(180, Math.min(maxHeight, vh - 16));
    setEffective({ width: safeW, maxHeight: safeH });

    // bottom-start: 좌측 상단 피벗 기준으로 오른쪽으로 펼침
    // bottom-end: 우측 상단 피벗 기준으로 왼쪽으로 펼침(우측 끝에서 잘림 방지)
    let left = placement === "bottom-end" ? r.right - safeW : r.left;
    let top = r.bottom + offset;

    // 화면 밖으로 나가면 clamp
    left = Math.max(8, Math.min(left, vw - safeW - 8));
    top = Math.max(8, Math.min(top, vh - safeH - 8));

    setPos({ left, top });
  };

  useLayoutEffect(() => {
    if (!open) return;
    compute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, width, maxHeight, offset, placement]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => compute();
    const onScroll = () => compute();
    window.addEventListener("resize", onResize);
    // scroll은 캡처 단계에서 받아야 모달 내부 스크롤에도 반응
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, width, maxHeight, offset, placement]);

  useEffect(() => {
    if (!open || !onClose) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      {onClose ? (
        <button
          className="popoverBackdrop"
          aria-label="팝오버 닫기"
          type="button"
          onClick={onClose}
        />
      ) : null}
      <div className="popoverPortal" style={style}>
        {children}
      </div>
    </>,
    document.body,
  );
}


