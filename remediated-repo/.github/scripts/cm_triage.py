import json
import sys
import os

if len(sys.argv) < 2:
    print("Usage: python3 cm_triage.py <path_to_report.json>")
    sys.exit(1)

try:
    with open(sys.argv[1], 'r') as f:
        data = json.load(f)
except Exception as e:
    print(f"Error reading report: {e}")
    sys.exit(1)

findings = data.get('findings', []) if isinstance(data, dict) else data
if not isinstance(findings, list): findings = []

severities = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
# Only these are worth spending an autonomous fix on. Anything below HIGH is
# reported but never patched automatically.
FIXABLE = ("CRITICAL", "HIGH")

max_sev_value, max_sev_name = 0, "NONE"
high_critical_count = 0
candidates = []

for position, finding in enumerate(findings):
    # Handle snake_case (cm v0.8.0+), PascalCase (cm v0.5-v0.7), and custom json keys
    sev = (finding.get('Severity') or finding.get('severity') or 'LOW').upper()
    fid = finding.get('finding_id') or finding.get('FindingID') or finding.get('id') or ''
    sev_value = severities.get(sev, 0)

    if sev_value > max_sev_value:
        max_sev_value, max_sev_name = sev_value, sev
    if sev in FIXABLE:
        high_critical_count += 1
        if fid:
            # Keep the report position so equal severities stay in the order
            # CodeMender found them.
            candidates.append((sev_value, position, sev, fid))

# Most severe first; CRITICAL always outranks HIGH. Without this the fix loop
# takes whatever happened to be first in the report, which may be the least
# important finding of the run.
candidates.sort(key=lambda c: (-c[0], c[1]))
fix_ids = [c[3] for c in candidates]

with open(os.environ.get('GITHUB_OUTPUT', 'output.txt'), 'a') as f:
    f.write(f"fix_ids={' '.join(fix_ids)}\n")
    f.write(f"max_severity={max_sev_name}\n")
    f.write(f"high_critical={high_critical_count}\n")

print(f"Triage complete. Max severity: {max_sev_name}")
print(f"Findings: {len(findings)} total, {high_critical_count} HIGH/CRITICAL")

if candidates:
    print("Remediation queue (most severe first):")
    for _, _, sev, fid in candidates:
        print(f"  {sev:<8} {fid}")
else:
    print("No HIGH/CRITICAL findings. Nothing will be auto-remediated.")
