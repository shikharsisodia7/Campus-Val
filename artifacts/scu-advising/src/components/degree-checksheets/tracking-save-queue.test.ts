/**
 * Autosave: nothing is lost, and an older save never lands on a newer value.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SaveConflict,
  TrackingSaveQueue,
  type CreateRequest,
  type SaveState,
  type SavedEntry,
  type UpdateRequest,
} from "./tracking-save-queue";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Call =
  | { kind: "create"; request: CreateRequest; done: Deferred<SavedEntry> }
  | { kind: "update"; id: number; request: UpdateRequest; done: Deferred<SavedEntry> }
  | { kind: "remove"; id: number; done: Deferred<void> };

function harness() {
  const calls: Call[] = [];
  const states: SaveState[] = [];
  const saved: [string, SavedEntry][] = [];
  const removed: string[] = [];
  const conflicts: [string, SavedEntry][] = [];
  const queue = new TrackingSaveQueue(
    {
      create: (request) => {
        const done = deferred<SavedEntry>();
        calls.push({ kind: "create", request, done });
        return done.promise;
      },
      update: (id, request) => {
        const done = deferred<SavedEntry>();
        calls.push({ kind: "update", id, request, done });
        return done.promise;
      },
      remove: (id) => {
        const done = deferred<void>();
        calls.push({ kind: "remove", id, done });
        return done.promise;
      },
    },
    {
      onState: (state) => states.push(state),
      onSaved: (key, entry) => saved.push([key, entry]),
      onRemoved: (key) => removed.push(key),
      onConflict: (key, current) => conflicts.push([key, current]),
    },
  );
  const status = () => states[states.length - 1]?.status;
  /** Lets every settled promise run its continuation. */
  const settle = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  return { queue, calls, states, saved, removed, conflicts, status, settle };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("saving an entry the server already has", () => {
  it("sends the change with the revision it was based on, and reports Saving then Saved", async () => {
    const h = harness();
    h.queue.adopt("id:7", { id: 7, revision: 3 });
    h.queue.save("id:7", { status: "completed" });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ kind: "update", id: 7, request: { status: "completed", expectedRevision: 3 } });
    expect(h.status()).toBe("saving");

    h.calls[0]!.done.resolve({ id: 7, revision: 4 } as never);
    await h.settle();
    expect(h.status()).toBe("saved");
    expect(h.saved).toEqual([["id:7", { id: 7, revision: 4 }]]);
    expect(h.queue.hasUnsaved()).toBe(false);
  });

  it("uses the NEW revision for the next save", async () => {
    const h = harness();
    h.queue.adopt("id:7", { id: 7, revision: 3 });
    h.queue.save("id:7", { status: "planned" });
    h.calls[0]!.done.resolve({ id: 7, revision: 4 } as never);
    await h.settle();
    h.queue.save("id:7", { status: "completed" });
    expect(h.calls[1]).toMatchObject({ request: { status: "completed", expectedRevision: 4 } });
  });
});

describe("order: an older save can never overwrite a newer value", () => {
  it("keeps ONE request in flight per entry and sends later changes after it", async () => {
    const h = harness();
    h.queue.adopt("id:7", { id: 7, revision: 1 });
    h.queue.save("id:7", { status: "planned" });
    h.queue.save("id:7", { status: "in_progress" });
    h.queue.save("id:7", { status: "completed" });
    // Only the first has gone out; the rest wait for it.
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ request: { status: "planned", expectedRevision: 1 } });

    h.calls[0]!.done.resolve({ id: 7, revision: 2 } as never);
    await h.settle();
    // The two waiting changes went out as ONE request carrying the latest value.
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]).toMatchObject({ request: { status: "completed", expectedRevision: 2 } });

    h.calls[1]!.done.resolve({ id: 7, revision: 3 } as never);
    await h.settle();
    expect(h.calls).toHaveLength(2);
    expect(h.status()).toBe("saved");
  });

  it("merges changes to different fields made while a save is in flight", async () => {
    const h = harness();
    h.queue.adopt("id:7", { id: 7, revision: 1 });
    h.queue.save("id:7", { status: "planned" });
    h.queue.save("id:7", { term: "fall", termYear: 2026 });
    h.queue.save("id:7", { note: "with lab" });
    h.calls[0]!.done.resolve({ id: 7, revision: 2 } as never);
    await h.settle();
    expect(h.calls[1]!.kind === "update" && h.calls[1]!.request).toEqual({
      term: "fall",
      termYear: 2026,
      note: "with lab",
      expectedRevision: 2,
    });
  });

  it("saves different entries independently, at the same time", () => {
    const h = harness();
    h.queue.adopt("id:1", { id: 1, revision: 1 });
    h.queue.adopt("id:2", { id: 2, revision: 1 });
    h.queue.save("id:1", { status: "planned" });
    h.queue.save("id:2", { status: "completed" });
    expect(h.calls.map((c) => c.kind === "update" && c.id)).toEqual([1, 2]);
  });

  it("never steps back to an older revision", async () => {
    const h = harness();
    h.queue.adopt("id:7", { id: 7, revision: 5 });
    // A stale list arrives (loaded before the last save).
    h.queue.adopt("id:7", { id: 7, revision: 3 });
    h.queue.save("id:7", { status: "planned" });
    expect(h.calls[0]).toMatchObject({ request: { expectedRevision: 5 } });
  });
});

describe("typing", () => {
  it("waits for a pause instead of saving every keystroke", async () => {
    const h = harness();
    h.queue.adopt("id:7", { id: 7, revision: 1 });
    for (const note of ["T", "To", "Too", "Took", "Took w", "Took with lab"]) {
      h.queue.save("id:7", { note }, { delayMs: 700 });
      vi.advanceTimersByTime(100);
    }
    expect(h.calls).toHaveLength(0);
    expect(h.status()).toBe("saving");
    expect(h.queue.hasUnsaved()).toBe(true);

    vi.advanceTimersByTime(700);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ request: { note: "Took with lab" } });
  });

  it("a choice made while a note is waiting is sent at once, together with the note", () => {
    const h = harness();
    h.queue.adopt("id:7", { id: 7, revision: 1 });
    h.queue.save("id:7", { note: "draft" }, { delayMs: 700 });
    h.queue.save("id:7", { status: "completed" });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ request: { note: "draft", status: "completed" } });
    vi.advanceTimersByTime(2000);
    expect(h.calls).toHaveLength(1);
  });

  it("flush sends what is waiting and resolves only when it has been saved", async () => {
    const h = harness();
    h.queue.adopt("id:7", { id: 7, revision: 1 });
    h.queue.save("id:7", { note: "almost lost" }, { delayMs: 700 });
    let flushed = false;
    void h.queue.flush().then(() => (flushed = true));
    expect(h.calls).toHaveLength(1);
    await h.settle();
    expect(flushed).toBe(false);

    h.calls[0]!.done.resolve({ id: 7, revision: 2 } as never);
    await h.settle();
    expect(flushed).toBe(true);
    expect(h.queue.hasUnsaved()).toBe(false);
  });

  it("flush with nothing waiting resolves immediately", async () => {
    const h = harness();
    let flushed = false;
    void h.queue.flush().then(() => (flushed = true));
    await h.settle();
    expect(flushed).toBe(true);
  });
});

describe("a new entry", () => {
  it("is created once, and edits made before the server answers become an update", async () => {
    const h = harness();
    h.queue.declare("sheet:0:4:2", { anchorType: "sheet_cell", anchor: { sheet: 0, row: 4, col: 2 } });
    h.queue.save("sheet:0:4:2", { status: "planned" });
    h.queue.save("sheet:0:4:2", { status: "completed" });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({
      kind: "create",
      request: { anchorType: "sheet_cell", anchor: { sheet: 0, row: 4, col: 2 }, status: "planned" },
    });

    h.calls[0]!.done.resolve({ id: 41, revision: 1 } as never);
    await h.settle();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]).toMatchObject({ kind: "update", id: 41, request: { status: "completed", expectedRevision: 1 } });
  });

  it("removed before it was ever saved makes no request about it afterwards", async () => {
    const h = harness();
    h.queue.declare("new:1", { anchorType: "manual", anchor: {} });
    h.queue.save("new:1", { itemLabel: "Elective" }, { delayMs: 700 });
    h.queue.remove("new:1");
    expect(h.calls).toHaveLength(0);
    await h.settle();
    expect(h.removed).toEqual(["new:1"]);
    vi.advanceTimersByTime(2000);
    expect(h.calls).toHaveLength(0);
    expect(h.queue.hasUnsaved()).toBe(false);
  });

  it("removed while its creation is in flight is deleted once it exists", async () => {
    const h = harness();
    h.queue.declare("new:1", { anchorType: "point", anchor: { page: 0, x: 0.5, y: 0.5 } });
    h.queue.save("new:1", { status: "planned" });
    h.queue.remove("new:1");
    expect(h.calls.map((c) => c.kind)).toEqual(["create"]);
    h.calls[0]!.done.resolve({ id: 9, revision: 1 } as never);
    await h.settle();
    expect(h.calls.map((c) => c.kind)).toEqual(["create", "remove"]);
    expect(h.calls[1]).toMatchObject({ id: 9 });
  });
});

describe("moving a marker", () => {
  it("sends the new position, and only the last of several nudges", async () => {
    const h = harness();
    h.queue.adopt("id:3", { id: 3, revision: 1 });
    h.queue.save("id:3", {}, { anchor: { page: 0, x: 0.51, y: 0.2 }, delayMs: 700 });
    h.queue.save("id:3", {}, { anchor: { page: 0, x: 0.52, y: 0.2 }, delayMs: 700 });
    h.queue.save("id:3", {}, { anchor: { page: 0, x: 0.53, y: 0.2 }, delayMs: 700 });
    vi.advanceTimersByTime(700);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ request: { anchor: { page: 0, x: 0.53, y: 0.2 }, expectedRevision: 1 } });
  });

  it("keeps a detached entry as a list entry", () => {
    const h = harness();
    h.queue.adopt("id:3", { id: 3, revision: 2 });
    h.queue.save("id:3", {}, { keepAsListEntry: true });
    expect(h.calls[0]).toMatchObject({ request: { keepAsListEntry: true, expectedRevision: 2 } });
  });
});

describe("when a save fails", () => {
  it("reports it, keeps the change, and sends it again on retry", async () => {
    const h = harness();
    h.queue.adopt("id:7", { id: 7, revision: 1 });
    h.queue.save("id:7", { status: "completed" });
    h.calls[0]!.done.reject(new Error("network"));
    await h.settle();
    expect(h.states[h.states.length - 1]).toEqual({ status: "error", failedKeys: ["id:7"] });
    expect(h.queue.hasUnsaved()).toBe(true);

    h.queue.retry();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]).toMatchObject({ request: { status: "completed", expectedRevision: 1 } });
    h.calls[1]!.done.resolve({ id: 7, revision: 2 } as never);
    await h.settle();
    expect(h.status()).toBe("saved");
    expect(h.queue.hasUnsaved()).toBe(false);
  });

  it("a newer change replaces the failed one rather than being sent after it", async () => {
    const h = harness();
    h.queue.adopt("id:7", { id: 7, revision: 1 });
    h.queue.save("id:7", { status: "planned", note: "first" });
    h.calls[0]!.done.reject(new Error("network"));
    await h.settle();

    h.queue.save("id:7", { status: "completed" });
    expect(h.calls).toHaveLength(2);
    // The failed note is not lost; the status is the newer one.
    expect(h.calls[1]!.kind === "update" && h.calls[1]!.request).toEqual({
      status: "completed",
      note: "first",
      expectedRevision: 1,
    });
  });

  it("keeps changes made during a save that then fails", async () => {
    const h = harness();
    h.queue.adopt("id:7", { id: 7, revision: 1 });
    h.queue.save("id:7", { status: "planned" });
    h.queue.save("id:7", { note: "typed meanwhile" });
    h.calls[0]!.done.reject(new Error("network"));
    await h.settle();
    expect(h.calls).toHaveLength(1);
    h.queue.retry();
    expect(h.calls[1]!.kind === "update" && h.calls[1]!.request).toEqual({
      status: "planned",
      note: "typed meanwhile",
      expectedRevision: 1,
    });
  });

  it("one entry failing does not stop another from saving", async () => {
    const h = harness();
    h.queue.adopt("id:1", { id: 1, revision: 1 });
    h.queue.adopt("id:2", { id: 2, revision: 1 });
    h.queue.save("id:1", { status: "planned" });
    h.calls[0]!.done.reject(new Error("network"));
    await h.settle();
    h.queue.save("id:2", { status: "completed" });
    h.calls[1]!.done.resolve({ id: 2, revision: 2 } as never);
    await h.settle();
    expect(h.saved).toEqual([["id:2", { id: 2, revision: 2 }]]);
    expect(h.states[h.states.length - 1]).toEqual({ status: "error", failedKeys: ["id:1"] });
  });
});

describe("when the entry was changed somewhere else", () => {
  it("takes the server's version and does not force the local change over it", async () => {
    const h = harness();
    h.queue.adopt("id:7", { id: 7, revision: 1 });
    h.queue.save("id:7", { status: "planned" });
    h.queue.save("id:7", { note: "typed meanwhile" });
    h.calls[0]!.done.reject(new SaveConflict({ id: 7, revision: 6 }));
    await h.settle();

    expect(h.conflicts).toEqual([["id:7", { id: 7, revision: 6 }]]);
    expect(h.status()).toBe("conflict");
    // Nothing further is sent on the back of the rejected change...
    expect(h.calls).toHaveLength(1);
    expect(h.queue.hasUnsaved()).toBe(false);
    // ...and the next change the student makes is based on the server's revision.
    h.queue.save("id:7", { status: "completed" });
    expect(h.calls[1]).toMatchObject({ request: { status: "completed", expectedRevision: 6 } });
  });
});

describe("reset", () => {
  it("forgets waiting work, so a reloaded document starts clean", () => {
    const h = harness();
    h.queue.adopt("id:7", { id: 7, revision: 1 });
    h.queue.save("id:7", { note: "x" }, { delayMs: 700 });
    h.queue.reset();
    vi.advanceTimersByTime(2000);
    expect(h.calls).toHaveLength(0);
    expect(h.queue.hasUnsaved()).toBe(false);
    expect(h.status()).toBe("idle");
  });
});
