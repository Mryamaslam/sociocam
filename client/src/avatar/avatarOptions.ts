// Stylized, not photorealistic, on purpose: cheaper to render, cheaper on privacy
// (no photo/scan of your real face is ever stored), animates cleanly, and looks the
// same on every device. Every option here is a small closed set so the picker UI and
// the 3D renderer can both stay simple.

export const SKIN_COLORS = ["#f2c9a1", "#d8a878", "#a86f4a", "#7a4a2b", "#e8b4b8", "#c9dfe8"] as const;
export const HAIR_COLORS = ["#2b1b12", "#5a3825", "#8a5a2b", "#c9a227", "#e8e8e8", "#c94f4f", "#4f7ac9"] as const;
export const EYE_COLORS = ["#3a2a1a", "#4f7ac9", "#4fa87a", "#8a5a2b", "#c94f9e", "#6a4fc9"] as const;
export const CLOTHING_COLORS = ["#4f9dde", "#de6f4f", "#6fde8a", "#c76fde", "#dede6f", "#de6f9e", "#3a3a3a"] as const;

export const HAIR_STYLES = ["bald", "short", "long", "ponytail"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export const ACCESSORIES = ["none", "glasses", "hat"] as const;
export type Accessory = (typeof ACCESSORIES)[number];

export interface AvatarConfig {
  skinColor: string;
  hairStyle: HairStyle;
  hairColor: string;
  eyeColor: string;
  clothingColor: string;
  accessory: Accessory;
}

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  skinColor: SKIN_COLORS[0],
  hairStyle: "short",
  hairColor: HAIR_COLORS[0],
  eyeColor: EYE_COLORS[0],
  clothingColor: CLOTHING_COLORS[0],
  accessory: "none",
};

export function sanitizeAvatarConfig(input: Partial<AvatarConfig> | undefined | null): AvatarConfig {
  return {
    skinColor: input?.skinColor && SKIN_COLORS.includes(input.skinColor as any) ? input.skinColor : DEFAULT_AVATAR_CONFIG.skinColor,
    hairStyle: input?.hairStyle && HAIR_STYLES.includes(input.hairStyle as HairStyle) ? input.hairStyle : DEFAULT_AVATAR_CONFIG.hairStyle,
    hairColor: input?.hairColor && HAIR_COLORS.includes(input.hairColor as any) ? input.hairColor : DEFAULT_AVATAR_CONFIG.hairColor,
    eyeColor: input?.eyeColor && EYE_COLORS.includes(input.eyeColor as any) ? input.eyeColor : DEFAULT_AVATAR_CONFIG.eyeColor,
    clothingColor:
      input?.clothingColor && CLOTHING_COLORS.includes(input.clothingColor as any) ? input.clothingColor : DEFAULT_AVATAR_CONFIG.clothingColor,
    accessory: input?.accessory && ACCESSORIES.includes(input.accessory as Accessory) ? input.accessory : DEFAULT_AVATAR_CONFIG.accessory,
  };
}
