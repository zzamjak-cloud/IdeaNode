export type ColorPreset = { name: string; value: string };

export const TEXT_COLOR_PRESETS: ColorPreset[] = [
  { name: "White", value: "#ffffff" },
  { name: "Gray", value: "#94a3b8" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Green", value: "#22c55e" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
];

// IdeaNode 배경 컬러 프리셋(20)
export const BACKGROUND_COLOR_PRESETS: ColorPreset[] = [
  { name: "Default Navy", value: "#0b1020" },
  { name: "Midnight", value: "#070a12" },
  { name: "Slate 950", value: "#020617" },
  { name: "Zinc 950", value: "#09090b" },
  { name: "Neutral 950", value: "#0a0a0a" },
  { name: "Stone 950", value: "#0c0a09" },
  { name: "Gray 950", value: "#030712" },
  { name: "Cool Gray", value: "#111827" },
  { name: "Slate", value: "#0f172a" },
  { name: "Deep Blue", value: "#0b1b2b" },
  { name: "Ocean", value: "#061b2e" },
  { name: "Teal Night", value: "#071a1a" },
  { name: "Evergreen", value: "#071a12" },
  { name: "Forest", value: "#0b1a10" },
  { name: "Plum", value: "#1b1020" },
  { name: "Indigo Night", value: "#0b102a" },
  { name: "Violet Night", value: "#140b2a" },
  { name: "Aubergine", value: "#1a0b1a" },
  { name: "Charcoal", value: "#141414" },
  { name: "Asphalt", value: "#10131a" },
];

type Props = {
  value: string;
  onChange: (next: string) => void;
  presets?: ColorPreset[];
};

export function ColorPicker({ value, onChange, presets = TEXT_COLOR_PRESETS }: Props) {
  return (
    <div className="colorPicker">
      <div className="colorPresets">
        {presets.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`colorPreset ${value.toLowerCase() === p.value ? "active" : ""}`}
            style={{ background: p.value }}
            onClick={() => onChange(p.value)}
            aria-label={`색상 프리셋 ${p.name}`}
            title={p.name}
          />
        ))}
      </div>

      <div className="row">
        <input
          className="colorInput"
          type="color"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          aria-label="커스텀 컬러"
        />
        <input value={value} onChange={(e) => onChange(e.currentTarget.value)} />
      </div>
    </div>
  );
}


