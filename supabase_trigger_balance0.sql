-- ═══════════════════════════════════════════════════════════
--  PredictX — Trigger actualizado: saldo 0 para nuevos usuarios
--  Ejecuta en: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (email, name, role, balance, deposited, withdrawn, twofa, first_deposit)
  VALUES (
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'user',
    0,       -- sin saldo ficticio
    0,       -- sin depósitos ficticios
    0,
    true,
    true
  )
  ON CONFLICT (email) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
