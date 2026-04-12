import React from "react";
import { motion } from "framer-motion";

export type WilsonVibe = "neutral" | "excited" | "calm" | "tired" | "dreaming";

interface WilsonOrbProps {
  isThinking?: boolean;
  size?: "sm" | "md" | "lg";
  vibe?: WilsonVibe;
}

const sizeMap = {
  sm: "w-8 h-8",
  md: "w-16 h-16",
  lg: "w-28 h-28",
};

const vibeColors: Record<WilsonVibe, { glow: string; core: string; highlight: string }> = {
  neutral: {
    glow: "radial-gradient(circle, hsl(185 90% 55% / 0.3), hsl(280 70% 60% / 0.15), transparent)",
    core: "radial-gradient(circle at 35% 35%, hsl(185 90% 70%), hsl(280 70% 50%), hsl(320 80% 45%))",
    highlight: "radial-gradient(circle at 30% 30%, hsl(185 90% 80% / 0.6), transparent 60%)",
  },
  excited: {
    glow: "radial-gradient(circle, hsl(45 95% 60% / 0.4), hsl(30 90% 50% / 0.2), transparent)",
    core: "radial-gradient(circle at 35% 35%, hsl(45 95% 70%), hsl(30 85% 55%), hsl(15 90% 50%))",
    highlight: "radial-gradient(circle at 30% 30%, hsl(45 95% 85% / 0.7), transparent 60%)",
  },
  calm: {
    glow: "radial-gradient(circle, hsl(210 80% 60% / 0.3), hsl(200 70% 50% / 0.15), transparent)",
    core: "radial-gradient(circle at 35% 35%, hsl(210 80% 70%), hsl(200 70% 55%), hsl(190 75% 50%))",
    highlight: "radial-gradient(circle at 30% 30%, hsl(210 80% 85% / 0.6), transparent 60%)",
  },
  tired: {
    glow: "radial-gradient(circle, hsl(220 40% 50% / 0.2), hsl(230 30% 40% / 0.1), transparent)",
    core: "radial-gradient(circle at 35% 35%, hsl(220 40% 60%), hsl(230 35% 50%), hsl(240 30% 45%))",
    highlight: "radial-gradient(circle at 30% 30%, hsl(220 40% 70% / 0.4), transparent 60%)",
  },
  dreaming: {
    glow: "radial-gradient(circle, hsl(270 70% 60% / 0.35), hsl(290 60% 50% / 0.2), transparent)",
    core: "radial-gradient(circle at 35% 35%, hsl(270 70% 70%), hsl(290 65% 55%), hsl(310 60% 50%))",
    highlight: "radial-gradient(circle at 30% 30%, hsl(270 70% 80% / 0.6), transparent 60%)",
  },
};

const WilsonOrb = React.forwardRef<HTMLDivElement, WilsonOrbProps>(
  ({ isThinking = false, size = "md", vibe = "neutral" }, ref) => {
    const colors = vibeColors[vibe] || vibeColors.neutral;

    return (
      <div ref={ref} className={`relative ${sizeMap[size]} flex-shrink-0`}>
        {/* Outer glow */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: colors.glow }}
          animate={{
            scale: isThinking ? [1, 1.4, 1] : [1, 1.15, 1],
            opacity: isThinking ? [0.6, 1, 0.6] : [0.4, 0.7, 0.4],
          }}
          transition={{
            duration: isThinking ? 1.2 : 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        {/* Core orb */}
        <motion.div
          className="absolute inset-1.5 rounded-full"
          style={{
            background: colors.core,
            boxShadow: "0 0 20px hsl(185 90% 55% / 0.5), inset 0 0 15px hsl(280 70% 60% / 0.3)",
          }}
          animate={{
            rotate: [0, 360],
            scale: isThinking ? [0.95, 1.05, 0.95] : 1,
          }}
          transition={{
            rotate: { duration: 20, repeat: Infinity, ease: "linear" },
            scale: { duration: 0.8, repeat: Infinity, ease: "easeInOut" },
          }}
        />
        {/* Inner highlight */}
        <div
          className="absolute inset-3 rounded-full iridescent"
          style={{ background: colors.highlight }}
        />
      </div>
    );
  }
);

WilsonOrb.displayName = "WilsonOrb";

export default WilsonOrb;
