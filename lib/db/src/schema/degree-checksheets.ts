import { pgTable, text, serial, integer, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * DEGREE CHECKSHEETS — department advising documents a student uploads (major
 * and minor checksheets, four-year plans, flowcharts, advising guides), many
 * per user.
 *
 * Two tables, and the split is the whole design:
 *
 *   degree_checksheet_documents    the SOURCE. The uploaded file (in private
 *                                  storage) plus `render`, a display-only
 *                                  structural copy of it. Never edited by
 *                                  anything the student does while tracking.
 *   degree_checksheet_annotations  the STUDENT'S TRACKING. Status, quarter and
 *                                  notes, each tied to a place in one document.
 *
 * Nothing writes from the second table into the first, so the department's
 * document is always shown as it was uploaded.
 *
 * Descriptive metadata only. `category`, `program_name`, `program_role`,
 * `school`, `academic_year_label` and `source_url` are what the STUDENT says
 * about the document. They are kept so a later feature can tell sources apart;
 * nothing reads them to decide which requirements apply to anyone.
 *
 *   render_status    the FILE state, not an academic one:
 *                    "ready" (a preview exists) | "original_only" (stored and
 *                    downloadable, no preview) | "failed"
 *   uploaded_at      when the CURRENT file was added; a replacement moves it.
 *   tracking_cell_count  how many cells of the render accept tracking in place.
 *                    Derived with the render, so a list never has to load it.
 *   source_version   starts at 1, +1 on every replacement. Annotations record
 *                    the version they were made against.
 *   category         free text on purpose, so a new kind of resource never
 *                    needs a schema change.
 */
export const degreeChecksheetDocumentsTable = pgTable(
  "degree_checksheet_documents",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull().default("other"),
    programName: text("program_name"),
    programRole: text("program_role"),
    school: text("school"),
    academicYearLabel: text("academic_year_label"),
    sourceUrl: text("source_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    originalFilename: text("original_filename").notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: text("mime_type").notNull(),
    sourceFormat: text("source_format").notNull(),
    fileHash: text("file_hash").notNull(),
    objectPath: text("object_path").notNull(),
    sourceVersion: integer("source_version").notNull().default(1),
    renderStatus: text("render_status").notNull().default("ready"),
    renderNote: text("render_note"),
    render: jsonb("render"),
    trackingCellCount: integer("tracking_cell_count").notNull().default(0),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("degree_checksheet_documents_user_order_idx").on(t.userId, t.sortOrder, t.id)],
);

/**
 * One tracking entry. `user_id` repeats the document's owner deliberately:
 * every annotation query is scoped by it directly, so a mistake in a join can
 * never widen what a caller sees.
 *
 *   anchor_type   "sheet_row"  a row of a worksheet          { sheet, row }
 *                 "doc_block"  a block / table row of a DOCX { block, row? }
 *                 "point"      a place on a PDF page or image { page, x, y } (0..1)
 *                 "manual"     the student's own list entry  {}
 *   anchor_key    canonical text of a row/block anchor. Unique per document, so
 *                 one place holds one entry. NULL for points and manual entries,
 *                 which may be as many as the student likes.
 *   anchor_fingerprint  hash of what the source showed at that place when the
 *                 entry was made. Used ONLY when the file is replaced, to check
 *                 the place still holds the same thing.
 *   detached_at   set when a replacement made the anchor unsafe. A detached
 *                 entry is never drawn over the source; the student re-links
 *                 or removes it.
 *   status        not_started | planned | in_progress | completed | NULL
 *   term, term_year  fall | winter | spring | summer and the CALENDAR year
 *                 ("winter", 2027 = Winter 2027), or both NULL.
 *   revision      +1 on every change; lets a save refuse to overwrite a newer one.
 */
export const degreeChecksheetAnnotationsTable = pgTable(
  "degree_checksheet_annotations",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => degreeChecksheetDocumentsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    anchorType: text("anchor_type").notNull(),
    anchor: jsonb("anchor").notNull().default({}),
    anchorKey: text("anchor_key"),
    anchorFingerprint: text("anchor_fingerprint"),
    sourceVersion: integer("source_version").notNull().default(1),
    detachedAt: timestamp("detached_at", { withTimezone: true }),
    itemLabel: text("item_label"),
    status: text("status"),
    term: text("term"),
    termYear: integer("term_year"),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("degree_checksheet_annotations_document_idx").on(t.documentId, t.sortOrder, t.id),
    index("degree_checksheet_annotations_user_idx").on(t.userId),
    uniqueIndex("degree_checksheet_annotations_anchor_key_idx").on(t.documentId, t.anchorKey),
  ],
);

export type DegreeChecksheetDocumentRow = typeof degreeChecksheetDocumentsTable.$inferSelect;
export type DegreeChecksheetAnnotationRow = typeof degreeChecksheetAnnotationsTable.$inferSelect;
