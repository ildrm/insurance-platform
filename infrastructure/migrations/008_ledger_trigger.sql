-- PL/pgSQL must resolve only the fields belonging to the triggering row type.
CREATE OR REPLACE FUNCTION ledger.balance_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE jid uuid; n bigint; total numeric;
BEGIN
  IF TG_TABLE_NAME='journals' THEN jid:=NEW.id; ELSE jid:=NEW.journal_id; END IF;
  SELECT count(*),coalesce(sum(CASE WHEN side='DEBIT' THEN amount_minor::numeric ELSE -amount_minor::numeric END),0)
  INTO n,total FROM ledger.postings WHERE tenant_id=NEW.tenant_id AND journal_id=jid;
  IF n<2 OR total<>0 THEN RAISE EXCEPTION 'Unbalanced journal'; END IF;
  RETURN NULL;
END $$;
