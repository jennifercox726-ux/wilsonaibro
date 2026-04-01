import { motion } from "framer-motion";

interface WilsonOrbProps {
  isThinking?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "w-8 h-8",
  md: "w-16 h-16",
  lg: "w-28 h-28",
};

const WilsonOrb = ({ isThinking = false, size = "md" }: WilsonOrbProps) => {
  return (
    <div className={`relative ${sizeMap[size]} flex-shrink-0`}>
      {/* Outer glow */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle, hsl(185 90% 55% / 0.3), hsl(280 70% 60% / 0.15), transparent)",
        }}
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
          background: "radial-gradient(circle at 35% 35%, hsl(185 90% 70%), hsl(280 70% 50%), hsl(320 80% 45%))",
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
        style={{
          background: "radial-gradient(circle at 30% 30%, hsl(185 90% 80% / 0.6), transparent 60%)",
        }}
      />
    </div>
  );
};

export default WilsonOrb;
