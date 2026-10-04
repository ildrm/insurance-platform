ALTER TABLE claims.allocations ADD COLUMN coverage_code text NOT NULL DEFAULT 'PROPERTY';
ALTER TABLE claims.allocations DROP CONSTRAINT allocations_pkey;
ALTER TABLE claims.allocations ADD PRIMARY KEY(tenant_id,policy_id,coverage_code);
CREATE FUNCTION platform.lifecycle_tenants() RETURNS TABLE(id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT DISTINCT tenant_id FROM policy.policies WHERE (status='ISSUED' AND effective_at<=now()) OR (status IN('ACTIVE','CANCELLATION_REQUESTED') AND expires_at<=now()) $$;
REVOKE ALL ON FUNCTION platform.lifecycle_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.lifecycle_tenants() TO insurance_worker;
