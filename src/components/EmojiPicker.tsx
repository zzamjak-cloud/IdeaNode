import EmojiPickerReact, { EmojiStyle, Theme } from "emoji-picker-react";

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export function EmojiPicker({ value, onChange }: Props) {
  return (
    <div className="emojiPicker">
      <div className="emojiPickerPanel">
        <EmojiPickerReact
          theme={Theme.DARK}
          emojiStyle={EmojiStyle.NATIVE}
          previewConfig={{ showPreview: false }}
          searchDisabled={false}
          onEmojiClick={(data) => onChange(data.emoji)}
        />
      </div>

      <div className="row">
        <input
          value={value}
          onChange={(ev) => onChange(ev.currentTarget.value)}
          placeholder="이모지 직접 입력/붙여넣기"
          aria-label="이모지 입력"
        />
        <button className="btn" type="button" onClick={() => onChange("")}>
          제거
        </button>
      </div>
    </div>
  );
}


