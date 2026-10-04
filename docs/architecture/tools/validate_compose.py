"""Validate Compose structure using dummy NONDEPLOYABLE fixtures; never starts/pulls images."""
from pathlib import Path
import json
import os
import re
import subprocess
import tempfile

REPO=Path(__file__).resolve().parents[3]
REF=REPO/"infrastructure/reference"
with tempfile.TemporaryDirectory(prefix="insurance-compose-spec-") as directory:
    tmp=Path(directory)
    (tmp/"secrets").mkdir()
    (tmp/"config").mkdir()
    base=(REF/"compose.yaml").read_text()
    for name in re.findall(r'LOCAL_SECRET_DIR:\?\}/([^"}]+)',base):
        (tmp/"secrets"/name).write_text("non-secret structure-validation fixture\n")
    for name in ("test_config","ingress_tls"):
        (tmp/"secrets"/name).write_text("non-secret structure-validation fixture\n")
    env=dict(os.environ)
    for key in re.findall(r"^([A-Z_]+)=",(REF/".env.example").read_text(),re.M):
        env[key]="spec-placeholder:validation" if key.endswith("IMAGE") else ("1000:1000" if key.endswith("RUNTIME_USER") else "0.0.0")
    env["LOCAL_SECRET_DIR"]=str(tmp/"secrets")
    env["LOCAL_CONFIG_DIR"]=str(tmp/"config")
    first_party={"customer-web","partner-web","admin-web","developer-web","api","worker","workflow-worker","integration-worker","bootstrap","provision"}
    for label,files in (("core",["compose.yaml"]),("development",["compose.yaml","compose.dev.yaml"]),("integration-test",["compose.yaml","compose.dev.yaml","compose.test.yaml"]),("production-reference",["compose.yaml","compose.prod.yaml"])):
        command=["rtk","proxy","docker","compose"]
        for file in files:
            command.extend(["-f",str(REF/file)])
        command.extend(["--profile","*","config","--format","json"])
        result=subprocess.run(command,capture_output=True,text=True,env=env,cwd=REPO)
        if result.returncode:
            raise SystemExit(f"FAIL {label}: {result.stderr}")
        config=json.loads(result.stdout)
        services=config["services"]
        for name in first_party:
            service=services[name]
            assert service["user"]=="1000:1000",(label,name,"non-root missing")
            assert service["read_only"] and "ALL" in service["cap_drop"],(label,name,"hardening missing")
            assert service.get("healthcheck"),(label,name,"health/one-shot declaration missing")
        for name,service in services.items():
            assert name=="reverse-proxy" or not service.get("ports"),(label,name,"private port published")
            assert service.get("user") and service["user"].split(":")[0] not in {"0","root"},(label,name,"non-root declaration missing")
        graph={name:set(s.get("depends_on",{})) for name,s in services.items()}
        pending=set(graph)
        while pending:
            ready={name for name in pending if not (graph[name]&pending)}
            assert ready,(label,"dependency cycle")
            pending-=ready
        if label=="production-reference":
            ports=services["reverse-proxy"]["ports"]
            assert len(ports)==1 and str(ports[0]["published"])=="443",ports
            assert not any(name.startswith("mock-") for name in services)
        print(f"PASS {label}: {len(services)} services; no dependency cycle; first-party non-root/hardening; private ports; correct port override.")
print("Configuration-only validation using dummy image/config fixtures. No container built, started or certified; no version compatibility or runtime readiness implied.")
