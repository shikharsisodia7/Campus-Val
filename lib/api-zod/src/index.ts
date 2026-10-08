export * from "./generated/api";
export type * as ApiTypes from "./generated/types";
// orval appends `export * from './generated/api'` and `export * from './generated/types'` to this file
// on every codegen run unless that exact single-quoted text is present (this comment). The second must
// never be added: the Zod schemas and the TypeScript types share names (UpsertProfileBody, ...), so the
// types are exported as ApiTypes instead.
