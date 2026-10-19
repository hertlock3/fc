-- ============================================================================
-- Farmer's Choice Market — product image uploads
-- Adds a PUBLIC 'product-images' storage bucket so uploaded product photos can
-- be shown on the shop grid and admin catalog with plain <img> URLs (the same
-- URL pattern the products.image_url column already supports).
--
-- Writes go through /api/admin/products/[id]/image which enforces the
-- admin/vendor role and uses the service-role client, so no storage policies
-- are required here.
-- Idempotent: safe to run more than once.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;
