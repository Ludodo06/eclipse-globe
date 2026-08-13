#!/usr/bin/env python3
import json
from pathlib import Path

PATH = Path('data/nasa-total-eclipses.json')
MIN_YEAR = 1800
EXPECTED_FULL_COUNT = 3173

payload = json.loads(PATH.read_text(encoding='utf-8'))
eclipses = payload.get('eclipses')
if not isinstance(eclipses, list) or len(eclipses) != EXPECTED_FULL_COUNT:
    raise SystemExit(f'Expected validated NASA source with {EXPECTED_FULL_COUNT} total eclipses, got {len(eclipses) if isinstance(eclipses, list) else 0}')

modern = [e for e in eclipses if int(e.get('year', -9999)) >= MIN_YEAR]
if not modern:
    raise SystemExit('Modern eclipse catalog is empty')

source = payload.setdefault('source', {})
source['fullTotalCount'] = EXPECTED_FULL_COUNT
source['totalCount'] = len(modern)
source['minYear'] = MIN_YEAR
source['maxYear'] = max(int(e['year']) for e in modern)
payload['eclipses'] = modern
PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'Filtered catalog: {len(modern)} total eclipses from {MIN_YEAR} onward')
