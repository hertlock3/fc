-- ============================================================================
-- Farmer's Choice Market — lower the platform service fee to 3%
-- The app default (config + seed) now uses 3%; this migration updates any
-- settings row already stored in an existing database (the DB row overrides
-- the env default at runtime).
-- Idempotent: safe to run more than once.
-- ============================================================================

update public.settings
set value = jsonb_set(value, '{serviceFeePercent}', '3'::jsonb, true),
    updated_at = now()
where key = 'pricing'
  and (value->>'serviceFeePercent') is distinct from '3';
