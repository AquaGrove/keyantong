GRANT UPDATE(url,content,status,version,reviewed_by,review_note,reviewed_at,updated_at) ON kt_catalog.resources TO kt_app;
CREATE POLICY revise_own_resource ON kt_catalog.resources FOR UPDATE TO kt_app
 USING(owner_id=current_setting('kt.actor_id',true) AND status IN ('pending','rejected','withdrawn'))
 WITH CHECK(owner_id=current_setting('kt.actor_id',true) AND status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_note IS NULL);
