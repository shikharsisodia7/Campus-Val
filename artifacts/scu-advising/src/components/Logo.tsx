interface LogoProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

/**
 * CampusVal Bronco mark — served from the public/logo.svg vector asset.
 * Using the SVG avoids bundling the large raster PNG for the landing page.
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
