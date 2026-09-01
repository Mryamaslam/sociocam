import { useEffect, useRef } from "react";
import { useVaseStore } from "../state/vaseStore";
import { VaseAudio } from "../lib/audio/vaseAudio";

/** Renders nothing — just drives procedural audio from vase state. Both host and joiner mount
 * this independently so both hear feedback, not just whoever's browser runs the physics. */
export function VaseAudioController() {
  const phase = useVaseStore((s) => s.phase);
  const instability = useVaseStore((s) => s.instability);
  const audioRef = useRef<VaseAudio | null>(null);
  const prevPhase = useRef(phase);

  useEffect(() => {
    if (phase === "carrying" && !audioRef.current) {
      audioRef.current = new VaseAudio();
      audioRef.current.start();
    }
    if (phase === "success" && prevPhase.current !== "success") audioRef.current?.playSuccess();
    if (phase === "broken" && prevPhase.current !== "broken") audioRef.current?.playBreak();
    if (phase === "idle" && audioRef.current) {
      audioRef.current.stop();
      audioRef.current = null;
    }
    prevPhase.current = phase;
  }, [phase]);

  useEffect(() => {
    if (phase === "carrying") audioRef.current?.updateTension(instability);
  }, [instability, phase]);

  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  return null;
}
