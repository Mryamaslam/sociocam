import { Component, Suspense, type ReactNode } from "react";
import type { ExpressionLabel, FaceState, HandState, PoseState } from "../types/tracking";
import { AvatarRig } from "./AvatarRig";
import { RealisticAvatarRig } from "./RealisticAvatarRig";
import type { AvatarConfig } from "./avatarOptions";
import { resolveAvatarUrl } from "../lib/api";

interface PlayerAvatarProps {
  position: readonly [number, number, number];
  face: FaceState | null;
  expression: ExpressionLabel;
  leftHand: HandState | null;
  rightHand: HandState | null;
  pose: PoseState | null;
  facingSign: 1 | -1;
  highlightHands?: boolean;
  avatarConfig: AvatarConfig;
  /** Relative path from the server (e.g. "/avatars/u_123.glb"), or null for the procedural fallback. */
  avatarUrl: string | null;
}

interface BoundaryState {
  failed: boolean;
}

/** A GLB that fails to load or parse (network error, corrupt file, a rig this app's retargeting
 * can't find bones/morph targets on) must never take down the whole room — it falls back to the
 * procedural avatar instead. React Three Fiber doesn't catch render-phase errors on its own;
 * this is what actually provides that fallback. */
class AvatarErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Realistic avatar failed to load — falling back to the procedural avatar.", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function PlayerAvatar({ avatarUrl, avatarConfig, ...trackingProps }: PlayerAvatarProps) {
  const procedural = <AvatarRig avatarConfig={avatarConfig} {...trackingProps} />;

  if (!avatarUrl) return procedural;

  return (
    <AvatarErrorBoundary fallback={procedural}>
      <Suspense fallback={null}>
        <RealisticAvatarRig url={resolveAvatarUrl(avatarUrl)} {...trackingProps} />
      </Suspense>
    </AvatarErrorBoundary>
  );
}
