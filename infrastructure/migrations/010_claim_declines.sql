CREATE TRIGGER independent_claim_decline BEFORE INSERT OR UPDATE ON claims.claims FOR EACH ROW EXECUTE FUNCTION compliance.distinct_approver('DECLINED','proposed_by');
ALTER TABLE claims.claims ADD CONSTRAINT valid_claim_state CHECK(status IN('OPEN','PENDING_APPROVAL','PENDING_DECLINE','APPROVED','PAYMENT_PENDING','PAID','DECLINED'));
