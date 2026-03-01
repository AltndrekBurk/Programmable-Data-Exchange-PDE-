# Frontend Web ZK Processor - Agent Memory

## Project: dataEconomy

### Stack
- Next.js 16 (App Router) + React 19
- NextAuth v4 (JWT strategy)
- TypeScript strict mode
- Tailwind CSS v4
- Zod v4 (web), Zod v3 peer required by @hono/zod-validator in API

### Auth Architecture
- Auth method: Stellar Freighter wallet (NOT email/password)
- Flow: connect wallet -> get public key -> fetch challenge from backend -> sign with Freighter -> NextAuth credentials provider -> session
- Backend endpoints: GET /api/auth/challenge?address=G... | POST /api/auth/verify
- Backend URL: http://localhost:3001
- Pseudonym: HMAC-SHA256 from Stellar public key (real identity hidden)
- Session carries: stellarAddress, pseudoId

### Key Files
- `apps/web/src/lib/auth.ts` — NextAuth config (Stellar credentials provider)
- `apps/web/src/types/index.ts` — NextAuth type augmentation (Session, User, JWT)
- `apps/web/src/hooks/useFreighter.ts` — Freighter wallet hook
- `apps/web/src/app/(auth)/login/page.tsx` — Login page (wallet connect UI)
- `apps/web/src/lib/validations/auth.ts` — Stellar auth Zod schema

### Freighter Integration Notes
- Package: @stellar/freighter-api@6.0.1
- Always use dynamic import (SSR compatibility): `await import("@stellar/freighter-api")`
- signMessage may not be stable in all Freighter versions — hook includes runtime check
- Fallback pattern documented in useFreighter.ts comments: use signTransaction with memo
- Network passphrase for testnet: "Test SDF Network ; September 2015"

### Workspace / NPM Notes
- Root is npm workspace (apps/*, packages/*)
- Installing packages in web: use `npm install <pkg> --prefix apps/web` from repo root
  OR cd into apps/web and run `npm install <pkg> --prefix .`
  Do NOT use `npm install --workspace=apps/web` — causes ERESOLVE from API's zod peer conflict
- @reclaimprotocol/zk-fetch dependency referenced somewhere but not resolvable — avoid touching root lockfile

### NextAuth Type Augmentation Pattern
- User interface must include ALL required fields returned from authorize()
- pseudoId must be in both User and JWT interfaces
- token.stellarAddress can be string | undefined at callback time — cast with fallback to ""

### UI Components
- Button component: `apps/web/src/components/ui/Button.tsx`
  Props: variant (primary|secondary|outline|ghost|destructive), size (sm|md|lg), isLoading, disabled
