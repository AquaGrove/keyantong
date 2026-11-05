-- These structures are reserved and usable, but existing modules are not silently cut over.
CREATE TABLE kt_storage.objects (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES kt_auth.users(id),
  bucket text NOT NULL,
  object_key text NOT NULL UNIQUE,
  UNIQUE(id,owner_id),
  object_version text,
  media_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK(size_bytes>=0),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK(state IN ('pending','ready','deleted')),
  visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kt_knowledge.sources (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES kt_auth.users(id),
  source_type text NOT NULL,
  source_id text NOT NULL,
  source_uri text,
  version integer NOT NULL CHECK(version>0),
  content_sha256 text NOT NULL,
  object_id uuid,
  FOREIGN KEY(object_id,owner_id) REFERENCES kt_storage.objects(id,owner_id),
  license text,
  visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
  review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected','withdrawn')),
  allow_rag boolean NOT NULL DEFAULT false,
  allow_training boolean NOT NULL DEFAULT false,
  consent_version text,
  consent_recorded_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_type,source_id,version),
  UNIQUE(id,owner_id),
  CHECK(NOT (allow_rag OR allow_training) OR (license IS NOT NULL AND consent_version IS NOT NULL AND consent_recorded_at IS NOT NULL))
);
CREATE TABLE kt_knowledge.chunks (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL,
  owner_id text NOT NULL,
  chunk_index integer NOT NULL CHECK(chunk_index>=0),
  body text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  embedding_model text,
  embedding_version text,
  embedding_dimension integer CHECK(embedding_dimension>0),
  -- pgvector and its dimension-specific indexes are a separate, versioned rollout.
  embedding_object_id uuid,
  FOREIGN KEY(embedding_object_id,owner_id) REFERENCES kt_storage.objects(id,owner_id),
  FOREIGN KEY(source_id,owner_id) REFERENCES kt_knowledge.sources(id,owner_id) ON DELETE CASCADE,
  UNIQUE(source_id,chunk_index)
);
CREATE TABLE kt_knowledge.training_sets (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES kt_auth.users(id),
  version text NOT NULL,
  manifest_object_id uuid,
  FOREIGN KEY(manifest_object_id,owner_id) REFERENCES kt_storage.objects(id,owner_id),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,owner_id)
);
CREATE TABLE kt_knowledge.training_members (
  dataset_id uuid NOT NULL,
  source_id uuid NOT NULL,
  owner_id text NOT NULL,
  PRIMARY KEY(dataset_id,source_id),
  FOREIGN KEY(dataset_id,owner_id) REFERENCES kt_knowledge.training_sets(id,owner_id) ON DELETE CASCADE,
  FOREIGN KEY(source_id,owner_id) REFERENCES kt_knowledge.sources(id,owner_id)
);
CREATE TABLE kt_ops.tasks (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES kt_auth.users(id),
  kind text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','cancelled')),
  parameters jsonb NOT NULL DEFAULT '{}',
  input_object_id uuid,
  FOREIGN KEY(input_object_id,owner_id) REFERENCES kt_storage.objects(id,owner_id),
  result_object_id uuid,
  FOREIGN KEY(result_object_id,owner_id) REFERENCES kt_storage.objects(id,owner_id),
  version bigint NOT NULL DEFAULT 1,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 20),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,kind,idempotency_key)
);
CREATE INDEX tasks_queue ON kt_ops.tasks(kind,status,lease_until,created_at);
GRANT SELECT,INSERT,UPDATE ON kt_storage.objects,kt_knowledge.sources,kt_knowledge.chunks,kt_knowledge.training_sets,kt_knowledge.training_members,kt_ops.tasks TO kt_app;
GRANT SELECT,UPDATE ON kt_ops.tasks TO kt_dispatcher;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['kt_storage.objects','kt_knowledge.sources','kt_knowledge.chunks','kt_knowledge.training_sets','kt_knowledge.training_members','kt_ops.tasks'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY owner_access ON %s TO kt_app USING(owner_id=current_setting(''kt.actor_id'',true)) WITH CHECK(owner_id=current_setting(''kt.actor_id'',true))',t);
  END LOOP;
END $$;
CREATE POLICY worker_tasks ON kt_ops.tasks TO kt_dispatcher USING(true) WITH CHECK(true);
