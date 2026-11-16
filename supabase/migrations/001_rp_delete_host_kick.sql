-- NOT YET APPLIED - requires owner approval
--
-- Allow the host of a room to delete (kick) other players' rows in room_players.
-- Previously rp_delete was USING (user_id = auth.uid()), so host kicks silently
-- deleted 0 rows. schema.sql uses IF NOT EXISTS guards, so it will not replace the
-- existing policy on a live project; this migration does. Idempotent.

BEGIN;

DROP POLICY IF EXISTS "rp_delete" ON public.room_players;

CREATE POLICY "rp_delete" ON public.room_players FOR DELETE TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = room_players.room_id AND r.host_id = auth.uid()
  )
);

COMMIT;
