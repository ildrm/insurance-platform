"""Validate design completeness and referential consistency, without claiming runtime tests."""
from pathlib import Path
import csv
import json
import re

ROOT = Path(__file__).resolve().parents[1]
CAT = ROOT / "catalogues"

def rows(name):
    with (CAT / name).open() as file:
        return list(csv.DictReader(file))

def require(condition, message):
    if not condition:
        raise SystemExit("FAIL: " + message)

source = (ROOT / "source/request.md").read_text()
reqs, traces = rows("requirements.csv"), rows("traceability.csv")
nonblank = [(i,s.strip()) for i,s in enumerate(source.splitlines(),1) if s.strip()]
require(len(reqs)==len(nonblank), "source clauses lost")
require([int(r["source_line"]) for r in reqs] == [i for i,_ in nonblank], "source line coverage differs")
for req, (_,line) in zip(reqs,nonblank):
    require(req["source_clause"]==re.sub(r"^(?:- |\d+\. |# \d+\. )","",line), f"clause changed: {req['requirement_id']}")
req_ids={r["requirement_id"] for r in reqs}
require(len(req_ids)==len(reqs),"duplicate requirement ID")
require(req_ids=={r["requirement_id"] for r in traces} and len(traces)==len(reqs), "traceability not one-to-one")
require({int(s["source_section"]) for s in rows("sections.csv")}==set(range(1,99)), "98-section coverage incomplete")
owners=json.loads((CAT / "owners.json").read_text())
tests={r["test_id"] for r in rows("tests.csv")}
apis={r["api_id"] for r in rows("apis.csv")}
for trace in traces:
    require(trace["domain"] in owners, "unknown trace owner")
    require(trace["test"] in tests, "unknown acceptance test")
    require(trace["api_contract"] in apis, "unknown API/design contract")
    require(all(trace.values()), "empty traceability field")
blueprint=(ROOT / "blueprint.md").read_text()
headings=re.findall(r"^## (\d+)\. (.+)$",blueprint,re.M)
require([int(i) for i,_ in headings]==list(range(1,59)), "58-section order differs")
expected=["Executive Architecture Summary","Assumptions","Functional Requirement Catalogue","Non-Functional Requirements","Actor Catalogue","Roles and Permissions","Domain Map","Bounded Contexts","Context Relationships","Aggregate Catalogue","Domain Event Catalogue","Product Architecture","Rating Architecture","Underwriting Architecture","Quote Architecture","Policy Architecture","Claims Architecture","Finance/Ledger Architecture","Commission Architecture","Settlement Architecture","Provider Architecture","Distribution Architecture","Integration Architecture","AI Architecture","Fraud Architecture","Security Architecture","Privacy Architecture","Data Architecture","API Architecture","Event Architecture","Workflow Architecture","Frontend Architecture","UX Architecture","PWA Architecture","Docker Architecture","Network Architecture","Observability Architecture","Analytics Architecture","Backup and Disaster Recovery","Repository Structure","Dependency Rules","State Machines","C4 Diagrams","Sequence Diagrams","ER Diagrams","ADRs","Testing Strategy","CI/CD Architecture","Performance Strategy","Scaling Strategy","Threat Model","Failure-Mode Analysis","Compliance Matrix","Requirement Traceability Matrix","Implementation Roadmap","Risk Register","Open Decisions Requiring Jurisdiction-Specific Input","Final Architecture Review"]
require([title for _,title in headings]==expected,"requested heading titles differ")
personas=[s[2:] for s in source.split("# 1. Mission")[0].splitlines() if s.startswith("- ")]
reviews=(ROOT / "reviews.md").read_text()
for persona in personas:
    require(f"| {persona} |" in reviews, "missing persona: "+persona)
machines=json.loads((CAT / "state-machines.json").read_text())
expected_machines={"Quote","Underwriting Case","Policy","Endorsement","Claim","Payment","Refund","Settlement","KYC","Vendor Onboarding","Complaint","Assistance Request"}
require(set(machines)==expected_machines,"required state machines missing")
event_rows=rows("events.csv")
events={e["event_type"] for e in event_rows}
require(len(events)==len(event_rows),"duplicate event type")
for name,machine in machines.items():
    states=set(machine["states"])
    require(machine["initial"] in states,"invalid initial state")
    require(set(machine["terminal_states"])<=states,"unknown terminal state")
    seen=set()
    reachable={machine["initial"]}
    for transition in machine["transitions"]:
        require(all(transition.values()), "transition without guard/effect/event/timeout")
        require(transition["from_state"] in states and transition["to_state"] in states,"unknown transition state")
        require(transition["event"] in events,"uncatalogued transition event")
        require(transition["from_state"] not in machine["terminal_states"],"terminal has outgoing transition: "+name)
        key=(transition["from_state"],transition["command"])
        require(key not in seen,"ambiguous command transition")
        seen.add(key)
    for _ in states:
        reachable |= {t["to_state"] for t in machine["transitions"] if t["from_state"] in reachable}
    require(reachable==states,"unreachable states: "+name)
diagram_doc=(ROOT / "diagrams.md").read_text()
require([int(i) for i in re.findall(r"^## (\d+)\.",diagram_doc,re.M)]==list(range(1,19)),"diagram view coverage missing")
mermaid=re.findall(r"```mermaid\n(.*?)```",diagram_doc,re.S)
require(len(mermaid)>=18,"not all views have Mermaid source")
require(all(m.lstrip().startswith(("flowchart ","sequenceDiagram","erDiagram")) for m in mermaid),"unknown Mermaid diagram declaration")
adrs=(ROOT / "adrs.md").read_text()
adr_blocks=re.split(r"^## ADR-",adrs,flags=re.M)[1:]
require(len(adr_blocks)>=16,"mandatory ADR count incomplete")
for block in adr_blocks:
    for field in ("Context:","Decision:","Alternatives:","Advantages:","Disadvantages:","Consequences:","Migration path"):
        require(field in block,"ADR field missing: "+field)

def slug(title):
    title=re.sub(r"[^\w\- ]","",title.lower())
    return title.replace(" ","-")

repo=ROOT.parents[1]
docs=list(ROOT.rglob("*.md"))+[repo/"README.md",repo/"infrastructure/reference/README.md"]
checked_links=0
for path in docs:
    text=path.read_text()
    require(text.count("```") % 2 == 0, "unbalanced code fences: "+str(path))
    for destination in re.findall(r"\]\(([^)]+)\)",text):
        if destination.startswith(("https://","http://","mailto:")):
            continue
        file_part,_,anchor=destination.partition("#")
        target=path.parent/file_part if file_part else path
        require(target.exists(),f"broken local link {path.name}: {destination}")
        if anchor and target.suffix==".md":
            target_titles=re.findall(r"^#{1,6} (.+)$",target.read_text(),re.M)
            require(anchor in {slug(t) for t in target_titles},f"broken anchor {path.name}: {destination}")
        checked_links+=1
print(f"PASS: {len(reqs)} source clauses; 98 sections; 58 ordered blueprint headings; {len(personas)} personas; {len(events)} events; 12 reachable guarded state machines; {len(mermaid)} Mermaid sources; {len(adr_blocks)} ADRs; {checked_links} local links.")
print("Scope: design consistency only. Runtime, Mermaid renderer, actuarial/legal, security, load and recovery acceptance remain separate evidence gates.")
