import { useEffect, useState } from "react";
import { Modal } from "../../components/Modal";
import { ColorPicker } from "../../components/ColorPicker";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { title: string; color: string }) => Promise<void>;
};

export function CreateCategoryModal({ open, onClose, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("#ffffff");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setColor("#ffffff");
  }, [open]);

  return (
    <Modal
      open={open}
      title="새 카테고리"
      onClose={onClose}
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
                await onCreate({ title: title.trim(), color });
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
      </div>
    </Modal>
  );
}


