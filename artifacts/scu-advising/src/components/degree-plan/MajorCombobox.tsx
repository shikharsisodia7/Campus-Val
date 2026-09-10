import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MajorOption } from "@workspace/api-client-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/**
 * Searchable major picker used by the "Set / Change Primary Major" control in
 * Plan Controls. Mirrors onboarding's MajorPicker (Command + Popover) so the
 * two behave identically, but is self-contained and keyboard-accessible:
 * Enter/Space opens, typing filters, Enter selects, Escape closes and returns
 * focus to the trigger (Radix Popover handles focus return).
 *
 * `value` and the emitted `onChange` value are always the major CODE (e.g.
 * "CHEM"), matching how the profile major and additionalMajors are stored.
 */
export function MajorCombobox({
  value,
  onChange,
  options,
  placeholder = "Select major…",
  disabled,
  testId,
  ariaLabel,
}: {
  value: string;
  onChange: (code: string) => void;
  options: MajorOption[];
  placeholder?: string;
  disabled?: boolean;
  testId?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(
    (o) => o.code === value || o.title === value,
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          data-testid={testId}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors",
            "hover:bg-accent/30 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <span
            className={cn(
              "truncate text-left",
              !selected && "text-muted-foreground",
            )}
          >
            {selected ? selected.title : value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search majors…" />
          <CommandList>
            <CommandEmpty>No majors match.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.code}
                  value={`${o.code} ${o.title}`}
                  onSelect={() => {
                    onChange(o.code);
                    setOpen(false);
                  }}
                  data-testid={`major-option-${o.code}`}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selected?.code === o.code ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="mr-2 font-mono text-xs text-muted-foreground">
                    {o.code}
                  </span>
                  <span className="truncate">{o.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
