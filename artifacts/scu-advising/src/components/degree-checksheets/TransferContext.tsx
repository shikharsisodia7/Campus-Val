import { createContext, useContext, type ReactNode } from "react";
import type { TransferSource } from "./AddToPlanningDialog";

/**
 * Lets any part of a checksheet's view (a spreadsheet row, a tracked item's note, the
 * document toolbar) offer "Add to planning" without knowing about the dialog or the plan.
 * Provided by the document card only when Planning Requirements are available beside it;
 * everywhere else `useTransfer()` is null and no such button is drawn.
 */
/** What a part of the view knows: the text and where in the document it was. The card adds which document. */
export type TransferStart = Omit<TransferSource, "documentId" | "documentTitle">;

const TransferContext = createContext<((source: TransferStart) => void) | null>(null);

export function TransferProvider({ start, children }: { start: ((source: TransferStart) => void) | null; children: ReactNode }) {
  return <TransferContext.Provider value={start}>{children}</TransferContext.Provider>;
}

export const useTransfer = () => useContext(TransferContext);
