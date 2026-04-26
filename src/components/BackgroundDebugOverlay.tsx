import { useEffect, useState } from "react";

/**
 * Background seam diagnostic overlay.
 *
 * Activate via `?bg-debug=1` in the URL or by pressing **Shift + B + D** anywhere.
 * Press **Esc** or toggle the panel off to dismiss.
 *
 * The overlay isolates each potential source of "lines" / seams in the
 * full-viewport background and lets you toggle each independently:
 *
 *   1. **GIF edge sample** — paints a 1px-tall strip from the very top
 *      of the GIF stretched across the viewport so you can compare it to
 *      a 1px strip from the bottom. If those colors differ, the GIF
 *      itself is not seamless (the seam is baked into the asset and no
 *      CSS will hide it on a tile-able layout).
 *
 *   2. **`cover` crop bounds** — overlays the actual rendered rect of
 *      the `background-size: cover` image with a magenta outline plus
 *      crop indicators. If a seam aligns with one of these edges, it's
 *      a cropping artifact, not a GIF problem.
 *
 *   3. **Fixed-attachment paint zones** — fills each scrollable element
 *      with a 50%-opacity color tint so you can see exactly which
 *      surface the background paints behind. Mobile Safari repaints
 *      `background-attachment: fixed` per scroll-container, which often
 *      causes visible bands at element boundaries.
 *
 *   4. **DOM rectangle outlines** — outlines every full-width element
 *      to reveal phantom borders / box-shadows that masquerade as
 *      background seams.
 *
 * The component renders nothing in production unless explicitly enabled.
 */
export default function BackgroundDebugOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [opts, setOpts] = useState({
    gifEdges: true,
    coverBounds: true,
    paintZones: false,
    domOutlines: false,
  });
  const [imgInfo, setImgInfo] = useState<{
    naturalWidth: number;
    naturalHeight: number;
    renderedRect: { left: number; top: number; width: number; height: number };
  } | null>(null);

  // URL param + keyboard shortcut activation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("bg-debug") === "1") setEnabled(true);

    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key.toLowerCase() === "d" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setEnabled((v) => !v);
      }
      if (e.key === "Escape") setEnabled(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Measure the actual rect that `background-size: cover` produces for
  // the background image, given the current viewport.
  useEffect(() => {
    if (!enabled) return;
    const img = new Image();
    img.src = "/app-background.gif";
    img.onload = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const ir = img.naturalWidth / img.naturalHeight;
      const vr = vw / vh;
      let w: number, h: number, left: number, top: number;
      // `cover` scales so the image fully covers the viewport — the
      // shorter dimension matches, the longer overflows.
      if (ir > vr) {
        // Image is wider than viewport ratio → height matches, width overflows
        h = vh;
        w = vh * ir;
        left = (vw - w) / 2;
        top = 0;
      } else {
        // Image is taller → width matches, height overflows
        w = vw;
        h = vw / ir;
        left = 0;
        top = (vh - h) / 2;
      }
      setImgInfo({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        renderedRect: { left, top, width: w, height: h },
      });
    };
  }, [enabled]);

  if (!enabled) return null;

  const rect = imgInfo?.renderedRect;

  return (
    <>
      {/* ============ Diagnostic layer 1: GIF edge sample strips ============ */}
      {opts.gifEdges && (
        <div
          aria-hidden
          className="fixed inset-x-0 top-0 z-[9998] pointer-events-none"
          style={{ height: "8px" }}
        >
          {/* Top edge of GIF (stretched 1px slice) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: "url('/app-background.gif')",
              backgroundSize: `100% ${imgInfo?.naturalHeight ?? 1000}px`,
              backgroundPosition: "0 0",
              backgroundRepeat: "no-repeat",
              outline: "1px solid #00ff88",
            }}
            title="Top 1px row of GIF"
          />
        </div>
      )}
      {opts.gifEdges && (
        <div
          aria-hidden
          className="fixed inset-x-0 bottom-0 z-[9998] pointer-events-none"
          style={{ height: "8px" }}
        >
          {/* Bottom edge of GIF */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: "url('/app-background.gif')",
              backgroundSize: `100% ${imgInfo?.naturalHeight ?? 1000}px`,
              backgroundPosition: `0 -${(imgInfo?.naturalHeight ?? 1000) - 1}px`,
              backgroundRepeat: "no-repeat",
              outline: "1px solid #ff00aa",
            }}
            title="Bottom 1px row of GIF"
          />
        </div>
      )}

      {/* ============ Diagnostic layer 2: `cover` crop bounds ============ */}
      {opts.coverBounds && rect && (
        <div
          aria-hidden
          className="fixed pointer-events-none z-[9997]"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            outline: "2px dashed #ff00ff",
            outlineOffset: "-1px",
          }}
        >
          {/* Corner crosshairs */}
          {(["tl", "tr", "bl", "br"] as const).map((corner) => (
            <div
              key={corner}
              style={{
                position: "absolute",
                width: 12,
                height: 12,
                background: "#ff00ff",
                ...(corner.includes("t") ? { top: 0 } : { bottom: 0 }),
                ...(corner.includes("l") ? { left: 0 } : { right: 0 }),
              }}
            />
          ))}
        </div>
      )}

      {/* ============ Diagnostic layer 3: paint-zone tint ============ */}
      {opts.paintZones && (
        <style>{`
          html { background-color: rgba(255, 255, 0, 0.15) !important; }
          body { background-color: rgba(0, 255, 255, 0.15) !important; }
          #root { background-color: rgba(255, 0, 255, 0.15) !important; }
          [data-paint-zone] { background-color: rgba(0, 255, 0, 0.15) !important; }
        `}</style>
      )}

      {/* ============ Diagnostic layer 4: DOM full-width outlines ============ */}
      {opts.domOutlines && (
        <style>{`
          main, section, header, footer, aside, [class*="container"] {
            outline: 1px dashed rgba(0, 255, 255, 0.6) !important;
            outline-offset: -1px;
          }
        `}</style>
      )}

      {/* ============ Control panel ============ */}
      <div
        className="fixed top-4 right-4 z-[9999] font-mono text-[11px] leading-snug"
        style={{
          background: "rgba(0,0,0,0.85)",
          color: "#0f8",
          border: "1px solid #0f8",
          padding: "10px 12px",
          minWidth: 240,
          backdropFilter: "blur(6px)",
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <strong style={{ color: "#fff" }}>BG SEAM DIAGNOSTIC</strong>
          <button
            onClick={() => setEnabled(false)}
            style={{ color: "#f88", cursor: "pointer", background: "none", border: "none" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {imgInfo && (
          <div style={{ color: "#aaa", marginBottom: 8 }}>
            GIF: {imgInfo.naturalWidth}×{imgInfo.naturalHeight}
            <br />
            Rendered: {Math.round(rect!.width)}×{Math.round(rect!.height)}
            <br />
            Offset: {Math.round(rect!.left)}, {Math.round(rect!.top)}
            <br />
            Viewport: {window.innerWidth}×{window.innerHeight}
          </div>
        )}

        {(
          [
            ["gifEdges", "GIF edge samples (top=green, bottom=pink)"],
            ["coverBounds", "`cover` crop bounds (magenta)"],
            ["paintZones", "Paint zones (html/body/#root tint)"],
            ["domOutlines", "Full-width DOM outlines"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-start gap-2 mb-1 cursor-pointer">
            <input
              type="checkbox"
              checked={opts[key]}
              onChange={(e) => setOpts((o) => ({ ...o, [key]: e.target.checked }))}
            />
            <span>{label}</span>
          </label>
        ))}

        <div style={{ color: "#666", marginTop: 8, fontSize: 10 }}>
          Esc to close · Cmd/Ctrl+Shift+D to toggle
          <br />
          <br />
          <strong style={{ color: "#0f8" }}>How to read:</strong>
          <br />
          • If green ≠ pink strip → GIF has baked-in seam
          <br />
          • Seam at magenta edge → `cover` cropping
          <br />
          • Seam at color-tint border → paint-zone artifact
          <br />
          • Seam at cyan dashed line → DOM border/shadow
        </div>
      </div>
    </>
  );
}
