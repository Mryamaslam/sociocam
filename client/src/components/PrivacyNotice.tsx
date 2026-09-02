import { Reveal } from "./Reveal";

interface PrivacyNoticeProps {
  onAccept: () => void;
  onDecline: () => void;
}

const SECTIONS: Array<{ label: string; body: string }> = [
  {
    label: "Why we ask:",
    body: "your camera drives your avatar — smiling, raising a hand, reaching out to hold hands, all read from your face and hands and mirrored onto a stylized 3D character, not a video of you.",
  },
  {
    label: "What's processed:",
    body: "face and hand tracking runs entirely in your browser (MediaPipe, on-device). Nothing about your video ever leaves your device for this — no server, ours or anyone else's, ever sees the camera feed.",
  },
  {
    label: "What's transmitted:",
    body: 'only small numbers derived from that on-device tracking — things like "mouth open: 0.4" or a hand\'s x/y/z position — sent directly to the other person in your room over an encrypted peer-to-peer connection, plus (for the hold-hands/high-five feature only) your hand position sent to our server so it can referee that one interaction fairly. Never the video itself.',
  },
  {
    label: "What's stored:",
    body: "nothing from your camera, ever — not a frame, not a recording, not a face scan. Your account only stores what you explicitly typed (username, display name) and chose (avatar appearance) plus game scores.",
  },
  {
    label: "Your control:",
    body: "you can turn the camera off at any time from inside a room without losing your session — a manual on-screen control panel takes over so the experience keeps working. We never request your microphone; this app has no audio input at all.",
  },
];

/** Shown once, before any getUserMedia call — a permission prompt with no context is both bad
 * UX and bad practice. Every claim here must stay true to what the code actually does; see
 * README "Camera privacy" for the same explanation kept in sync. */
export function PrivacyNotice({ onAccept, onDecline }: PrivacyNoticeProps) {
  return (
    <div className="lobby">
      <h1>Before we turn on your camera</h1>
      <div className="privacy-notice">
        {SECTIONS.map((section, i) => (
          <Reveal key={section.label} delay={i * 70}>
            <p>
              <strong>{section.label}</strong> {section.body}
            </p>
          </Reveal>
        ))}
      </div>
      <div className="lobby__card">
        <button onClick={onAccept}>Enable camera</button>
        <button className="link-button" onClick={onDecline}>
          Skip — I'll use manual controls
        </button>
      </div>
    </div>
  );
}
