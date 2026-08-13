#!/usr/bin/env python3
"""Build a compact JSON catalog of every total solar eclipse in NASA's 5MCSE."""

from __future__ import annotations

import json
import math
import re
import urllib.request
from pathlib import Path

CATALOG_URL = "https://eclipse.gsfc.nasa.gov/5MCSE/5MCSEcatalog.txt"
OUT_PATH = Path("data/nasa-total-eclipses.json")
EXPECTED_TOTALS = 3173
MONTHS = {"Jan":1,"Feb":2,"Mar":3,"Apr":4,"May":5,"Jun":6,"Jul":7,"Aug":8,"Sep":9,"Oct":10,"Nov":11,"Dec":12}
CONTINENT_ANCHORS = {
    "Europe": [(50,10),(60,20),(40,-3),(55,-5)],
    "Afrique": [(5,20),(25,20),(-20,25),(10,-5)],
    "Asie": [(35,90),(55,60),(20,105),(45,120)],
    "Amérique du Nord": [(50,-105),(30,-100),(65,-120),(20,-80)],
    "Amérique du Sud": [(-15,-60),(-35,-65),(5,-70),(-5,-50)],
    "Océanie": [(-25,135),(-10,150),(-40,170),(-5,125)],
    "Antarctique": [(-82,0),(-82,120),(-82,-120)],
}


def angular_distance(a, b):
    lat1, lon1 = map(math.radians, a); lat2, lon2 = map(math.radians, b)
    cos_d = math.sin(lat1)*math.sin(lat2)+math.cos(lat1)*math.cos(lat2)*math.cos(lon1-lon2)
    return math.acos(max(-1.0,min(1.0,cos_d)))


def principal_continent(lat, lng):
    if lat <= -60: return "Antarctique"
    candidates = {name:min(angular_distance((lat,lng),a) for a in anchors)
                  for name,anchors in CONTINENT_ANCHORS.items() if name != "Antarctique"}
    return min(candidates, key=candidates.get)


def parse_coord(token):
    m = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)([NSEW])", token)
    if not m: raise ValueError(f"Invalid coordinate token: {token!r}")
    v=float(m.group(1)); return -v if m.group(2) in "SW" else v


def maybe_float(token):
    try: return float(token)
    except (TypeError, ValueError): return None


def nasa_id(year, month, day):
    date=f"{abs(year):04d}{month:02d}{day:02d}"; return f"-{date}" if year < 0 else date


def parse_catalog(text):
    totals=[]
    for line in text.splitlines():
        parts=line.split()
        year_idx=None
        for i in range(min(4, max(0, len(parts)-4))):
            if (re.fullmatch(r"[+-]?\d{4}", parts[i]) and parts[i+1] in MONTHS
                    and re.fullmatch(r"\d{1,2}", parts[i+2]) and re.fullmatch(r"\d{2}:\d{2}:\d{2}", parts[i+3])):
                year_idx=i; break
        if year_idx is None: continue
        type_idx=year_idx+7
        if len(parts) <= type_idx or not parts[type_idx].startswith("T"):
            continue
        # We need through Sun azimuth. One-limit/non-central totals may omit width/duration.
        if len(parts) <= type_idx+6:
            continue

        try:
            year=int(parts[year_idx]); month=MONTHS[parts[year_idx+1]]; day=int(parts[year_idx+2]); time_tdt=parts[year_idx+3]
            delta_t=maybe_float(parts[year_idx+4]); lunation=int(parts[year_idx+5]); saros=int(parts[year_idx+6])
            subtype=parts[type_idx]
            gamma=maybe_float(parts[type_idx+1]); magnitude=maybe_float(parts[type_idx+2])
            lat=parse_coord(parts[type_idx+3]); lng=parse_coord(parts[type_idx+4])
            sun_alt=maybe_float(parts[type_idx+5]); sun_azm=maybe_float(parts[type_idx+6])
            width=maybe_float(parts[type_idx+7]) if len(parts)>type_idx+7 else None
            duration=parts[type_idx+8] if len(parts)>type_idx+8 and re.fullmatch(r"\d{2}m\d{2}s",parts[type_idx+8]) else None
            catalog_number=int(parts[year_idx-2]) if year_idx>=2 and parts[year_idx-2].isdigit() else None
            canon_plate=int(parts[year_idx-1]) if year_idx>=1 and parts[year_idx-1].isdigit() else None
        except (ValueError, IndexError):
            continue

        nid=nasa_id(year,month,day)
        totals.append({
            "id":f"{nid}-total","nasaId":nid,"catalogNumber":catalog_number,"canonPlate":canon_plate,
            "year":year,"month":month,"day":day,"monthCode":parts[year_idx+1],"timeTdt":time_tdt,
            "deltaTSeconds":delta_t,"lunation":lunation,"saros":saros,"type":"total","typeCode":subtype,
            "gamma":gamma,"magnitude":magnitude,"focus":[lat,lng],"sunAltitudeDeg":sun_alt,"sunAzimuthDeg":sun_azm,
            "maxPathWidthKm":width,"maxDuration":duration,"continent":principal_continent(lat,lng)
        })
    totals.sort(key=lambda x:(x["year"],x["month"],x["day"],x["timeTdt"]))
    return totals


def main():
    req=urllib.request.Request(CATALOG_URL,headers={"User-Agent":"EclipseGlobeCatalogBuilder/1.0"})
    with urllib.request.urlopen(req,timeout=60) as r: raw=r.read()
    totals=parse_catalog(raw.decode("latin-1"))
    if len(totals)!=EXPECTED_TOTALS:
        raise RuntimeError(f"NASA catalog parser found {len(totals)} total eclipses; expected {EXPECTED_TOTALS}. Refusing to publish an incomplete catalog.")
    payload={"source":{"publisher":"NASA GSFC / Fred Espenak & Jean Meeus","title":"Five Millennium Catalog of Solar Eclipses: -1999 to +3000","url":CATALOG_URL,"totalCount":EXPECTED_TOTALS,"continentGrouping":"nearest principal continent to the point of greatest eclipse"},"eclipses":totals}
    OUT_PATH.parent.mkdir(parents=True,exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print(f"Generated {OUT_PATH} with {len(totals)} total solar eclipses")
    print("2026:",next(x for x in totals if x["nasaId"]=="20260812"))
    print("2027:",next(x for x in totals if x["nasaId"]=="20270802"))

if __name__=="__main__": main()
