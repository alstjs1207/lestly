-- Preserve existing rows and public links. Enforce the public slug on new writes.
-- NOT VALID avoids backfilling or rejecting legacy rows during installation.
ALTER TABLE public.programs ADD CONSTRAINT programs_public_slug_check
CHECK (is_public IS NOT TRUE OR (slug IS NOT NULL AND slug ~ '[^[:space:]]')) NOT VALID;
NOTIFY pgrst, 'reload schema';
