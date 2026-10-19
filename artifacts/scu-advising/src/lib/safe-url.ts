import { safeExternalUrl as safeExternalUrlOrNull } from "@workspace/api-client-react";

/**
 * The href for a link whose address came from stored data (a department
 * note's source, a sample plan's source, a student's feedback), or undefined
 * when it is not a plain http(s) address: a javascript:, data: or other scheme
 * would run or render content on click. Same rule as the checksheet links
 * (lib/api-client-react checksheets/format.ts), returned in the shape an
 * `href` takes. Servers validate these too; this is the check at the point of use.
 */
export function safeExternalUrl(value: string | null | undefined): string | undefined {
  return safeExternalUrlOrNull(value?.trim()) ?? undefined;
}
