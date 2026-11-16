-- ============================================================
-- Icebreaker 2.0 – Full Supabase Schema
-- Run in Supabase SQL Editor (Dashboard > SQL Editor)
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. public.users (carried over from v1)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      text        NOT NULL,
  username_lower text       NOT NULL,
  avatar_url    text,
  trophies      int         NOT NULL DEFAULT 0,
  wins          int         NOT NULL DEFAULT 0,
  games_played  int         NOT NULL DEFAULT 0,
  is_online     boolean     NOT NULL DEFAULT false,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_username_lower_key UNIQUE (username_lower)
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='users_read') THEN
    CREATE POLICY "users_read" ON public.users FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='users_insert_own') THEN
    CREATE POLICY "users_insert_own" ON public.users FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='users_update_own') THEN
    CREATE POLICY "users_update_own" ON public.users FOR UPDATE TO authenticated USING (id = auth.uid());
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. public.rooms
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rooms (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text        NOT NULL UNIQUE,
  host_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'lobby'
              CHECK (status IN ('lobby', 'playing', 'finished')),
  game_type   text,
  game_state  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rooms' AND policyname='rooms_read') THEN
    CREATE POLICY "rooms_read" ON public.rooms FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rooms' AND policyname='rooms_insert') THEN
    CREATE POLICY "rooms_insert" ON public.rooms FOR INSERT TO authenticated WITH CHECK (host_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rooms' AND policyname='rooms_update') THEN
    CREATE POLICY "rooms_update" ON public.rooms FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rooms' AND policyname='rooms_delete') THEN
    CREATE POLICY "rooms_delete" ON public.rooms FOR DELETE TO authenticated USING (host_id = auth.uid());
  END IF;
END $$;

-- Enable realtime for rooms
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;

-- ────────────────────────────────────────────────────────────
-- 3. public.room_players
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.room_players (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid        NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  username    text        NOT NULL,
  score       int         NOT NULL DEFAULT 0,
  is_host     boolean     NOT NULL DEFAULT false,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_room_player UNIQUE (room_id, user_id)
);

ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='room_players' AND policyname='rp_read') THEN
    CREATE POLICY "rp_read" ON public.room_players FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='room_players' AND policyname='rp_insert') THEN
    CREATE POLICY "rp_insert" ON public.room_players FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='room_players' AND policyname='rp_update') THEN
    CREATE POLICY "rp_update" ON public.room_players FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='room_players' AND policyname='rp_delete') THEN
    CREATE POLICY "rp_delete" ON public.room_players FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

-- Enable realtime for room_players
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;

-- ────────────────────────────────────────────────────────────
-- 4. public.friend_requests (carried over from v1)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_request CHECK (sender_id <> receiver_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_friend_request_pair_pending
  ON public.friend_requests (
    LEAST(sender_id::text, receiver_id::text),
    GREATEST(sender_id::text, receiver_id::text)
  ) WHERE status = 'pending';

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friend_requests' AND policyname='freq_read') THEN
    CREATE POLICY "freq_read" ON public.friend_requests FOR SELECT TO authenticated
      USING (sender_id = auth.uid() OR receiver_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friend_requests' AND policyname='freq_insert') THEN
    CREATE POLICY "freq_insert" ON public.friend_requests FOR INSERT TO authenticated
      WITH CHECK (sender_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friend_requests' AND policyname='freq_update') THEN
    CREATE POLICY "freq_update" ON public.friend_requests FOR UPDATE TO authenticated
      USING (sender_id = auth.uid() OR receiver_id = auth.uid());
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. public.friends (bidirectional, managed by trigger)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.friends (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_id  uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_friend CHECK (user_id <> friend_id),
  CONSTRAINT uq_friend_pair UNIQUE (user_id, friend_id)
);

CREATE OR REPLACE FUNCTION public.fn_friend_request_accepted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    INSERT INTO public.friends (user_id, friend_id)
    VALUES (NEW.sender_id, NEW.receiver_id), (NEW.receiver_id, NEW.sender_id)
    ON CONFLICT (user_id, friend_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_friend_request_accepted ON public.friend_requests;
CREATE TRIGGER trg_friend_request_accepted
  AFTER UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_friend_request_accepted();

CREATE OR REPLACE FUNCTION public.fn_friend_deleted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.friends WHERE user_id = OLD.friend_id AND friend_id = OLD.user_id;
  UPDATE public.friend_requests SET status = 'declined'
    WHERE ((sender_id = OLD.user_id AND receiver_id = OLD.friend_id)
        OR (sender_id = OLD.friend_id AND receiver_id = OLD.user_id))
      AND status = 'accepted';
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS trg_friend_deleted ON public.friends;
CREATE TRIGGER trg_friend_deleted
  AFTER DELETE ON public.friends
  FOR EACH ROW EXECUTE FUNCTION public.fn_friend_deleted();

ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friends' AND policyname='friends_read') THEN
    CREATE POLICY "friends_read" ON public.friends FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='friends' AND policyname='friends_delete') THEN
    CREATE POLICY "friends_delete" ON public.friends FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 6. public.game_invites (carried over from v1)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.game_invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  room_code   text        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_invite CHECK (sender_id <> receiver_id)
);

ALTER TABLE public.game_invites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='game_invites' AND policyname='invites_read') THEN
    CREATE POLICY "invites_read" ON public.game_invites FOR SELECT TO authenticated
      USING (sender_id = auth.uid() OR receiver_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='game_invites' AND policyname='invites_insert') THEN
    CREATE POLICY "invites_insert" ON public.game_invites FOR INSERT TO authenticated
      WITH CHECK (sender_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='game_invites' AND policyname='invites_update') THEN
    CREATE POLICY "invites_update" ON public.game_invites FOR UPDATE TO authenticated
      USING (sender_id = auth.uid() OR receiver_id = auth.uid());
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 7. public.notifications (carried over from v1)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type         text        NOT NULL CHECK (type IN ('friend_request', 'friend_accepted', 'game_invite')),
  from_user_id uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  ref_id       uuid,
  is_read      boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, is_read, created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_notify_friend_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, type, from_user_id, ref_id)
    VALUES (NEW.receiver_id, 'friend_request', NEW.sender_id, NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_friend_request ON public.friend_requests;
CREATE TRIGGER trg_notify_friend_request
  AFTER INSERT ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_friend_request();

CREATE OR REPLACE FUNCTION public.fn_notify_friend_accepted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, type, from_user_id, ref_id)
    VALUES (NEW.sender_id, 'friend_accepted', NEW.receiver_id, NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_friend_accepted ON public.friend_requests;
CREATE TRIGGER trg_notify_friend_accepted
  AFTER UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_friend_accepted();

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='notif_read') THEN
    CREATE POLICY "notif_read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='notif_update') THEN
    CREATE POLICY "notif_update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 8. Helper: generate random room code
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..5 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.rooms WHERE rooms.code = code AND status != 'finished');
  END LOOP;
  RETURN code;
END; $$;
