import sys
import re

if len(sys.argv) < 2:
    sys.exit(1)

in_diff = False
try:
    with open(sys.argv[1], 'r') as f:
        for line in f:
            if line.startswith('diff --git') or line.startswith('--- '):
                in_diff = True
            # Stop if we hit a log prefix that breaks the diff block or completion marker
            if in_diff and re.match(r'^(202\d-\d\d-\d\dT|\d{4}/\d{2}/\d{2} |\[INFO\]|\[WARN\]|✅|🔧)', line):
                in_diff = False
            if in_diff:
                print(line, end='')
except Exception:
    pass
