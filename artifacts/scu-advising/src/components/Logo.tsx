import { motion } from "framer-motion";

interface LogoProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

/**
 * CampusVal mark — original shield + mission bell motif evoking SCU's
 * Mission Santa Clara heritage without copying the university seal.
 * Cardinal (#8C1515) shield, gold (#B08850) bell + star, "CV" monogram.
 */
export function Logo({ size = 40, className = "", animated = true }: LogoProps) {
  const inner = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="CampusVal logo"
      role="img"
    >
      <defs>
        <linearGradient id="cv-shield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A21D1D" />
          <stop offset="100%" stopColor="#8C1515" />
        </linearGradient>
        <linearGradient id="cv-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#D4AC6B" />
          <stop offset="100%" stopColor="#B08850" />
        </linearGradient>
        <filter id="cv-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.4" />
        </filter>
      </defs>

      {/* Shield */}
      <path
        d="M32 2 L58 10 L58 30 C58 46 47 58 32 62 C17 58 6 46 6 30 L6 10 Z"
        fill="url(#cv-shield)"
        stroke="#6B0F0F"
        strokeWidth="1"
      />

      {/* Inner gold border */}
      <path
        d="M32 6 L54 12.5 L54 30 C54 43.5 44.5 54 32 57.5 C19.5 54 10 43.5 10 30 L10 12.5 Z"
        fill="none"
        stroke="url(#cv-gold)"
        strokeWidth="1"
        opacity="0.7"
      />

      {/* Mission bell silhouette */}
      <g transform="translate(32 22)" filter="url(#cv-soft)">
        <path
          d="M-7 8 C-7 1 -4 -5 0 -5 C4 -5 7 1 7 8 L8 9 L-8 9 Z"
          fill="url(#cv-gold)"
        />
        <rect x="-9" y="9" width="18" height="2" rx="0.5" fill="url(#cv-gold)" />
        <circle cx="0" cy="13" r="1.6" fill="url(#cv-gold)" />
      </g>

      {/* CV monogram */}
      <text
        x="32"
        y="50"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontWeight="700"
        fontSize="13"
        fill="#F8F1E4"
        letterSpacing="0.5"
      >
        CV
      </text>

      {/* Gold star — represents student / north star */}
      <g transform="translate(32 56)">
        <polygon
          points="0,-2.4 0.7,-0.7 2.4,-0.7 1,0.3 1.5,2 0,1 -1.5,2 -1,0.3 -2.4,-0.7 -0.7,-0.7"
          fill="url(#cv-gold)"
        />
      </g>
    </svg>
  );

  if (!animated) return inner;
  return (
    <motion.div
      initial={{ rotate: -8, scale: 0.85, opacity: 0 }}
      animate={{ rotate: 0, scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 16 }}
      whileHover={{ scale: 1.08, rotate: 2 }}
      className="inline-flex"
    >
      {inner}
    </motion.div>
  );
}
