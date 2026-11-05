CREATE SCHEMA kt_catalog;
REVOKE ALL ON SCHEMA kt_catalog FROM PUBLIC;
GRANT USAGE ON SCHEMA kt_catalog TO kt_app,kt_auth_service;
CREATE TABLE kt_catalog.resources (
 id uuid PRIMARY KEY,owner_id text REFERENCES kt_auth.users(id),
 kind text NOT NULL CHECK(kind IN ('genome','tool')),
 url text NOT NULL UNIQUE,content jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','published','rejected','withdrawn')) DEFAULT 'pending',
 version integer NOT NULL DEFAULT 1,
 reviewed_by text,review_note text,reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status<>'published' OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND review_note IS NOT NULL))
);
CREATE TABLE kt_catalog.reviews (
 id uuid PRIMARY KEY,resource_id uuid NOT NULL REFERENCES kt_catalog.resources(id),
 reviewer text NOT NULL,decision text NOT NULL,note text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE kt_catalog.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE kt_catalog.resources FORCE ROW LEVEL SECURITY;
CREATE POLICY public_resources ON kt_catalog.resources FOR SELECT TO kt_app USING(status='published' OR owner_id=current_setting('kt.actor_id',true));
CREATE POLICY submit_resource ON kt_catalog.resources FOR INSERT TO kt_app WITH CHECK(owner_id=current_setting('kt.actor_id',true) AND status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL);
CREATE POLICY moderate_resources ON kt_catalog.resources TO kt_auth_service USING(true) WITH CHECK(true);
ALTER TABLE kt_catalog.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE kt_catalog.reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY moderate_reviews ON kt_catalog.reviews TO kt_auth_service USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON kt_catalog.resources TO kt_app;
GRANT SELECT,UPDATE ON kt_catalog.resources TO kt_auth_service;
GRANT SELECT,INSERT ON kt_catalog.reviews TO kt_auth_service;
CREATE INDEX resource_queue ON kt_catalog.resources(status,created_at);
-- Dedicated worker can access only object metadata belonging to its active task actor.
GRANT USAGE ON SCHEMA kt_storage TO kt_dispatcher;
GRANT SELECT,INSERT,UPDATE ON kt_storage.objects TO kt_dispatcher;
CREATE POLICY worker_objects ON kt_storage.objects TO kt_dispatcher USING(owner_id=current_setting('kt.actor_id',true)) WITH CHECK(owner_id=current_setting('kt.actor_id',true));
CREATE FUNCTION kt_ops.omics_queue_size() RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT count(*) FROM kt_ops.tasks WHERE kind IN ('omics','omics.prepare') AND status IN ('queued','running') $$;
REVOKE ALL ON FUNCTION kt_ops.omics_queue_size() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kt_ops.omics_queue_size() TO kt_app;
