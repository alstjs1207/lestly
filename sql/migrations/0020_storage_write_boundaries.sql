-- Catalog images are public assets. Writes must pass the server's admin/tenant
-- checks and file-signature validator; no browser JWT may upload them directly.
DO $$
DECLARE p record;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND (coalesce(qual,'') || coalesce(with_check,'')) ~ '(coverimages|instructors)'
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects',p.policyname);
  END LOOP;
  UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/gif']
    WHERE id IN ('avatars','coverimages','instructors');
END;
$$;
