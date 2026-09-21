import json
import os
import sys

# Exit codes are the interface here: the pipeline loop runs this inside an `if`,
# so the verdict has to come back as a status, not as a parsed string.
EXIT_FIX = 0      # go ahead and remediate
EXIT_SKIP = 3     # verification does not believe this finding
EXIT_USAGE = 1

# Only an outright dismissal blocks remediation.
#
# EXPLOIT_FAILED deliberately does NOT block. cm only attempts an exploit once
# the agent is already at 70%+ confidence, so that status means "confident but
# could not build a working proof", which is not evidence the bug is fake. A
# missing or inconclusive status does not block either: verification going
# quiet is not the same as verification saying no.
BLOCKING = {"DISMISSED"}

if len(sys.argv) < 3:
    print("Usage: python3 cm_verdict.py <path_to_report.json> <finding_id>")
    sys.exit(EXIT_USAGE)

report_path, finding_id = sys.argv[1], sys.argv[2]

try:
    with open(report_path, 'r') as f:
        data = json.load(f)
except Exception as e:
    print(f"Error reading report: {e}")
    data = []

findings = data.get('findings', []) if isinstance(data, dict) else data
if not isinstance(findings, list): findings = []

match = None
for finding in findings:
    # Handle snake_case (cm v0.8.0+), PascalCase (cm v0.5-v0.7), and custom json keys
    fid = finding.get('finding_id') or finding.get('FindingID') or finding.get('id') or ''
    # cm accepts an ID prefix, so the report may carry the full UUID even
    # though we verified using a shorter form.
    if fid == finding_id or fid.startswith(finding_id) or finding_id.startswith(fid):
        match = finding
        break

if match is None:
    status, confidence = "NOT_FOUND", ""
else:
    status = (match.get('Status') or match.get('status') or '').upper() or "UNKNOWN"
    confidence = match.get('Confidence', match.get('confidence', ''))

print(f"  status:     {status}" + (f" (confidence: {confidence}%)" if confidence != "" else ""))

if status in BLOCKING:
    print("  verdict:    dismissed as not exploitable. Skipping remediation.")
    sys.exit(EXIT_SKIP)

if status == "VERIFIED":
    print("  verdict:    confirmed exploitable. Remediating.")
elif status == "EXPLOIT_FAILED":
    print("  verdict:    believed real but no working exploit was produced. Remediating anyway.")
elif status == "NOT_FOUND":
    print("  verdict:    finding missing from the report. Remediating anyway.")
else:
    print("  verdict:    inconclusive. Remediating anyway.")

sys.exit(EXIT_FIX)
