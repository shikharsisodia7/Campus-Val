interface LogoProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

/**
 * CampusVal Bronco mark — served from public/logo-bronco.png (optimized 256px,
 * ~23KB) as a static public asset, so it is NOT bundled into the JS and stays
 * cheap for the landing page while looking like a real bronco.
 */
export function Logo({ size = 40, className = "", animated: _animated = false }: LogoProps) {
  return (
    <img
      src="/logo-bronco.png"
      width={size}
      height={size}
      alt="CampusVal Bronco logo"
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
