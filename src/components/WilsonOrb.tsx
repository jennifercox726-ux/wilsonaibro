import React, { useEffect, useRef, useState } from "react";
import wilsonFluid from "@/assets/wilson-fluid.png";
import { useWilsonAudio } from "@/hooks/useWilsonAudio";
import { getListening, subscribeListening, subscribeRipple } from "@/lib/listeningBus";

export type WilsonVibe = "neutral" | "excited" | "calm" | "tired" | "dreaming";

interface WilsonOrbProps {
  isThinking?: boolean;
  /** Force the speaking animation regardless of audio bus */
  speaking?: boolean;
  size?: "sm" | "md" | "lg";
  vibe?: WilsonVibe;
}

const sizeMap = {
  sm: "w-9 h-9",
  md: "w-16 h-16",
  lg: "w-32 h-32",
};

// Vibe → halo tint (HSL hue degrees, used to drive a CSS var)
const vibeHue: Record<WilsonVibe, number> = {
  neutral: 290, // violet/magenta default
  excited: 320, // hot magenta
  calm: 190, // teal
  tired: 270, // deep violet
  dreaming: 160, // aurora green
};

const WilsonOrb = React.forwardRef<HTMLDivElement, WilsonOrbProps>(
  ({ isThinking = false, speaking, size = "md", vibe = "neutral" }, ref) => {
    const { speaking: audioSpeaking, amplitude } = useWilsonAudio();
    const [listening, setListening] = useState<boolean>(getListening());
    const [rippleKey, setRippleKey] = useState(0);
    const [sonarKey, setSonarKey] = useState(0);
    const innerRef = useRef<HTMLDivElement | null>(null);
    const [parallax, setParallax] = useState({ x: 0, y: 0 });

    const isSpeaking = speaking ?? audioSpeaking;
    const intensity = isSpeaking
      ? "speaking"
      : isThinking
      ? "thinking"
      : listening
      ? "listening"
      : "idle";

    // Subscribe to mic listening state
    useEffect(() => subscribeListening(() => setListening(getListening())), []);

    // Subscribe to send ripples
    useEffect(() => subscribeRipple(() => setRippleKey((k) => k + 1)), []);

    // Emit a sonar ring on amplitude peaks (loud syllables)
    const lastPeakAt = useRef(0);
    useEffect(() => {
      if (!isSpeaking) return;
      if (amplitude > 0.55 && performance.now() - lastPeakAt.current > 220) {
        lastPeakAt.current = performance.now();
        setSonarKey((k) => k + 1);
      }
    }, [amplitude, isSpeaking]);

    // Toggle a body-level class so the page background can subtly brighten
    // when Wilson is speaking. Only the *first* mounted orb owns this.
    useEffect(() => {
      if (!isSpeaking) return;
      document.body.classList.add("wilson-speaking");
      return () => document.body.classList.remove("wilson-speaking");
    }, [isSpeaking]);

    // Cursor parallax (desktop only — pointer:fine)
    useEffect(() => {
      if (typeof window === "undefined") return;
      if (!window.matchMedia("(pointer: fine)").matches) return;
      const el = innerRef.current;
      if (!el) return;
      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = (e.clientX - cx) / window.innerWidth;
        const dy = (e.clientY - cy) / window.innerHeight;
        // Clamp to a small range
        setParallax({ x: Math.max(-1, Math.min(1, dx)) * 4, y: Math.max(-1, Math.min(1, dy)) * 4 });
      };
      window.addEventListener("mousemove", onMove, { passive: true });
      return () => window.removeEventListener("mousemove", onMove);
    }, []);

    // Live amplitude (0..1) drives a gentle scale + glow boost while speaking
    const reactiveScale = 1 + amplitude * 0.1;
    const reactiveGlow = 0.35 + amplitude * 0.55;
    // Hue rotation cycles on loud peaks for a holographic shimmer
    const reactiveHue = isSpeaking ? amplitude * 60 : 0;
    // Chromatic aberration intensity (px) from amplitude
    const aberration = isSpeaking ? amplitude * 2.4 : 0;

    return (
      <div
        ref={ref}
        className={`wilson-orb-shell wilson-orb-shell--${intensity} ${sizeMap[size]} relative flex-shrink-0`}
        style={
          {
            "--wilson-vibe-hue": `${vibeHue[vibe]}`,
            "--wilson-parallax-x": `${parallax.x}px`,
            "--wilson-parallax-y": `${parallax.y}px`,
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        {/* Floating + parallax wrapper */}
        <div className="wilson-orb-float absolute inset-0">
          {/* Sonar rings on amplitude peaks */}
          {isSpeaking && (
            <span
              key={`sonar-${sonarKey}`}
              className="wilson-orb-sonar"
              style={{ borderColor: `hsl(var(--wilson-vibe-hue) 80% 65% / 0.7)` }}
            />
          )}
          {/* Send ripple (one-shot from chat input) */}
          {rippleKey > 0 && (
            <span
              key={`ripple-${rippleKey}`}
              className="wilson-orb-ripple"
              onAnimationEnd={(e) => (e.currentTarget.style.opacity = "0")}
            />
          )}

          {/* Sparkle particles — orbit when speaking */}
          {(isSpeaking || isThinking) && (
            <div className="wilson-orb-sparkles" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  className="wilson-orb-sparkle"
                  style={{
                    animationDelay: `${i * 0.4}s`,
                    transform: `rotate(${i * 60}deg)`,
                  }}
                />
              ))}
            </div>
          )}

          {/* The orb itself */}
          <div
            ref={innerRef}
            className={`wilson-fluid wilson-fluid--${intensity} absolute inset-0`}
            style={
              {
                "--wilson-amp-scale": reactiveScale,
                "--wilson-amp-glow": reactiveGlow,
                "--wilson-amp-hue": `${reactiveHue}deg`,
                "--wilson-amp-aberration": `${aberration}px`,
                backgroundImage: `url(${wilsonFluid})`,
              } as React.CSSProperties
            }
          />

          {/* Thinking shimmer sweep (sits above the orb image) */}
          {isThinking && <span className="wilson-orb-shimmer" />}
        </div>
      </div>
    );
  }
);

WilsonOrb.displayName = "WilsonOrb";

export default WilsonOrb;
