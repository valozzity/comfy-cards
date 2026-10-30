"use client";
// First-visit walkthrough: dims the page, spotlights one control at a time ([data-tour="..."]) and explains it.
// Steps without a target (or whose target isn't on screen) show as a centred card.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type TourStep = {
  target?: string; title: string; body: string; enter?: () => void;
  action?: { label: string; run: () => void }; // e.g. "Set up the demo": does it, then moves on
};
type Box = { top: number; left: number; width: number; height: number };

const PAD = 8;
const CARD_W = 340;

export default function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const step = steps[i];
  // the parent rebuilds `steps` on every render; keep the latest here so effects key on the index, not the object
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const target = step.target;

  const measure = useCallback(() => {
    const el = target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null;
    if (!el) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [target]);

  // run the step's setup (e.g. switch to Upload mode), then bring its target into view and measure it
  useLayoutEffect(() => {
    const current = stepsRef.current[i];
    current.enter?.(); // once per step
    let settle: ReturnType<typeof setTimeout> | undefined;
    const t = setTimeout(() => {
      const el = current.target ? document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`) : null;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      measure();
      settle = setTimeout(measure, 380); // again once the smooth scroll lands
    }, 60);
    return () => { clearTimeout(t); clearTimeout(settle); }; // a fast Next must not let the old step re-measure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((n) => Math.min(steps.length - 1, n + 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", key);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const follow = setInterval(measure, 250); // layout can shift under the spotlight (mode switch, cards arriving)
    return () => {
      clearInterval(follow);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure, onClose, steps.length]);

  // card goes below the spotlight when there's room, otherwise above; clamped to the viewport
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const w = Math.min(CARD_W, vw - 32);
  let card: React.CSSProperties = { width: w, left: (vw - w) / 2, top: vh / 2 - 110 };
  if (box) {
    const below = box.top + box.height + 12;
    const top = below + 200 < vh ? below : Math.max(16, box.top - 212);
    card = { width: w, top, left: Math.min(Math.max(16, box.left), vw - w - 16) };
  }
  const last = i === steps.length - 1;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="App tour">
      {box ? <div className="tour-spot" style={box} /> : <div className="tour-dim" />}
      <div className="tour-card" style={card}>
        <div className="row"><span className="eyebrow">Tour · {i + 1} of {steps.length}</span>
          <button className="tour-skip" onClick={onClose}>Skip</button></div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-nav">
          <div className="tour-dots">{steps.map((_, k) => <span key={k} className={k === i ? "on" : ""} />)}</div>
          <div className="actions">
            {i > 0 ? <button className="btn-line" onClick={() => setI(i - 1)}>Back</button> : null}
            <button className={step.action ? "btn-line" : "btn"} onClick={() => (last ? onClose() : setI(i + 1))}>{last ? "Start creating" : "Next"}</button>
            {step.action ? <button className="btn" onClick={() => { step.action!.run(); setI(i + 1); }}>{step.action.label}</button> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
