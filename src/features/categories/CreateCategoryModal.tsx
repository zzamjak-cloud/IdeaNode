import { useEffect, useState } from "react";
import { Modal } from "../../components/Modal";
import { ColorPicker } from "../../components/ColorPicker";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { title: string; color: string; is_todo: boolean }) => Promise<void>;
};

export function CreateCategoryModal({ open, onClose, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("#ffffff");
  const [isTodo, setIsTodo] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setColor("#ffffff");
    setIsTodo(false);
  }, [open]);

  return (
    <Modal
      open={open}
      title="새 카테고리"
      onClose={onClose}
      submitOnEnter
      footer={
        <div className="modalFooterRow">
          <button className="btn" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button
            className="btn primary"
            disabled={saving || title.trim().length === 0}
            onClick={async () => {
              setSaving(true);
              try {
                await onCreate({ title: title.trim(), color, is_todo: isTodo });
                onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            생성
          </button>
        </div>
      }
    >
      <div className="form">
        <label className="field">
          <div className="label">제목</div>
          <input value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
        </label>

        <label className="field">
          <div className="label">컬러</div>
          <ColorPicker value={color} onChange={setColor} />
        </label>

        <label className="field">
          <div className="label">Todo list</div>
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={isTodo}
              onChange={(e) => setIsTodo(e.currentTarget.checked)}
            />
            <span>이 카테고리의 메모를 Todo로 사용</span>
          </label>
        </label>
      </div>
    </Modal>
  );
}


