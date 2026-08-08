import type { CompletionSource } from "@workspace/api-client-react";

/** Student-asserted provenance choices for completed/prior coursework. */
export const COMPLETION_SOURCE_OPTIONS: { value: CompletionSource; label: string }[] = [
  { value: "prior_to_scu", label: "Prior to SCU" },
  { value: "transfer_credit", label: "Transfer Credit" },
  { value: "ap_ib_test_credit", label: "AP/IB/Test Credit" },
  { value: "previously_completed_scu", label: "Previously Completed at SCU" },
  { value: "other_institution", label: "Other Institution" },
  { value: "manually_marked", label: "Manually Marked Completed" },
];

export const COMPLETION_SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  COMPLETION_SOURCE_OPTIONS.map((o) => [o.value, o.label]),
);
