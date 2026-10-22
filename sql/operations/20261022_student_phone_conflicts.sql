-- Read-only prerequisite check for migration 0018. Includes graduated/deleted
-- students. Resolve each group explicitly; do not delete or merge automatically.
SELECT m.organization_id,
  regexp_replace(p.phone, '[^0-9]', '', 'g') AS phone_digits,
  array_agg(p.profile_id ORDER BY p.profile_id) AS profile_ids,
  array_agg(p.name ORDER BY p.profile_id) AS names
FROM public.organization_members m JOIN public.profiles p USING (profile_id)
WHERE m.role = 'STUDENT' AND nullif(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
GROUP BY m.organization_id, regexp_replace(p.phone, '[^0-9]', '', 'g')
HAVING count(*) > 1;
