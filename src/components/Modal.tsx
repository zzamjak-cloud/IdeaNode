import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";

type ModalProps = {
  open: boolean;
  title?: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  headerRight?: ReactNode;
  hideDefaultClose?: boolean;
  headerContent?: ReactNode;
  hideBody?: boolean;
  placement?: "center" | "top";
  zIndex?: number;
  submitOnEnter?: boolean;
  cardClassName?: string;
  cardStyle?: CSSProperties;
};

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  headerRight,
  hideDefaultClose,
  headerContent,
  hideBody,
  placement = "center",
  zIndex = 100,
  submitOnEnter = false,
  cardClassName,
  cardStyle,
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (!submitOnEnter) return;
      if (e.key !== "Enter") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = (e.target as HTMLElement | null) ?? null;
      // 텍스트 입력/에디터에서 Enter는 줄바꿈/확정이므로 모달 submit으로 가로채지 않음
      if (el) {
        const tag = el.tagName?.toLowerCase();
        if (tag === "textarea") return;
        if (el.isContentEditable) return;
      }
      const root = cardRef.current;
      if (!root) return;
      const primary = root.querySelector<HTMLButtonElement>("button.btn.primary:not([disabled])");
      if (!primary) return;
      e.preventDefault();
      primary.click();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, submitOnEnter]);

  if (!open) return null;

  return (
    <div
      className={`modalOverlay ${placement === "top" ? "top" : ""}`}
      role="dialog"
      aria-modal="true"
      style={{ zIndex }}
    >
      <button className="modalBackdrop" onClick={onClose} aria-label="배경 닫기" style={{ zIndex }} />
      <div
        className={`modalCard ${cardClassName ?? ""}`}
        ref={cardRef}
        style={{ zIndex: zIndex + 1, ...(cardStyle ?? {}) }}
      >
        <div className="modalHeader">
          {headerContent ? (
            headerContent
          ) : (
            <>
              <div className="modalTitle">{title ?? ""}</div>
              <div className="spacer" />
              {headerRight ? <div className="modalHeaderRight">{headerRight}</div> : null}
              {!hideDefaultClose ? (
                <button className="iconOnlyBtn" onClick={onClose} aria-label="닫기">
                  ✕
                </button>
              ) : null}
            </>
          )}
        </div>
        {!hideBody ? <div className="modalBody">{children}</div> : null}
        {footer ? <div className="modalFooter">{footer}</div> : null}
      </div>
    </div>
  );
}


