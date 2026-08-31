interface CameraPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: string;
}

export function CameraPreview({ videoRef, status }: CameraPreviewProps) {
  return (
    <div className="camera-preview">
      <video ref={videoRef} autoPlay playsInline muted />
      <span className="camera-preview__status">{status}</span>
    </div>
  );
}
