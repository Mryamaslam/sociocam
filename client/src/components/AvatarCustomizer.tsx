import { AvatarPreview } from "./AvatarPreview";
import {
  ACCESSORIES,
  CLOTHING_COLORS,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_COLORS,
  type AvatarConfig,
} from "../avatar/avatarOptions";

interface AvatarCustomizerProps {
  value: AvatarConfig;
  // Takes an updater (like React's setState) rather than a plain value — two edits fired
  // before a re-render (e.g. batched clicks) must each apply against the OTHER's result,
  // not both against the same stale `value` prop, or one silently clobbers the other.
  onChange: (updater: (prev: AvatarConfig) => AvatarConfig) => void;
}

function SwatchRow({ colors, selected, onPick }: { colors: readonly string[]; selected: string; onPick: (c: string) => void }) {
  return (
    <div className="swatch-row">
      {colors.map((color) => (
        <button
          key={color}
          className={`color-swatch${selected === color ? " color-swatch--selected" : ""}`}
          style={{ background: color }}
          onClick={() => onPick(color)}
          aria-label={`Choose ${color}`}
        />
      ))}
    </div>
  );
}

function StyleOptions<T extends string>({ options, selected, onPick }: { options: readonly T[]; selected: T; onPick: (v: T) => void }) {
  return (
    <div className="style-options">
      {options.map((opt) => (
        <button key={opt} className={selected === opt ? "selected" : ""} onClick={() => onPick(opt)}>
          {opt}
        </button>
      ))}
    </div>
  );
}

export function AvatarCustomizer({ value, onChange }: AvatarCustomizerProps) {
  const set = <K extends keyof AvatarConfig>(key: K, val: AvatarConfig[K]) => onChange((prev) => ({ ...prev, [key]: val }));

  return (
    <div className="customizer">
      <AvatarPreview avatarConfig={value} />
      <div className="customizer__fields">
        <div className="customizer__row">
          <label>Skin</label>
          <SwatchRow colors={SKIN_COLORS} selected={value.skinColor} onPick={(c) => set("skinColor", c)} />
        </div>
        <div className="customizer__row">
          <label>Hair style</label>
          <StyleOptions options={HAIR_STYLES} selected={value.hairStyle} onPick={(v) => set("hairStyle", v)} />
        </div>
        <div className="customizer__row">
          <label>Hair color</label>
          <SwatchRow colors={HAIR_COLORS} selected={value.hairColor} onPick={(c) => set("hairColor", c)} />
        </div>
        <div className="customizer__row">
          <label>Eyes</label>
          <SwatchRow colors={EYE_COLORS} selected={value.eyeColor} onPick={(c) => set("eyeColor", c)} />
        </div>
        <div className="customizer__row">
          <label>Clothing</label>
          <SwatchRow colors={CLOTHING_COLORS} selected={value.clothingColor} onPick={(c) => set("clothingColor", c)} />
        </div>
        <div className="customizer__row">
          <label>Accessory</label>
          <StyleOptions options={ACCESSORIES} selected={value.accessory} onPick={(v) => set("accessory", v)} />
        </div>
      </div>
    </div>
  );
}
