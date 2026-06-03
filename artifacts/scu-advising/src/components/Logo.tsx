interface LogoProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

/**
 * CampusVal Bronco mark — a cardinal-and-gold bronco head emblem evoking
 * SCU's Bronco spirit. Original artwork, not the official athletics mark.
 */
export function Logo({ size = 40, className = "", animated: _animated = false }: LogoProps) {
  return (
    <img
      src="/logo.svg"
      width={size}
      height={size}
      alt="CampusVal Bronco logo"
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
