import React from "react";
import opalTexture from "@/assets/wilson-opal.jpeg";
import { useWilsonAudio } from "@/hooks/useWilsonAudio";

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

const WilsonOrb = React.forwardRef<HTMLDivElement, WilsonOrbProps>(
  ({ isThinking = false, speaking, size = "md", vibe: _vibe = "neutral" }, ref) => {
    const { speaking: audioSpeaking, amplitude } = useWilsonAudio();
    const isSpeaking = speaking ?? audioSpeaking;
    const intensity = isSpeaking ? "speaking" : isThinking ? "thinking" : "idle";

    // Live amplitude (0..1) drives an extra glow scale + brightness boost
    const reactiveScale = 1 + amplitude * 0.18;
    const reactiveOpacity = 0.55 + amplitude * 0.45;
    const reactiveBlur = 2 + amplitude * 6;

    return (
      <div
        ref={ref}
        className={`opal-orb opal-orb--${intensity} ${sizeMap[size]} relative flex-shrink-0 rounded-full`}
        style={
          {
            "--opal-amp-scale": reactiveScale,
            "--opal-amp-opacity": reactiveOpacity,
            "--opal-amp-blur": `${reactiveBlur}px`,
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        {/* Outer halo */}
        <div className="opal-orb__halo" />

        {/* Core opal sphere with photo texture */}
        <div
          className="opal-orb__core"
          style={{ backgroundImage: `url(${opalTexture})` }}
        />

        {/* Animated iridescent color sweep */}
        <div className="opal-orb__iridescence" />

        {/* Inner shimmer that swirls while speaking */}
        <div className="opal-orb__shimmer" />

        {/* Voice-reactive pulse layer */}
        {isSpeaking && <div className="opal-orb__pulse" />}

        {/* Glassy highlight */}
        <div className="opal-orb__highlight" />
      </div>
    );
  }
);

WilsonOrb.displayName = "WilsonOrb";

export default WilsonOrb;
