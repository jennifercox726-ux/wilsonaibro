import React from "react";
import wilsonFluid from "@/assets/wilson-fluid.png";
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

    // Live amplitude (0..1) drives a gentle scale + glow boost while speaking
    const reactiveScale = 1 + amplitude * 0.08;
    const reactiveGlow = 0.35 + amplitude * 0.45;

    return (
      <div
        ref={ref}
        className={`wilson-fluid wilson-fluid--${intensity} ${sizeMap[size]} relative flex-shrink-0`}
        style={
          {
            "--wilson-amp-scale": reactiveScale,
            "--wilson-amp-glow": reactiveGlow,
            backgroundImage: `url(${wilsonFluid})`,
          } as React.CSSProperties
        }
        aria-hidden="true"
      />
    );
  }
);

WilsonOrb.displayName = "WilsonOrb";

export default WilsonOrb;
