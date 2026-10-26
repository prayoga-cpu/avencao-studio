-- Supabase expose le schéma « public » via son API de données (PostgREST) aux rôles
-- « anon » et « authenticated », accessibles avec la clé publique du projet. Le CRM n'utilise
-- pas cette API : on retire tout accès à ces rôles et on active la sécurité au niveau des lignes
-- (RLS, sans politique = aucune ligne visible) sur nos tables. Le propriétaire des tables
-- (le rôle de l'application) n'est pas soumis à la RLS : l'application fonctionne à l'identique.
-- Sans effet sur une base PostgreSQL ordinaire (rôles absents) hormis l'activation de la RLS.

DO $$
DECLARE
  t record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    -- Tables créées plus tard par le même rôle : aucun droit par défaut pour l'API.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;

  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tableowner = current_user
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
