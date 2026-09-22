-- ============================================================================
-- Farmer's Choice Market — seed data
-- Idempotent: safe to run more than once.
-- ============================================================================

-- Pricing / fee settings ------------------------------------------------------
insert into public.settings (key, value)
values (
  'pricing',
  '{"serviceFeePercent":3,"delivery":{"baseFee":100,"perKmFee":35,"minFee":130,"maxFee":1500,"peakMultiplier":1.15}}'::jsonb
)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Categories -----------------------------------------------------------------
insert into public.categories (name, slug, description, sort_order) values
  ('Beef',            'beef',            'Fresh beef cuts and mince',            1),
  ('Chicken',         'chicken',         'Farm-fresh chicken, whole and portions',2),
  ('Pork',            'pork',            'Pork chops, ribs and sausages',         3),
  ('Sausages & Processed', 'sausages',   'Sausages, smokies, burgers and viennas',4),
  ('Bacon & Ham',     'bacon-ham',       'Bacon, ham and deli favourites',        5),
  ('Fish',            'fish',            'Fresh tilapia and salmon',              6),
  ('Deli & Ready Meals','deli',          'Pies, rolls and ready-to-eat treats',   7)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order;

-- Products -------------------------------------------------------------------
insert into public.products
  (category_id, name, slug, description, price_cents, unit, sku, in_stock, stock_qty)
values
  -- Beef (KES)
  ((select id from public.categories where slug='beef'), 'Beef Ribeye Steak', 'beef-ribeye-steak', 'Premium grain-fed ribeye, expertly trimmed.', 95000, '500g pack', 'FC-BEF-001', true, 40),
  ((select id from public.categories where slug='beef'), 'Beef Minced Meat', 'beef-minced-meat', 'Lean, freshly ground beef. Ideal for stews and sauces.', 48000, '500g pack', 'FC-BEF-002', true, 60),
  ((select id from public.categories where slug='beef'), 'Beef Stewing Cubes', 'beef-stewing-cubes', 'Bone-in stewing cubes full of flavour.', 78000, '1kg pack', 'FC-BEF-003', true, 50),
  ((select id from public.categories where slug='beef'), 'Beef T-Bone', 'beef-t-bone', 'Thick-cut T-bone, perfect for grilling.', 115000, '1kg', 'FC-BEF-004', true, 25),
  -- Chicken
  ((select id from public.categories where slug='chicken'), 'Whole Chicken', 'whole-chicken', 'Farm-raised whole chicken, oven-ready.', 65000, 'approx 1.2kg', 'FC-CHK-001', true, 45),
  ((select id from public.categories where slug='chicken'), 'Chicken Breast Fillet', 'chicken-breast-fillet', 'Skinless, boneless breast fillets.', 52000, '500g pack', 'FC-CHK-002', true, 55),
  ((select id from public.categories where slug='chicken'), 'Chicken Drumsticks', 'chicken-drumsticks', 'Juicy drumsticks, great for frying or roasting.', 69000, '1kg pack', 'FC-CHK-003', true, 40),
  ((select id from public.categories where slug='chicken'), 'Chicken Wings', 'chicken-wings', 'Party-ready wings, fresh and plump.', 64000, '1kg pack', 'FC-CHK-004', true, 38),
  -- Pork
  ((select id from public.categories where slug='pork'), 'Pork Chops', 'pork-chops', 'Tender centre-cut pork chops.', 72000, '1kg pack', 'FC-PRK-001', true, 30),
  ((select id from public.categories where slug='pork'), 'Pork Ribs', 'pork-ribs', 'Meaty ribs ideal for slow cooking.', 76000, '1kg pack', 'FC-PRK-002', true, 28),
  ((select id from public.categories where slug='pork'), 'Pork Sausages', 'pork-sausages', 'Seasoned pork sausages.', 38000, '500g pack', 'FC-PRK-003', true, 44),
  -- Sausages & Processed
  ((select id from public.categories where slug='sausages'), 'Farmer''s Choice Beef Sausages', 'beef-sausages', 'The classic beef sausage loved across Kenya.', 39000, '500g pack', 'FC-SAU-001', true, 80),
  ((select id from public.categories where slug='sausages'), 'Smokies', 'smokies', 'Smoked sausage fingers — a Kenyan favourite.', 54000, '1kg pack', 'FC-SAU-002', true, 70),
  ((select id from public.categories where slug='sausages'), 'Beef Burgers', 'beef-burgers', 'Four seasoned beef patties.', 42000, '4 pack', 'FC-SAU-003', true, 50),
  ((select id from public.categories where slug='sausages'), 'Viennas', 'viennas', 'Smooth, mild vienna sausages.', 32000, '340g can', 'FC-SAU-004', true, 65),
  -- Bacon & Ham
  ((select id from public.categories where slug='bacon-ham'), 'Streaky Bacon', 'streaky-bacon', 'Smoked streaky bacon rashers.', 46000, '250g pack', 'FC-BAC-001', true, 35),
  ((select id from public.categories where slug='bacon-ham'), 'Back Bacon', 'back-bacon', 'Lean back bacon, expertly cured.', 48000, '250g pack', 'FC-BAC-002', true, 33),
  ((select id from public.categories where slug='bacon-ham'), 'Cooked Ham', 'cooked-ham', 'Ready-to-eat sliced ham.', 38000, '200g pack', 'FC-HAM-001', true, 42),
  ((select id from public.categories where slug='bacon-ham'), 'Sandwich Ham', 'sandwich-ham', 'Thinly sliced ham for sandwiches.', 36000, '200g pack', 'FC-HAM-002', true, 40),
  -- Fish
  ((select id from public.categories where slug='fish'), 'Whole Tilapia', 'whole-tilapia', 'Fresh lake tilapia, cleaned and scaled.', 62000, 'approx 1kg', 'FC-FSH-001', true, 22),
  ((select id from public.categories where slug='fish'), 'Salmon Fillet', 'salmon-fillet', 'Fresh salmon fillet, rich in omega-3.', 110000, '300g pack', 'FC-FSH-002', true, 18),
  -- Deli & Ready Meals
  ((select id from public.categories where slug='deli'), 'Chicken Pie', 'chicken-pie', 'Golden pastry with creamy chicken filling.', 25000, '200g', 'FC-DEL-001', true, 60),
  ((select id from public.categories where slug='deli'), 'Beef Pie', 'beef-pie', 'Hearty beef pie, baked fresh.', 23000, '200g', 'FC-DEL-002', true, 60),
  ((select id from public.categories where slug='deli'), 'Sausage Roll', 'sausage-roll', 'Flaky sausage roll, warm and satisfying.', 20000, '150g', 'FC-DEL-003', true, 75)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description,
      price_cents = excluded.price_cents, unit = excluded.unit,
      category_id = excluded.category_id, in_stock = excluded.in_stock,
      stock_qty = excluded.stock_qty, is_active = true;
