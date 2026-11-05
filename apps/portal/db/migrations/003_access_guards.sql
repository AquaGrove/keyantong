ALTER TABLE kt_ops.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE kt_ops.outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_events ON kt_ops.outbox FOR INSERT TO kt_auth_service WITH CHECK(true);
CREATE POLICY owner_events ON kt_ops.outbox FOR INSERT TO kt_app WITH CHECK(owner_id=current_setting('kt.actor_id',true));
CREATE POLICY dispatch_events ON kt_ops.outbox TO kt_dispatcher USING(true) WITH CHECK(true);
-- Authorization is checked again at export time; withdrawal does not erase provenance.
CREATE FUNCTION kt_knowledge.guard_training_member() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM kt_knowledge.sources WHERE id=NEW.source_id AND owner_id=NEW.owner_id AND allow_training AND review_status='approved' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Source is not approved for training' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER training_consent BEFORE INSERT OR UPDATE ON kt_knowledge.training_members FOR EACH ROW EXECUTE FUNCTION kt_knowledge.guard_training_member();
CREATE VIEW kt_knowledge.rag_sources WITH (security_invoker=true) AS SELECT * FROM kt_knowledge.sources WHERE allow_rag AND review_status='approved' AND deleted_at IS NULL;
CREATE VIEW kt_knowledge.training_export WITH (security_invoker=true) AS SELECT m.dataset_id,s.* FROM kt_knowledge.training_members m JOIN kt_knowledge.sources s ON (s.id,s.owner_id)=(m.source_id,m.owner_id) JOIN kt_knowledge.training_sets d ON (d.id,d.owner_id)=(m.dataset_id,m.owner_id) WHERE s.allow_training AND s.review_status='approved' AND s.deleted_at IS NULL AND d.status='approved';
GRANT SELECT ON kt_knowledge.rag_sources,kt_knowledge.training_export TO kt_app;
