-- ═══════════════════════════════════════════════════════════
--  PredictX — Migraciones para el panel Owner
--  Ejecuta en: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. Columnas adicionales en profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role         TEXT        NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. created_at y campos en bets
ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS match_name TEXT,
  ADD COLUMN IF NOT EXISTS user_email TEXT;

-- 3. created_at y campos en transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS user_email TEXT;

-- 4. Tabla de configuración global
CREATE TABLE IF NOT EXISTS public.site_config (
  id              INT     PRIMARY KEY DEFAULT 1,
  bonus_pct       INT     NOT NULL DEFAULT 100,
  bonus_max       INT     NOT NULL DEFAULT 100,
  dep_min         INT     NOT NULL DEFAULT 10,
  wit_min         INT     NOT NULL DEFAULT 20,
  initial_balance INT     NOT NULL DEFAULT 0,
  house_margin    NUMERIC NOT NULL DEFAULT 5,
  allow_register  BOOLEAN NOT NULL DEFAULT true,
  allow_deposits  BOOLEAN NOT NULL DEFAULT true,
  allow_bets      BOOLEAN NOT NULL DEFAULT true,
  maintenance     BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.site_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 5. RLS para site_config
ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners_read_config"  ON public.site_config;
DROP POLICY IF EXISTS "owners_write_config" ON public.site_config;

CREATE POLICY "owners_read_config"
  ON public.site_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE email = auth.jwt() ->> 'email'
      AND role = 'owner'
    )
  );

CREATE POLICY "owners_write_config"
  ON public.site_config FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE email = auth.jwt() ->> 'email'
      AND role = 'owner'
    )
  );

-- 6. Actualizar trigger para nuevos usuarios
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (
    email, name, role, balance, deposited, withdrawn,
    twofa, first_deposit, is_suspended, created_at
  ) VALUES (
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'user', 0, 0, 0, true, true, false, now()
  )
  ON CONFLICT (email) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
