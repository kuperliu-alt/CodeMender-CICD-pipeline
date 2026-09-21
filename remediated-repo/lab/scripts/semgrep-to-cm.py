#!/usr/bin/env python3
"""semgrep JSON -> the 'simple JSON' shape `cm report import` accepts.

    semgrep scan --config=p/javascript --json -o /tmp/semgrep.json src/
    python3 lab/scripts/semgrep-to-cm.py /tmp/semgrep.json -o /tmp/cm-findings.json
    cm report import -f /tmp/cm-findings.json -p .

The intermediate files live in /tmp so they never land in the repository, where
they would otherwise be picked up by `git add -A` and read by the fix agent.

Each emitted record uses these keys:

    file_path   path as semgrep reported it, relative to the scan CWD
    line        1-based start line
    title       rule id, last segment, title-cased
    message     "[rule.id] semgrep's message"
    severity    HIGH | MEDIUM | LOW, mapped from ERROR | WARNING | INFO
    vuln_type   CWE id (e.g. "CWE-95"), or "CWE-noinfo" when absent

Paths are passed through untouched, so `cm report import -p <dir>` is what
anchors them. Moving this file's input or output does not affect resolution.
"""
import argparse
import json
import sys

SEV = {"ERROR": "HIGH", "WARNING": "MEDIUM", "INFO": "LOW"}


def cwe_of(md):
    """semgrep puts CWE in metadata.cwe, as a string or a list of strings."""
    c = md.get("cwe")
    if isinstance(c, list):
        c = c[0] if c else None
    if not c:
        return None
    return c.split(":")[0].strip() or None


def convert(sg):
    out = []
    for r in sg.get("results", []):
        extra = r.get("extra", {})
        md = extra.get("metadata", {}) or {}
        line = (r.get("start") or {}).get("line") or 0
        if not r.get("path") or line < 1:
            continue
        rule = r.get("check_id", "semgrep")
        out.append({
            "file_path": r["path"],
            "line": line,
            "title": rule.rsplit(".", 1)[-1].replace("-", " ").replace("_", " ").title(),
            "message": f"[{rule}] {extra.get('message','').strip()}",
            "severity": SEV.get(str(extra.get("severity", "")).upper(), "MEDIUM"),
            "vuln_type": cwe_of(md) or "CWE-noinfo",
        })
    return out


def main():
    ap = argparse.ArgumentParser(description="Convert Semgrep JSON output to CodeMender simple JSON import format")
    ap.add_argument("semgrep_json", help="Path to Semgrep JSON output")
    ap.add_argument("-o", "--out", required=True, help="Output path for cm-findings.json")
    a = ap.parse_args()

    try:
        with open(a.semgrep_json, "r") as f:
            sg = json.load(f)
    except Exception as e:
        sys.exit(f"Error reading Semgrep JSON: {e}")

    rows = convert(sg)
    with open(a.out, "w") as f:
        json.dump(rows, f, indent=2)

    print(f"✅ Converted {len(rows)} Semgrep finding(s) -> {a.out}")
    for r in rows:
        print(f"  [{r['severity']:6}] {r['vuln_type']:12} {r['file_path']}:{r['line']}")


if __name__ == "__main__":
    main()
