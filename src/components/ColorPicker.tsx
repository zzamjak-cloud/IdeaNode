const PRESETS: { name: string; value: string }[] = [
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

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export function ColorPicker({ value, onChange }: Props) {
  return (
    <div className="colorPicker">
      <div className="colorPresets">
        {PRESETS.map((p) => (
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


