CREATE TABLE integrations.sandbox_faults(resource_reference uuid NOT NULL,effect text NOT NULL,mode text NOT NULL CHECK(mode IN('LOST_RESPONSE','DECLINED')),remaining int NOT NULL DEFAULT 1,PRIMARY KEY(resource_reference,effect));
GRANT SELECT,INSERT,UPDATE ON integrations.sandbox_faults TO insurance_worker;
