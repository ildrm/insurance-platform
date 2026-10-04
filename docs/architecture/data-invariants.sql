-- DESIGN PATTERNS, not the complete application migration. Apply through owner
-- migrations with reviewed runtime roles, schemas and real portfolio grants.
-- PostgreSQL-specific; no universal application superuser or BYPASSRLS role.
-- Trusted application code validates actor/grants BEFORE setting transaction
-- context. GUC-based RLS is not a sandbox against a compromised runtime able to
-- change its own context; parameterized SQL and workload isolation still matter.

CREATE SCHEMA IF NOT EXISTS policy;
CREATE SCHEMA IF NOT EXISTS ledger;

CREATE TABLE policy.policy_version_example (
    tenant_id uuid NOT NULL,
    id uuid NOT NULL,
    policy_id uuid NOT NULL,
    revision bigint NOT NULL CHECK (revision > 0),
    effective_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    contract_snapshot jsonb NOT NULL,
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, policy_id, revision),
    CHECK (effective_at < expires_at)
);

ALTER TABLE policy.policy_version_example ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy.policy_version_example FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_boundary ON policy.policy_version_example
USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Repository execution pattern (parameter bindings, not interpolated SQL):
-- BEGIN;
-- SELECT set_config('app.tenant_id', $1, true);
-- SELECT set_config('app.actor_id', $2, true);
-- SELECT ... WHERE tenant_id=$1 AND id=$3 AND <owner/grant predicate>;
-- COMMIT;
-- SET LOCAL state clears at transaction end; no queries outside scoped tx.
-- Acquire issuer-tenant scope only after explicit customer/resource grant check.
-- Runtime role is not table owner. Do not grant TRUNCATE or migration roles.

CREATE TABLE ledger.book_example (
    tenant_id uuid NOT NULL,
    id uuid NOT NULL,
    legal_entity_ref uuid NOT NULL,
    PRIMARY KEY (tenant_id, id)
);
CREATE TABLE ledger.account_example (
    tenant_id uuid NOT NULL,
    book_id uuid NOT NULL,
    id uuid NOT NULL,
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    account_type text NOT NULL,
    PRIMARY KEY (tenant_id, book_id, id, currency),
    FOREIGN KEY (tenant_id, book_id) REFERENCES ledger.book_example (tenant_id, id)
);
CREATE TABLE ledger.journal_example (
    tenant_id uuid NOT NULL,
    book_id uuid NOT NULL,
    id uuid NOT NULL,
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    source_effect_key text NOT NULL,
    accounting_date date NOT NULL,
    effective_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    reversal_of uuid,
    PRIMARY KEY (tenant_id, book_id, id, currency),
    UNIQUE (tenant_id, book_id, source_effect_key),
    FOREIGN KEY (tenant_id, book_id) REFERENCES ledger.book_example (tenant_id, id),
    FOREIGN KEY (tenant_id, book_id, reversal_of, currency)
        REFERENCES ledger.journal_example (tenant_id, book_id, id, currency)
);
CREATE TABLE ledger.posting_example (
    tenant_id uuid NOT NULL,
    book_id uuid NOT NULL,
    id uuid NOT NULL,
    journal_id uuid NOT NULL,
    account_id uuid NOT NULL,
    currency text NOT NULL,
    amount_minor numeric(38,0) NOT NULL CHECK (amount_minor > 0),
    direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
    PRIMARY KEY (tenant_id, book_id, id),
    FOREIGN KEY (tenant_id, book_id, journal_id, currency)
        REFERENCES ledger.journal_example (tenant_id, book_id, id, currency),
    FOREIGN KEY (tenant_id, book_id, account_id, currency)
        REFERENCES ledger.account_example (tenant_id, book_id, id, currency)
);

-- numeric(38,0) is exact integer minor units; application ingress must reject
-- fractional input before PostgreSQL's typmod coercion can round it. Never pass
-- JS Number. JSON DTO amount_minor is a validated integer string.

CREATE FUNCTION ledger.reject_financial_mutation_example() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, ledger AS $$
BEGIN
    RAISE EXCEPTION 'Posted journal and posting records are immutable';
END;
$$;
CREATE TRIGGER immutable_journal_example
BEFORE UPDATE OR DELETE ON ledger.journal_example
FOR EACH ROW EXECUTE FUNCTION ledger.reject_financial_mutation_example();
CREATE TRIGGER immutable_posting_example
BEFORE UPDATE OR DELETE ON ledger.posting_example
FOR EACH ROW EXECUTE FUNCTION ledger.reject_financial_mutation_example();

CREATE FUNCTION ledger.assert_balanced_journal_example() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, ledger AS $$
DECLARE
    v_journal uuid;
    v_count bigint;
    v_net numeric;
BEGIN
    IF TG_TABLE_NAME = 'journal_example' THEN
        v_journal := NEW.id;
    ELSE
        v_journal := NEW.journal_id;
    END IF;
    SELECT count(*), coalesce(sum(CASE direction WHEN 'debit' THEN amount_minor
                                       ELSE -amount_minor END), 0)
      INTO v_count, v_net
      FROM ledger.posting_example
      WHERE tenant_id = NEW.tenant_id AND book_id = NEW.book_id
        AND journal_id = v_journal AND currency = NEW.currency;
    IF v_count < 2 OR v_net <> 0 THEN
        RAISE EXCEPTION 'Journal requires two or more balanced postings';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER balanced_on_journal_example
AFTER INSERT ON ledger.journal_example DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ledger.assert_balanced_journal_example();
CREATE CONSTRAINT TRIGGER balanced_on_posting_example
AFTER INSERT ON ledger.posting_example DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ledger.assert_balanced_journal_example();

-- A closed journal must not accept additional postings in later transactions,
-- even balanced ones. The ledger posting procedure must restrict insertion to
-- the journal's creation transaction. The pattern below enforces this without
-- trusting caller-supplied creation flags.
ALTER TABLE ledger.journal_example
    ADD COLUMN creation_tx xid8 NOT NULL DEFAULT pg_current_xact_id();
CREATE FUNCTION ledger.assert_new_journal_example() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, ledger AS $$
DECLARE v_creation xid8;
BEGIN
    SELECT creation_tx INTO v_creation FROM ledger.journal_example
      WHERE tenant_id=NEW.tenant_id AND book_id=NEW.book_id
        AND id=NEW.journal_id AND currency=NEW.currency;
    IF v_creation IS DISTINCT FROM pg_current_xact_id() THEN
        RAISE EXCEPTION 'Cannot append postings to a previously committed journal';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER posting_new_journal_example
BEFORE INSERT ON ledger.posting_example
FOR EACH ROW EXECUTE FUNCTION ledger.assert_new_journal_example();

-- Runtime INSERT privileges must be column-scoped or mediated by the posting
-- procedure so callers cannot supply creation_tx. No UPDATE/DELETE/TRUNCATE.
-- Owner migrations enable+force tenant RLS on ALL ledger tables with the same
-- USING/WITH CHECK policy as above, and grant only the ledger port's DB role.
-- A book/customer/capture lock separately enforces period, availability, refund
-- and payout limits; journal balance alone does not prove those invariants.
-- Multi-currency exchanges post one balanced currency journal per leg plus
-- bridge/FX gain-loss mappings; no meaningless summing across currencies.

-- Optimistic concurrency pattern:
-- UPDATE claims.claim SET version=version+1, decision_ref=$4
-- WHERE tenant_id=$1 AND id=$2 AND version=$3;
-- Require one affected row; otherwise 412 and no effect. For shared cover limits,
-- lock the policy-term-cover bucket; count paid AND in-flight allocations.
-- Refund/payout lock ordering is stable by book/capture/obligation UUID.
