ALTER TABLE platform.operations DROP CONSTRAINT operations_kind_resource_id_key;
CREATE UNIQUE INDEX operation_in_flight ON platform.operations(kind,resource_id) WHERE status='PENDING';
