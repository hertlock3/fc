/**
 * Vitest stub for the `server-only` package.
 *
 * In the Next.js app, `import "server-only"` marks a module as server-only
 * (importing it from client code fails the build). Vitest has no concept of
 * that boundary, so tests that exercise server modules (e.g. lib/email-otp.ts)
 * alias this marker import to an empty module.
 */
export {};
