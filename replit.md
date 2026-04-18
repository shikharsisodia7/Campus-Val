# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/api-server run dev:all` — build frontend then run combined server
- `pnpm --filter @workspace/scu-advising run build` — rebuild frontend after changes

## CampusVal — SCU AI Advising

AI academic advising web app for Santa Clara University undergraduates.

- Frontend: `artifacts/scu-advising` (React + Vite + Tailwind + shadcn/ui), built to `dist/public`
- Backend: `artifacts/api-server` (Express) — serves both `/api/*` and the built SPA on port 8080
- Pages: onboarding wizard, dashboard, courses, planner, GPA calc/sim, transfer evaluation, policies, AI advisor (SSE)
- Brand: cardinal `#8C1515`, gold `#B08850`
- DB: Drizzle schemas in `lib/db/src/schema/{profile,conversations,messages}`
- AI: OpenAI integration via `@workspace/integrations-openai-ai-server`
- Note: Replit only proxies ports listed in `.replit` (`8080`, `8081`). Frontend is built and served as static by the API server because the platform port allocator can't expose a separate Vite dev port.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
