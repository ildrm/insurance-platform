-- Runtime roles are created by the migration runner, never own tables or bypass RLS.
DO $$ DECLARE s text; t text; BEGIN
FOR s,t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('quote','policy','claims') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=schemaname AND table_name=tablename AND column_name='party_id') LOOP
EXECUTE format('DROP POLICY scoped ON %I.%I',s,t);
EXECUTE format('CREATE POLICY scoped ON %I.%I USING ((current_setting(''app.role'',true)=''CUSTOMER'' AND party_id=nullif(current_setting(''app.party_id'',true),'''')::uuid) OR (current_setting(''app.role'',true)!=''CUSTOMER'' AND tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)) WITH CHECK ((current_setting(''app.role'',true)=''CUSTOMER'' AND party_id=nullif(current_setting(''app.party_id'',true),'''')::uuid) OR (current_setting(''app.role'',true)!=''CUSTOMER'' AND tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid))',s,t);
END LOOP; END $$;
DROP POLICY operation_scope ON platform.operations;
CREATE POLICY operation_scope ON platform.operations USING ((current_setting('app.role',true)='CUSTOMER' AND party_id=nullif(current_setting('app.party_id',true),'')::uuid) OR (current_setting('app.role',true)!='CUSTOMER' AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)) WITH CHECK ((current_setting('app.role',true)='CUSTOMER' AND party_id=nullif(current_setting('app.party_id',true),'')::uuid) OR (current_setting('app.role',true)!='CUSTOMER' AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid));
ALTER TABLE product.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product.products FORCE ROW LEVEL SECURITY;
ALTER TABLE product.versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product.versions FORCE ROW LEVEL SECURITY;
CREATE POLICY catalogue ON product.products FOR SELECT USING (EXISTS(SELECT 1 FROM product.versions v WHERE v.product_id=product.products.id AND v.status='PUBLISHED') OR tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY products_write ON product.products FOR ALL USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY versions_read ON product.versions FOR SELECT USING (status='PUBLISHED' OR tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY versions_write ON product.versions FOR ALL USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE TABLE integrations.provider_effects(key text PRIMARY KEY,payload_hash text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION identity.key_subject(hash text) RETURNS SETOF identity.users LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT u.* FROM integrations.api_keys k JOIN identity.users u ON u.id=k.owner_id WHERE k.secret_hash=hash AND k.revoked_at IS NULL AND u.disabled=false $$;
CREATE FUNCTION platform.operation_context(op uuid) RETURNS TABLE(id uuid,tenant_id uuid,party_id uuid,actor_id uuid,kind text,resource_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT o.id,o.tenant_id,o.party_id,o.actor_id,o.kind,o.resource_id FROM platform.operations o WHERE o.id=op $$;
CREATE FUNCTION platform.pending_operations() RETURNS TABLE(id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT id FROM platform.operations WHERE status='PENDING' ORDER BY created_at LIMIT 100 $$;
CREATE FUNCTION platform.pending_documents() RETURNS TABLE(id uuid,tenant_id uuid,party_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT id,tenant_id,party_id FROM claims.documents WHERE status='QUARANTINED' ORDER BY created_at LIMIT 20 $$;
CREATE FUNCTION platform.delivery_tenants() RETURNS TABLE(id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT DISTINCT tenant_id FROM integrations.deliveries WHERE status='PENDING' AND next_attempt_at<=now() $$;
REVOKE ALL ON FUNCTION identity.key_subject(text),platform.operation_context(uuid),platform.pending_operations(),platform.pending_documents(),platform.delivery_tenants() FROM PUBLIC;
GRANT USAGE ON SCHEMA identity,tenant,party,product,quote,policy,claims,ledger,settlement,integrations,compliance,platform TO insurance_app,insurance_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA identity,tenant,party,product,quote,policy,claims,ledger,settlement,integrations,compliance,platform TO insurance_app,insurance_worker;
GRANT INSERT,UPDATE ON ALL TABLES IN SCHEMA product,quote,policy,claims,settlement,integrations,platform TO insurance_app,insurance_worker;
GRANT INSERT ON compliance.audit,ledger.postings TO insurance_app,insurance_worker;
GRANT INSERT(id,tenant_id,reference,currency) ON ledger.journals TO insurance_app,insurance_worker;
GRANT INSERT,DELETE ON identity.sessions TO insurance_app;
GRANT INSERT,UPDATE ON identity.rate_limits TO insurance_app;
GRANT EXECUTE ON FUNCTION identity.key_subject(text) TO insurance_app;
GRANT EXECUTE ON FUNCTION platform.operation_context(uuid),platform.pending_operations(),platform.pending_documents(),platform.delivery_tenants() TO insurance_worker;
REVOKE ALL ON integrations.provider_effects FROM insurance_app;
REVOKE INSERT,UPDATE ON platform.outbox,platform.inbox FROM insurance_app;
GRANT INSERT ON platform.outbox TO insurance_app;
REVOKE UPDATE ON policy.revisions FROM insurance_app,insurance_worker;
