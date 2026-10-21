-- Read-only preflight for the NOT VALID constraints introduced in 0016.
-- Run before validating constraints on an existing deployment. Any returned
-- row needs review; this script intentionally does not change tenant data.
SELECT 'programs_instructor_tenant_fk' AS constraint_name, p.program_id AS row_id
FROM public.programs p
JOIN public.instructors i ON i.instructor_id = p.instructor_id
WHERE p.organization_id <> i.organization_id
UNION ALL
SELECT 'schedules_program_tenant_fk', s.schedule_id
FROM public.schedules s
JOIN public.programs p ON p.program_id = s.program_id
WHERE s.organization_id <> p.organization_id
UNION ALL
SELECT 'schedules_valid_time_range', s.schedule_id
FROM public.schedules s WHERE s.end_time <= s.start_time
UNION ALL
SELECT 'notifications_program_tenant_fk', n.notification_id
FROM public.notifications n
JOIN public.programs p ON p.program_id = n.program_id
WHERE n.organization_id <> p.organization_id
UNION ALL
SELECT 'notifications_schedule_tenant_fk', n.notification_id
FROM public.notifications n
JOIN public.schedules s ON s.schedule_id = n.schedule_id
WHERE n.organization_id <> s.organization_id
UNION ALL
SELECT 'notifications_parent_tenant_fk', n.notification_id
FROM public.notifications n
JOIN public.notifications parent ON parent.notification_id = n.parent_notification_id
WHERE n.organization_id <> parent.organization_id
UNION ALL
SELECT 'in_app_notifications_notification_tenant_fk', a.in_app_notification_id
FROM public.in_app_notifications a
JOIN public.notifications n ON n.notification_id = a.notification_id
WHERE a.organization_id <> n.organization_id;

SELECT invite_id, organization_id, profile_id
FROM public.student_invites i
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = i.organization_id AND om.profile_id = i.profile_id
);

-- Historic student membership is kept on graduation/deletion, so check for
-- missing/wrong-role membership separately from membership state.
SELECT schedule_id, organization_id, student_id
FROM public.schedules s
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = s.organization_id
    AND om.profile_id = s.student_id AND om.role = 'STUDENT'
);
