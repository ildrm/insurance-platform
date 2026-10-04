ALTER TABLE product.versions ADD COLUMN rating_rules jsonb;
ALTER TABLE product.versions ADD COLUMN certification_reference text;
ALTER TABLE product.versions ADD COLUMN carrier_adapter_id uuid;
ALTER TABLE product.versions ADD COLUMN payment_adapter_id uuid;
CREATE TABLE integrations.providers(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('CARRIER','PAYMENT')),name text NOT NULL,version text NOT NULL,endpoint text NOT NULL,encrypted_credential text NOT NULL,certification_reference text NOT NULL,status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','APPROVED')),created_by uuid NOT NULL,approved_by uuid,created_at timestamptz NOT NULL DEFAULT now(),CHECK(status!='APPROVED' OR (approved_by IS NOT NULL AND created_by<>approved_by)),UNIQUE(tenant_id,kind,name,version));
ALTER TABLE integrations.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.providers FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_scope ON integrations.providers USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE FUNCTION integrations.protect_adapter() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status='APPROVED' THEN RAISE EXCEPTION 'Approved adapter version is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_adapter BEFORE UPDATE OR DELETE ON integrations.providers FOR EACH ROW EXECUTE FUNCTION integrations.protect_adapter();
GRANT SELECT,INSERT,UPDATE ON integrations.providers TO insurance_app,insurance_worker;
CREATE UNIQUE INDEX policy_renewed_once ON policy.policies(renewed_from) WHERE renewed_from IS NOT NULL;

ALTER TABLE settlement.batches ADD COLUMN payment_adapter_id uuid;
