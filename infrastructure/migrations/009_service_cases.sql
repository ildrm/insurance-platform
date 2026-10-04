CREATE SCHEMA service;
CREATE TABLE service.complaints(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,party_id uuid NOT NULL,policy_id uuid NOT NULL,subject text NOT NULL,description text NOT NULL,status text NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','ACKNOWLEDGED','INVESTIGATING','RESOLVED','ESCALATED','CLOSED')),version int NOT NULL DEFAULT 1,resolution text,due_at timestamptz NOT NULL,overdue_notified_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(tenant_id,policy_id) REFERENCES policy.policies(tenant_id,id),UNIQUE(tenant_id,id));
CREATE TABLE service.complaint_history(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,party_id uuid NOT NULL,complaint_id uuid NOT NULL,status text NOT NULL,actor_id uuid NOT NULL REFERENCES identity.users(id),reason text NOT NULL,resolution text,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(tenant_id,complaint_id) REFERENCES service.complaints(tenant_id,id));
CREATE TRIGGER immutable_complaint_history BEFORE UPDATE OR DELETE ON service.complaint_history FOR EACH ROW EXECUTE FUNCTION platform.immutable();
DO $$ DECLARE t text; BEGIN FOR t IN SELECT unnest(ARRAY['complaints','complaint_history']) LOOP
  EXECUTE format('ALTER TABLE service.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE service.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY service_scope ON service.%I USING ((current_setting(''app.role'',true)=''CUSTOMER'' AND party_id=nullif(current_setting(''app.party_id'',true),'''')::uuid) OR (current_setting(''app.role'',true)!=''CUSTOMER'' AND tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)) WITH CHECK ((current_setting(''app.role'',true)=''CUSTOMER'' AND party_id=nullif(current_setting(''app.party_id'',true),'''')::uuid) OR (current_setting(''app.role'',true)!=''CUSTOMER'' AND tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid))',t);
END LOOP; END $$;
CREATE INDEX complaint_deadline ON service.complaints(tenant_id,due_at) WHERE status NOT IN('RESOLVED','CLOSED');
GRANT USAGE ON SCHEMA service TO insurance_app,insurance_worker;
GRANT SELECT,INSERT,UPDATE ON service.complaints TO insurance_app,insurance_worker;
GRANT SELECT,INSERT ON service.complaint_history TO insurance_app;
GRANT SELECT ON service.complaint_history TO insurance_worker;
CREATE FUNCTION platform.complaint_tenants() RETURNS TABLE(id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT DISTINCT tenant_id FROM service.complaints WHERE due_at<=now() AND overdue_notified_at IS NULL AND status NOT IN('RESOLVED','CLOSED') LIMIT 100 $$;
REVOKE ALL ON FUNCTION platform.complaint_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.complaint_tenants() TO insurance_worker;

CREATE TABLE service.notifications(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,party_id uuid NOT NULL,event_id uuid NOT NULL UNIQUE,type text NOT NULL,resource_id uuid NOT NULL,message text NOT NULL,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE service.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE service.notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_read ON service.notifications FOR SELECT USING(party_id=nullif(current_setting('app.party_id',true),'')::uuid);
CREATE POLICY notifications_update ON service.notifications FOR UPDATE USING(party_id=nullif(current_setting('app.party_id',true),'')::uuid) WITH CHECK(party_id=nullif(current_setting('app.party_id',true),'')::uuid);
CREATE POLICY notifications_create ON service.notifications FOR INSERT WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND current_setting('app.role',true)='ADMIN');
CREATE INDEX notification_inbox ON service.notifications(party_id,created_at DESC);
GRANT SELECT ON service.notifications TO insurance_app,insurance_worker;
GRANT UPDATE(read_at) ON service.notifications TO insurance_app;
GRANT INSERT ON service.notifications TO insurance_worker;
