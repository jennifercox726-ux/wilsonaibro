import { motion } from "framer-motion";
import { WilsonVibe } from "./WilsonOrb";

interface NeuralNebulaProps {
  vibe?: WilsonVibe;
}

const vibeParticles: Record<WilsonVibe, { colors: string[]; label: string }> = {
  neutral: {
    colors: ["hsl(185 90% 55%)", "hsl(280 70% 60%)", "hsl(320 80% 55%)", "hsl(200 80% 50%)"],
    label: "Traversing the void",
  },
  excited: {
    colors: ["hsl(45 95% 60%)", "hsl(30 90% 55%)", "hsl(15 90% 50%)", "hsl(50 95% 65%)"],
    label: "Oh oh oh! Processing",
  },
  calm: {
    colors: ["hsl(210 80% 60%)", "hsl(200 70% 55%)", "hsl(190 75% 50%)", "hsl(220 70% 65%)"],
    label: "Gently searching",
  },
  tired: {
    colors: ["hsl(220 40% 55%)", "hsl(230 35% 50%)", "hsl(240 30% 45%)", "hsl(215 35% 55%)"],
    label: "Quietly gathering",
  },
  dreaming: {
    colors: ["hsl(270 70% 60%)", "hsl(290 65% 55%)", "hsl(310 60% 55%)", "hsl(260 75% 65%)"],
    label: "Dreaming patterns",
  },
};

const NeuralNebula = ({ vibe = "neutral" }: NeuralNebulaProps) => {
  const { colors, label } = vibeParticles[vibe] || vibeParticles.neutral;

  return (
    <div className="flex items-center gap-3">
      {/* Nebula cloud */}
      <div className="relative w-12 h-12 flex-shrink-0">
        {/* Ambient glow */}
        <motion.div
          className="absolute inset-0 rounded-full blur-xl"
          style={{ background: `radial-gradient(circle, ${colors[0]}40, ${colors[1]}20, transparent)` }}
          animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Orbiting particles */}
        {colors.map((color, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 6 - i,
              height: 6 - i,
              background: color,
              boxShadow: `0 0 ${8 + i * 4}px ${color}`,
              top: "50%",
              left: "50%",
            }}
            animate={{
              x: [
                Math.cos((i * Math.PI) / 2) * 14,
                Math.cos((i * Math.PI) / 2 + Math.PI) * 16,
                Math.cos((i * Math.PI) / 2 + Math.PI * 2) * 14,
              ],
              y: [
                Math.sin((i * Math.PI) / 2) * 14,
                Math.sin((i * Math.PI) / 2 + Math.PI) * 16,
                Math.sin((i * Math.PI) / 2 + Math.PI * 2) * 14,
              ],
              opacity: [0.5, 1, 0.5],
              scale: [0.8, 1.3, 0.8],
            }}
            transition={{
              duration: 2 + i * 0.4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.3,
            }}
          />
        ))}

        {/* Core shimmer */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 10,
            height: 10,
            top: "50%",
            left: "50%",
            marginTop: -5,
            marginLeft: -5,
            background: `radial-gradient(circle, ${colors[0]}, ${colors[2]}80)`,
            boxShadow: `0 0 20px ${colors[0]}80, 0 0 40px ${colors[1]}40`,
          }}
          animate={{
            scale: [0.8, 1.2, 0.8],
            opacity: [0.7, 1, 0.7],
          }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Data streams — thin lines radiating outward */}
        {[0, 60, 120, 180, 240, 300].map((angle, i) => (
          <motion.div
            key={`stream-${i}`}
            className="absolute"
            style={{
              width: 1,
              height: 12,
              background: `linear-gradient(to bottom, ${colors[i % colors.length]}80, transparent)`,
              top: "50%",
              left: "50%",
              transformOrigin: "top center",
              rotate: `${angle}deg`,
            }}
            animate={{
              height: [8, 18, 8],
              opacity: [0.2, 0.7, 0.2],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.25,
            }}
          />
        ))}
      </div>

      {/* Text label */}
      <div className="thought-block-wilson rounded-2xl px-4 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/60 block mb-1">
          Wilson
        </span>
        <motion.p
          className="text-xs text-muted-foreground/70 italic"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          {label}...
        </motion.p>
      </div>
    </div>
  );
};

export default NeuralNebula;
