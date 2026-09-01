/**
 * Procedural audio feedback for "The Vase" — a low ambient hum whose volume/pitch tracks
 * instability, plus one-shot success/break stingers. All synthesized with Web Audio (no asset
 * files). Must be created from a user-gesture handler (e.g. the "Start" button click) —
 * browsers block audio contexts from starting on their own.
 */
export class VaseAudio {
  private ctx: AudioContext | null = null;
  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;

  start(): void {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 90;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    this.humOsc = osc;
    this.humGain = gain;
  }

  /** Called every physics tick — hum gets louder and higher-pitched as instability rises. */
  updateTension(instability: number): void {
    if (!this.ctx || !this.humGain || !this.humOsc) return;
    const now = this.ctx.currentTime;
    this.humGain.gain.linearRampToValueAtTime(instability * 0.05, now + 0.08);
    this.humOsc.frequency.linearRampToValueAtTime(90 + instability * 60, now + 0.08);
  }

  playSuccess(): void {
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const gain = this.ctx!.createGain();
      const startAt = this.ctx!.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.12, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(startAt);
      osc.stop(startAt + 0.4);
    });
  }

  playBreak(): void {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
    noise.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();
  }

  stop(): void {
    this.humOsc?.stop();
    this.humOsc?.disconnect();
    this.humGain?.disconnect();
    this.humOsc = null;
    this.humGain = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}
