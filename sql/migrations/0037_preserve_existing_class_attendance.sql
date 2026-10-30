-- Preserve attendance confirmation when class capacity was reduced after booking.
CREATE OR REPLACE FUNCTION public.enforce_schedule_occupancy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_max integer := 5;
BEGIN
  IF NEW.cancelled_at IS NOT NULL THEN RETURN NULL; END IF;
  -- Confirming attendance on an already active reservation consumes no new seat.
  -- A restored reservation or any class/student/time change must still be checked.
  IF TG_OP='UPDATE' AND OLD.cancelled_at IS NULL
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
    AND NEW.program_id IS NOT DISTINCT FROM OLD.program_id
    AND NEW.student_id IS NOT DISTINCT FROM OLD.student_id
    AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
    AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.schedules s WHERE s.cancelled_at IS NULL AND s.student_id = NEW.student_id
    AND s.schedule_id IS DISTINCT FROM NEW.schedule_id
    AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time) THEN
    RAISE EXCEPTION 'schedule_student_conflict';
  END IF;
  SELECT max_capacity INTO v_max FROM public.programs WHERE organization_id=NEW.organization_id AND program_id=NEW.program_id;
  IF v_max < 1 OR public.program_peak_occupancy(NEW.organization_id,NEW.program_id,NEW.start_time,NEW.end_time,ARRAY[NEW.schedule_id]) >= v_max THEN
    RAISE EXCEPTION 'schedule_capacity_exceeded';
  END IF;
  RETURN NULL;
END $$;

NOTIFY pgrst,'reload schema';
