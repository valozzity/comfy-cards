"use client";
// 3D preview of a card's .glb in Google's <model-viewer>: drag to rotate, and the holo areas shift as they turn.
import { useEffect, useState } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
    }
  }
}

export default function Viewer3D({ url, filename, onClose }: { url: string; filename: string; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    import("@google/model-viewer").then(() => setReady(true));
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="viewer-back" onClick={onClose}>
      <div className="panel viewer" onClick={(e) => e.stopPropagation()}>
        <div className="row"><span className="eyebrow">3D preview · {filename}.glb</span>
          <button className="btn-line" onClick={onClose}>Close</button></div>
        {ready ? (
          <model-viewer src={url} camera-controls="" auto-rotate="" auto-rotate-delay="0" rotation-per-second="40deg"
            environment-image="neutral" exposure="1.1" shadow-intensity="0.6" camera-orbit="0deg 85deg 0.24m"
            min-camera-orbit="auto auto 0.1m" interaction-prompt="none" style={{ width: "100%", height: 460, background: "transparent" }} />
        ) : <div className="spinner" />}
        <div className="actions">
          <a className="btn" href={url} download={`${filename}.glb`}>Download GLB</a>
          <span className="muted" style={{ fontSize: 12 }}>Drag to turn it. Foil areas are metallic and iridescent; the rest stays matte.</span>
        </div>
      </div>
    </div>
  );
}
