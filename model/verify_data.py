"""Reproduce generated files in a temporary directory and check sample mechanisms."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import generate_sample_data as generator

original=generator.ROOT
with TemporaryDirectory() as directory:
    generator.ROOT=Path(directory)
    generator.main()
    paths=['data/sample_events.csv','web/data/sample_events.json']
    first={p:(generator.ROOT/p).read_bytes() for p in paths}
    generator.main()
    for p in paths:
        assert first[p]==(generator.ROOT/p).read_bytes(),f'Non-reproducible {p}'
        assert first[p]==(original/p).read_bytes(),f'Stale checked-in {p}'
    data=json.loads(first[paths[1]]);rows=data['events']
    assert all(r['is_sample']==1 for r in rows)
    dates={}
    for r in rows:
        assert dates.setdefault(r['date'],r['rain'])==r['rain']
        assert r['exam_period']==int(r['week'] in (7,8) or r['week'] >= (12 if r['semester'].startswith('Fall') else 14))
    assert any(r['club']=='Village STEM LLC' and 35<=r['rsvps']<=45 and r['checked_in'] in (5,6) and r['week']>=7 for r in rows)
    assert any(r['day_of_week'] in ('Fri','Sat') and r['start_hour']>=19 and r['event_type'] not in ('Social','Cultural night') for r in rows)
    assert not any(r['semester'].startswith('Spring') and r['week']==10 for r in rows)
    print(f'PASS: {len(rows)} labeled events; byte-for-byte reproducibility, per-date rain, exam flags and story checks.')
