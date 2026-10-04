CREATE UNIQUE INDEX users_email_case_insensitive ON identity.users(lower(email));
CREATE TABLE identity.mfa_counters(user_id uuid PRIMARY KEY REFERENCES identity.users(id),last_counter bigint NOT NULL);
GRANT SELECT,INSERT,UPDATE ON identity.mfa_counters TO insurance_app;

-- A person may hold several accounts; approval must be independent of that person.
CREATE FUNCTION compliance.distinct_approver() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE proposer uuid; approver uuid; proposer_party uuid; approver_party uuid;
BEGIN
  IF NEW.status=TG_ARGV[0] THEN
    proposer := (to_jsonb(NEW)->>TG_ARGV[1])::uuid;
    approver := NEW.approved_by;
    SELECT party_id INTO proposer_party FROM identity.users WHERE id=proposer AND tenant_id=NEW.tenant_id;
    SELECT party_id INTO approver_party FROM identity.users WHERE id=approver AND tenant_id=NEW.tenant_id;
    IF proposer_party IS NULL OR approver_party IS NULL OR proposer_party=approver_party THEN
      RAISE EXCEPTION 'Approval requires a different canonical person in the tenant' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER independent_product_approval BEFORE INSERT OR UPDATE ON product.versions FOR EACH ROW EXECUTE FUNCTION compliance.distinct_approver('PUBLISHED','created_by');
CREATE TRIGGER independent_provider_approval BEFORE INSERT OR UPDATE ON integrations.providers FOR EACH ROW EXECUTE FUNCTION compliance.distinct_approver('APPROVED','created_by');
CREATE TRIGGER independent_claim_approval BEFORE INSERT OR UPDATE ON claims.claims FOR EACH ROW EXECUTE FUNCTION compliance.distinct_approver('APPROVED','proposed_by');
CREATE TRIGGER independent_settlement_approval BEFORE INSERT OR UPDATE ON settlement.batches FOR EACH ROW EXECUTE FUNCTION compliance.distinct_approver('APPROVED','proposed_by');

ALTER TABLE claims.documents ADD COLUMN object_version text;
REVOKE UPDATE ON claims.documents FROM insurance_app;
ALTER TABLE platform.operations ADD COLUMN workflow_started_at timestamptz;
CREATE OR REPLACE FUNCTION platform.pending_operations() RETURNS TABLE(id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT id FROM platform.operations WHERE status='PENDING' AND workflow_started_at IS NULL ORDER BY created_at LIMIT 100 $$;
CREATE FUNCTION platform.mark_workflow_started(op uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ UPDATE platform.operations SET workflow_started_at=now() WHERE id=op AND status='PENDING' $$;
REVOKE ALL ON FUNCTION platform.mark_workflow_started(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.mark_workflow_started(uuid) TO insurance_worker;

CREATE TABLE claims.decisions(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,party_id uuid NOT NULL,claim_id uuid NOT NULL REFERENCES claims.claims(id),actor_id uuid NOT NULL REFERENCES identity.users(id),decision text NOT NULL,reason text NOT NULL,amount_minor bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE claims.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims.decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY decision_scope ON claims.decisions USING ((current_setting('app.role',true)='CUSTOMER' AND party_id=nullif(current_setting('app.party_id',true),'')::uuid) OR (current_setting('app.role',true)!='CUSTOMER' AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)) WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE TRIGGER immutable_claim_decision BEFORE UPDATE OR DELETE ON claims.decisions FOR EACH ROW EXECUTE FUNCTION platform.immutable();
GRANT SELECT,INSERT ON claims.decisions TO insurance_app,insurance_worker;
