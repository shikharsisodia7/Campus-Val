import { useId } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSetMajorTrack, type RequirementGroupVariants } from "@workspace/api-client-react";

/**
 * The track / emphasis / concentration a student follows in a major, chosen from the ones the
 * Bulletin defines. Planning intent only (it never declares anything with SCU): it decides which
 * track's requirements the list below shows. Generic: every major with tracks gets the same control.
 */
export function TrackPicker({ variants }: { variants: NonNullable<RequirementGroupVariants> }) {
  const id = useId();
  const queryClient = useQueryClient();
  const setTrack = useSetMajorTrack({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({
          predicate: (q) => /^\/api\/(plans|requirements|profile)/.test(String(q.queryKey[0])),
        }),
    },
  });
  const kind = variants.kind;
  const selected = variants.selected ?? "";
  return (
    <div className="rounded-md border border-border bg-muted/20 px-1.5 py-1.5" data-testid={`track-picker-${variants.major}`}>
      <label htmlFor={id} className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Your {kind}
        {variants.required ? " (the Bulletin requires one)" : " (optional)"}
      </label>
      <select
        id={id}
        className="mt-1 h-7 w-full rounded-md border border-input bg-background px-1.5 text-[11px]"
        value={selected}
        disabled={setTrack.isPending}
        onChange={(e) => setTrack.mutate({ data: { major: variants.major, track: e.target.value || null } })}
        data-testid={`track-select-${variants.major}`}
      >
        <option value="">{variants.required ? `Choose your ${kind}…` : `No ${kind}`}</option>
        {variants.options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      {variants.note && <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{variants.note}</p>}
      {setTrack.isError && (
        <p role="alert" className="mt-1 text-[10px] text-amber-800">
          Your {kind} couldn&apos;t be saved. Try again.
        </p>
      )}
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">Planning only — this does not declare a {kind} with SCU.</p>
    </div>
  );
}
