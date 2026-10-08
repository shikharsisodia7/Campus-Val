/**
 * Autosave for tracking entries.
 *
 * Every change is saved without a Save button, so two things must hold:
 *
 *  1. ORDER. Responses can come back in any order, so at most ONE request per
 *     entry is in flight. Changes made meanwhile are merged and sent after it,
 *     carrying the revision the server just returned. An older request can
 *     never land on top of a newer value.
 *  2. NO LOSS. A change is only forgotten once the server has it. Typing is
 *     held for a moment (debounced) rather than sent per keystroke, and
 *     `flush()` sends whatever is waiting — before a document is collapsed,
 *     replaced, or the page is left.
 *
 * This module knows nothing about React or the network: it is given the three
 * calls it may make, and reports what is happening.
 */

export interface TrackingValues {
  itemLabel: string | null;
  status: string | null;
  term: string | null;
  termYear: number | null;
  note: string | null;
}

export interface AnchorInput {
  sheet?: number;
  block?: number;
  row?: number;
  col?: number;
  page?: number;
  x?: number;
  y?: number;
}

export interface SavedEntry {
  id: number;
  revision: number;
}

export interface CreateRequest extends Partial<TrackingValues> {
  anchorType: "sheet_cell" | "doc_cell" | "sheet_item" | "doc_item" | "point" | "manual";
  anchor?: AnchorInput;
}

export interface UpdateRequest extends Partial<TrackingValues> {
  anchor?: AnchorInput;
  keepAsListEntry?: boolean;
  expectedRevision?: number;
}

/** Thrown by `update` when the server holds a newer revision than the one sent. */
export class SaveConflict<T extends SavedEntry = SavedEntry> extends Error {
  constructor(public readonly current: T) {
    super("conflict");
    this.name = "SaveConflict";
  }
}

export interface SaveApi<T extends SavedEntry> {
  create(request: CreateRequest): Promise<T>;
  update(id: number, request: UpdateRequest): Promise<T>;
  remove(id: number): Promise<void>;
}

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export interface SaveState {
  status: SaveStatus;
  /** Entries whose last save failed and is waiting to be retried. */
  failedKeys: string[];
}

export interface QueueEvents<T extends SavedEntry> {
  onState(state: SaveState): void;
  /**
   * The server accepted a save for this entry. `superseded` is true when a newer change to the same
   * entry was queued while this one was on its way: the server's copy is already out of date, so
   * the screen should keep what the student just did rather than jump back to it.
   */
  onSaved(key: string, entry: T, info: { superseded: boolean }): void;
  /** The server removed this entry. */
  onRemoved(key: string): void;
  /** Someone else changed this entry; `current` is what the server holds. */
  onConflict(key: string, current: T): void;
}

type Change =
  | { kind: "save"; values: Partial<TrackingValues>; anchor?: AnchorInput; keepAsListEntry?: boolean }
  | { kind: "remove" };

interface Slot {
  id: number | null;
  revision: number | null;
  /** How to create the entry if the server does not have it yet. */
  origin: Pick<CreateRequest, "anchorType" | "anchor"> | null;
  pending: Change | null;
  failed: Change | null;
  inflight: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

function merge(earlier: Change | null, later: Change): Change {
  if (later.kind === "remove" || !earlier || earlier.kind === "remove") return later;
  return {
    kind: "save",
    values: { ...earlier.values, ...later.values },
    anchor: later.anchor ?? earlier.anchor,
    keepAsListEntry: later.keepAsListEntry ?? earlier.keepAsListEntry,
  };
}

export class TrackingSaveQueue<T extends SavedEntry = SavedEntry> {
  private readonly slots = new Map<string, Slot>();
  private lastOutcome: "saved" | "conflict" | null = null;
  private idleWaiters: (() => void)[] = [];

  constructor(
    private readonly api: SaveApi<T>,
    private readonly events: QueueEvents<T>,
  ) {}

  /** Tells the queue about an entry the server already has. */
  adopt(key: string, entry: SavedEntry): void {
    const slot = this.slot(key);
    // Never step back to an older revision than one this queue has seen.
    if (slot.revision !== null && slot.id === entry.id && entry.revision < slot.revision) return;
    slot.id = entry.id;
    slot.revision = entry.revision;
  }

  /** Tells the queue how a new, not yet saved entry is to be created. */
  declare(key: string, origin: Pick<CreateRequest, "anchorType" | "anchor">): void {
    const slot = this.slot(key);
    if (slot.id === null) slot.origin = origin;
  }

  save(key: string, values: Partial<TrackingValues>, options: { delayMs?: number; anchor?: AnchorInput; keepAsListEntry?: boolean } = {}): void {
    this.enqueue(key, { kind: "save", values, anchor: options.anchor, keepAsListEntry: options.keepAsListEntry }, options.delayMs ?? 0);
  }

  remove(key: string): void {
    this.enqueue(key, { kind: "remove" }, 0);
  }

  /** Sends everything that is waiting, now, and resolves when nothing is in flight. */
  async flush(): Promise<void> {
    for (const [key, slot] of this.slots) {
      if (slot.timer) {
        clearTimeout(slot.timer);
        slot.timer = null;
        void this.run(key);
      }
    }
    if (!this.busy()) return;
    await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  /** Tries again everything that failed. */
  retry(): void {
    for (const [key, slot] of this.slots) {
      if (!slot.failed) continue;
      slot.pending = slot.pending ? merge(slot.failed, slot.pending) : slot.failed;
      slot.failed = null;
      void this.run(key);
    }
    this.report();
  }

  /** True while a change has not reached the server: waiting, in flight, or failed. */
  hasUnsaved(): boolean {
    for (const slot of this.slots.values()) {
      if (slot.pending || slot.inflight || slot.failed || slot.timer) return true;
    }
    return false;
  }

  /** Forgets everything. For when the document's tracking is reloaded from the server. */
  reset(): void {
    for (const slot of this.slots.values()) if (slot.timer) clearTimeout(slot.timer);
    this.slots.clear();
    this.lastOutcome = null;
    this.report();
  }

  private slot(key: string): Slot {
    let slot = this.slots.get(key);
    if (!slot) {
      slot = { id: null, revision: null, origin: null, pending: null, failed: null, inflight: false, timer: null };
      this.slots.set(key, slot);
    }
    return slot;
  }

  private busy(): boolean {
    for (const slot of this.slots.values()) if (slot.pending || slot.inflight || slot.timer) return true;
    return false;
  }

  private enqueue(key: string, change: Change, delayMs: number): void {
    const slot = this.slot(key);
    // A new change supersedes a failed one for the same entry: it carries the latest values.
    const base = slot.failed ? merge(slot.failed, slot.pending ?? change) : slot.pending;
    slot.failed = null;
    slot.pending = merge(base, change);
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
    if (delayMs > 0) {
      slot.timer = setTimeout(() => {
        slot.timer = null;
        void this.run(key);
      }, delayMs);
    } else {
      void this.run(key);
    }
    this.report();
  }

  private async run(key: string): Promise<void> {
    const slot = this.slot(key);
    if (slot.inflight || !slot.pending) return;
    const change = slot.pending;
    slot.pending = null;
    slot.inflight = true;
    this.report();

    try {
      if (change.kind === "remove") {
        if (slot.id !== null) await this.api.remove(slot.id);
        this.slots.delete(key);
        // Anything queued behind a removal has nothing left to apply to.
        this.lastOutcome = "saved";
        this.events.onRemoved(key);
      } else if (slot.id === null) {
        if (!slot.origin) throw new Error("No way to create this entry.");
        const saved = await this.api.create({ ...slot.origin, ...change.values, ...(change.anchor ? { anchor: change.anchor } : {}) });
        slot.id = saved.id;
        slot.revision = saved.revision;
        slot.origin = null;
        this.lastOutcome = "saved";
        this.events.onSaved(key, saved, { superseded: slot.pending !== null });
      } else {
        const saved = await this.api.update(slot.id, {
          ...change.values,
          ...(change.anchor ? { anchor: change.anchor } : {}),
          ...(change.keepAsListEntry ? { keepAsListEntry: true } : {}),
          ...(slot.revision !== null ? { expectedRevision: slot.revision } : {}),
        });
        slot.revision = saved.revision;
        this.lastOutcome = "saved";
        this.events.onSaved(key, saved, { superseded: slot.pending !== null });
      }
    } catch (err) {
      if (err instanceof SaveConflict) {
        // The server's copy is newer than the one this change was made against.
        // It wins; what was typed here since is dropped rather than forced over it.
        slot.id = err.current.id;
        slot.revision = err.current.revision;
        slot.pending = null;
        this.lastOutcome = "conflict";
        this.events.onConflict(key, err.current as T);
      } else {
        slot.failed = slot.pending ? merge(change, slot.pending) : change;
        slot.pending = null;
      }
    } finally {
      const current = this.slots.get(key);
      if (current) current.inflight = false;
    }

    const after = this.slots.get(key);
    if (after?.pending && !after.timer) void this.run(key);
    this.report();
    if (!this.busy()) {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const resolve of waiters) resolve();
    }
  }

  private report(): void {
    const failedKeys = [...this.slots].filter(([, slot]) => slot.failed).map(([key]) => key);
    let status: SaveStatus;
    if (this.busy()) status = "saving";
    else if (failedKeys.length > 0) status = "error";
    else status = this.lastOutcome ?? "idle";
    this.events.onState({ status, failedKeys });
  }
}
