/**
 * CampusVal mobile design tokens — derived from the sibling web artifact's
 * CSS custom properties (artifacts/scu-advising/src/index.css).
 *
 * Primary: SCU Cardinal Red (#8C1515)
 * Secondary: SCU Gold (#B4884B)
 */

const colors = {
  light: {
    // Legacy alias
    text: '#1A1A1A',
    tint: '#8C1515',

    // Core surfaces
    background: '#FAF8F5',   // hsl(40 33% 98%) — warm off-white
    foreground: '#1A1A1A',   // hsl(0 0% 10%)

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#1A1A1A',

    // Primary — SCU Cardinal Red
    primary: '#8C1515',       // hsl(353 74% 32%)
    primaryForeground: '#FFFFFF',

    // Secondary — SCU Gold
    secondary: '#B4884B',     // hsl(35 41% 50%)
    secondaryForeground: '#FFFFFF',

    // Muted / subdued
    muted: '#F2EDE3',         // hsl(35 20% 95%)
    mutedForeground: '#666666', // hsl(0 0% 40%)

    // Accent
    accent: '#EDE5D5',        // hsl(35 30% 92%)
    accentForeground: '#8C1515',

    // Destructive
    destructive: '#EF4444',
    destructiveForeground: '#FFFFFF',

    // Borders and inputs
    border: '#DDD5C5',        // hsl(35 20% 85%)
    input: '#CEC5B5',         // hsl(35 20% 80%)
  },

  dark: {
    text: '#F2F2F2',
    tint: '#B31C20',

    background: '#121212',
    foreground: '#F2F2F2',

    card: '#1E1E1E',
    cardForeground: '#F2F2F2',

    primary: '#B31C20',       // hsl(353 74% 40%) — slightly lighter for dark
    primaryForeground: '#FFFFFF',

    secondary: '#8D6B2E',
    secondaryForeground: '#FFFFFF',

    muted: '#262626',
    mutedForeground: '#A6A6A6',

    accent: '#2A2520',
    accentForeground: '#F2F2F2',

    destructive: '#EF4444',
    destructiveForeground: '#FFFFFF',

    border: '#333333',
    input: '#333333',
  },

  // Border radius (matches --radius: 0.5rem = 8px in web CSS)
  radius: 8,
};

export default colors;
