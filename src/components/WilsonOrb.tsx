import React from "react";
import opalTexture from "@/assets/wilson-opal.jpeg";

export type WilsonVibe = "neutral" | "excited" | "calm" | "tired" | "dreaming";

interface WilsonOrbProps {
  isThinking?: boolean;
  /** Strongly pulse the iridescent glow while TTS audio is playing */
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
  ({ isThinking = false, speaking = false, size = "md", vibe: _vibe = "neutral" }, ref) => {
    const intensity = speaking ? "speaking" : isThinking ? "thinking" : "idle";

    return (
      <div
        ref={ref}
        className={`opal-orb opal-orb--${intensity} ${sizeMap[size]} relative flex-shrink-0 rounded-full`}
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

        {/* Glassy highlight */}
        <div className="opal-orb__highlight" />
      </div>
    );
  }
);

WilsonOrb.displayName = "WilsonOrb";

export default WilsonOrb;
