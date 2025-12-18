import { type ReactNode, useEffect } from "react";

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
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`modalOverlay ${placement === "top" ? "top" : ""}`}
      role="dialog"
      aria-modal="true"
      style={{ zIndex }}
    >
      <button className="modalBackdrop" onClick={onClose} aria-label="배경 닫기" style={{ zIndex }} />
      <div className="modalCard" style={{ zIndex: zIndex + 1 }}>
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


