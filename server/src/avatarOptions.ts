// Mirrors client/src/avatar/avatarOptions.ts — duplicated on purpose (no shared package
// between the two workspaces) so the server can validate incoming avatar configs without
// trusting the client blindly.

export const SKIN_COLORS = ["#f2c9a1", "#d8a878", "#a86f4a", "#7a4a2b", "#e8b4b8", "#c9dfe8"];
export const HAIR_COLORS = ["#2b1b12", "#5a3825", "#8a5a2b", "#c9a227", "#e8e8e8", "#c94f4f", "#4f7ac9"];
export const EYE_COLORS = ["#3a2a1a", "#4f7ac9", "#4fa87a", "#8a5a2b", "#c94f9e", "#6a4fc9"];
export const CLOTHING_COLORS = ["#4f9dde", "#de6f4f", "#6fde8a", "#c76fde", "#dede6f", "#de6f9e", "#3a3a3a"];
export const HAIR_STYLES = ["bald", "short", "long", "ponytail"];
export const ACCESSORIES = ["none", "glasses", "hat"];

export interface AvatarConfig {
  skinColor: string;
  hairStyle: string;
  hairColor: string;
  eyeColor: string;
  clothingColor: string;
  accessory: string;
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
    skinColor: input?.skinColor && SKIN_COLORS.includes(input.skinColor) ? input.skinColor : DEFAULT_AVATAR_CONFIG.skinColor,
    hairStyle: input?.hairStyle && HAIR_STYLES.includes(input.hairStyle) ? input.hairStyle : DEFAULT_AVATAR_CONFIG.hairStyle,
    hairColor: input?.hairColor && HAIR_COLORS.includes(input.hairColor) ? input.hairColor : DEFAULT_AVATAR_CONFIG.hairColor,
    eyeColor: input?.eyeColor && EYE_COLORS.includes(input.eyeColor) ? input.eyeColor : DEFAULT_AVATAR_CONFIG.eyeColor,
    clothingColor:
      input?.clothingColor && CLOTHING_COLORS.includes(input.clothingColor) ? input.clothingColor : DEFAULT_AVATAR_CONFIG.clothingColor,
    accessory: input?.accessory && ACCESSORIES.includes(input.accessory) ? input.accessory : DEFAULT_AVATAR_CONFIG.accessory,
  };
}
