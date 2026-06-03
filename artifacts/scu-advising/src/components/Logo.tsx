import { motion } from "framer-motion";
import broncoLogo from "@/assets/bronco-logo.png";

interface LogoProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

/**
 * CampusVal Bronco mark — a cardinal-and-gold bronco head emblem evoking
 * SCU's Bronco spirit. Original artwork, not the official athletics mark.
 */
export function Logo({ size = 40, className = "", animated = false }: LogoProps) {
  const img = (
    <img
      src={broncoLogo}
      width={size}
      height={size}
      alt="CampusVal Bronco logo"
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );

  if (!animated) return img;
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 18 }}
      className="inline-flex"
    >
      {img}
    </motion.div>
  );
}
