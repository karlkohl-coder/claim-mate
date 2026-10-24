"use client";

import { useEffect, useRef } from "react";

type Props = {
  label: string;
  clearLabel: string;
  onChange: (dataUrl: string | null) => void;
  /** Von außen gesetzte Unterschrift (z. B. Demo), wird ins Feld gezeichnet. */
  value?: string | null;
};

/** Erzeugt eine Demo-Unterschrift in Schreibschrift (nur für Präsentationen). */
export function makeDemoSignature(name: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#13235b";
  ctx.font = "italic 64px 'Snell Roundhand', 'Brush Script MT', 'Segoe Script', cursive";
  ctx.textBaseline = "middle";
  ctx.fillText(name, 20, 85);
  return canvas.toDataURL("image/png");
}

/** Unterschrift mit Finger oder Maus. Liefert ein PNG (transparent) als Data-URL. */
export function SignaturePad({ label, clearLabel, onChange, value }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#13235b";
  }, []);

  useEffect(() => {
    if (!value) return;
    const c = canvas.current!;
    const img = new Image();
    img.onload = () => {
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);
      const w = c.offsetWidth;
      const h = c.offsetHeight;
      const scale = Math.min(w / img.width, h / img.height);
      ctx.drawImage(img, 0, (h - img.height * scale) / 2, img.width * scale, img.height * scale);
      hasInk.current = true;
    };
    img.src = value;
  }, [value]);

  const point = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <button
          type="button"
          className="text-muted hover:text-ink"
          onClick={() => {
            const c = canvas.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            hasInk.current = false;
            onChange(null);
          }}
        >
          {clearLabel}
        </button>
      </div>
      <canvas
        ref={canvas}
        className="h-32 w-full touch-none rounded-xl border border-dashed border-line bg-white"
        onPointerDown={(e) => {
          drawing.current = true;
          canvas.current!.setPointerCapture(e.pointerId);
          const { x, y } = point(e);
          const ctx = canvas.current!.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const { x, y } = point(e);
          const ctx = canvas.current!.getContext("2d")!;
          ctx.lineTo(x, y);
          ctx.stroke();
          hasInk.current = true;
        }}
        onPointerUp={() => {
          drawing.current = false;
          if (hasInk.current) onChange(canvas.current!.toDataURL("image/png"));
        }}
      />
    </div>
  );
}
