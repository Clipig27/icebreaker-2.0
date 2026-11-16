-- NOT YET APPLIED - optional, requires owner approval
--
-- Atomic server-side merge of a single entry into rooms.game_state.
-- The app does NOT call this function; client-side compare-and-swap
-- (roomStore.mutateGameState) fixes the lost-update bug without it.
-- This is offered as a possible future hardening.
--
-- Example: merge_game_state_entry(room_id, ARRAY['answers', auth.uid()::text], '"my answer"'::jsonb)

CREATE OR REPLACE FUNCTION public.merge_game_state_entry(
  p_room  uuid,
  p_path  text[],
  p_value jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_state jsonb;
BEGIN
  -- Ensure the parent object exists so jsonb_set can create the leaf key
  UPDATE public.rooms
     SET game_state = jsonb_set(
           CASE
             WHEN array_length(p_path, 1) > 1
                  AND (coalesce(game_state, '{}'::jsonb) #> p_path[1:array_length(p_path, 1) - 1]) IS NULL
             THEN jsonb_set(coalesce(game_state, '{}'::jsonb),
                            p_path[1:array_length(p_path, 1) - 1], '{}'::jsonb, true)
             ELSE coalesce(game_state, '{}'::jsonb)
           END,
           p_path, p_value, true),
         updated_at = now()
   WHERE id = p_room
   RETURNING game_state INTO v_state;

  RETURN v_state;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_game_state_entry(uuid, text[], jsonb) TO authenticated;
