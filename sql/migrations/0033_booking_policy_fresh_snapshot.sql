-- A statement can wait for the organization lock after taking its initial snapshot.
-- VOLATILE SQL helpers take a fresh snapshot after the wait, so the last seat and
-- just-committed policy changes are checked against the current committed state.
ALTER FUNCTION public.schedule_peak_occupancy(uuid,timestamptz,timestamptz,bigint[]) VOLATILE;
ALTER FUNCTION public.read_booking_policy(uuid) VOLATILE;
NOTIFY pgrst, 'reload schema';
