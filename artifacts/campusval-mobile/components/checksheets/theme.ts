import { StyleSheet } from 'react-native';
import type { useColors } from '@/hooks/useColors';

export type Colors = ReturnType<typeof useColors>;

/** The smallest size anything that can be pressed is given. */
export const TOUCH = 44;

export function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    scroll: { paddingHorizontal: 16 },

    screenTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', color: colors.foreground },
    lead: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 4 },
    body: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', color: colors.foreground },
    small: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
    strong: { fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginBottom: 6, marginTop: 14 },

    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 4,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
      overflow: 'hidden',
    },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 10, minHeight: TOUCH },
    cardTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    cardBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 12 },

    notice: {
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.accent,
      padding: 12,
      gap: 6,
    },
    warning: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
    warningText: { color: '#78350F' },

    button: {
      minHeight: TOUCH,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    primary: { backgroundColor: colors.primary },
    primaryText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    outline: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    outlineText: { color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 14 },
    danger: { borderWidth: 1, borderColor: '#DC2626', backgroundColor: colors.card },
    dangerText: { color: '#B91C1C', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    disabled: { opacity: 0.5 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

    input: {
      minHeight: TOUCH,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      color: colors.foreground,
      backgroundColor: colors.card,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      minHeight: TOUCH,
      paddingHorizontal: 14,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipOn: { borderColor: colors.primary, backgroundColor: colors.primary },
    chipText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.foreground },
    chipTextOn: { color: '#FFFFFF' },

    sheet: { flex: 1, backgroundColor: colors.background },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      minHeight: 56,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sheetTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: colors.foreground, flex: 1 },
    sheetBody: { padding: 16, paddingBottom: 48 },
    iconButton: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },

    // The department's document
    grid: { borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card },
    gridRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    rowNumber: {
      alignItems: 'flex-end',
      justifyContent: 'flex-start',
      paddingHorizontal: 4,
      paddingVertical: 6,
      backgroundColor: colors.accent,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.border,
    },
    rowNumberText: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    box: {
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.border,
      justifyContent: 'flex-start',
    },
    boxFilled: { backgroundColor: colors.accent },
    boxText: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular', color: colors.foreground },
    boxBold: { fontFamily: 'Inter_600SemiBold' },
    boxPickable: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary },

    // The student's own tracking
    mine: { backgroundColor: '#FDF2F4', borderColor: colors.primary, borderWidth: 1, borderRadius: 6, padding: 6, minHeight: TOUCH },
    mineTag: { fontSize: 10, letterSpacing: 0.5, fontFamily: 'Inter_700Bold', color: colors.primary },
    mineValue: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.foreground, marginTop: 2 },
    mineEmpty: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },

    entry: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      minHeight: TOUCH,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    marker: {
      position: 'absolute',
      minWidth: 30,
      height: 30,
      borderRadius: 15,
      paddingHorizontal: 6,
      marginLeft: -15,
      marginTop: -15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderWidth: 2,
      borderColor: '#FFFFFF',
    },
    markerText: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Inter_700Bold' },
    tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  });
}

export type Styles = ReturnType<typeof makeStyles>;
