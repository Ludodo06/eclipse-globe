#!/usr/bin/env python3
"""Build a compact JSON catalog of every total solar eclipse in NASA's 5MCSE.

Source: Five Millennium Catalog of Solar Eclipses (-1999 to +3000).
The generated file contains metadata only. Detailed path geometry is loaded lazily
from NASA's eclipse-path-data endpoint by the browser.
"""

from __future__ import annotations

import json
import math
import re
import urllib.request
from pathlib import Path

CATALOG_URL = "https://eclipse.gsfc.nasa.gov/5MCSE/5MCSEcatalog.txt"
OUT_PATH = Path("data/nasa-total-eclipses.json")
EXPECTED_TOTALS = 3173

MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}

# Several representative anchors per continent. For points over oceans the nearest
# anchor gives a stable "principal continent" for browsing. It is deliberately
# described as an approximate grouping in the generated metadata/UI.
CONTINENT_ANCHORS = {
    "Europe": [(50, 10), (60, 20), (40, -3), (55, -5)],
    "Afrique": [(5, 20), (25, 20), (-20, 25), (10, -5)],
    "Asie": [(35, 90), (55, 60), (20, 105), (45, 120)],
    "Amérique du Nord": [(50, -105), (30, -100), (65, -120), (20, -80)],
    "Amérique du Sud": [(-15, -60), (-35, -65), (5, -70), (-5, -50)],
    "Océanie": [(-25, 135), (-10, 150), (-40, 170), (-5, 125)],
    "Antarctique": [(-82, 0), (-82, 120), (-82, -120)],
}

ROW_RE = re.compile(
    r"^\s*(?P<catalog>\d{5})\s+"
    r"(?P<year>[+-]?\d{4})\s+"
    r"(?P<month>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+"
    r"(?P<day>\d{1,2})\s+"
    r"(?P<time>\d{2}:\d{2}:\d{2})\s+"
)


def angular_distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    cos_d = (
        math.sin(lat1) * math.sin(lat2)
        + math.cos(lat1) * math.cos(lat2) * math.cos(lon1 - lon2)
    )
    return math.acos(max(-1.0, min(1.0, cos_d)))


def principal_continent(lat: float, lng: float) -> str:
    if lat <= -60:
        return "Antarctique"
    best_name = "Europe"
    best_distance = float("inf")
    for name, anchors in CONTINENT_ANCHORS.items():
        if name == "Antarctique":
            continue
        distance = min(angular_distance((lat, lng), anchor) for anchor in anchors)
        if distance < best_distance:
            best_distance = distance
            best_name = name
    return best_name


def parse_coord(token: str) -> float:
    match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)([NSEW])", token)
    if not match:
        raise ValueError(f"Invalid coordinate token: {token!r}")
    value = float(match.group(1))
    if match.group(2) in {"S", "W"}:
        value *= -1
    return value


def maybe_float(token: str):
    try:
        return float(token)
    except (TypeError, ValueError):
        return None


def nasa_id(year: int, month: int, day: int) -> str:
    date = f"{abs(year):04d}{month:02d}{day:02d}"
    return f"-{date}" if year < 0 else date


def parse_catalog(text: str) -> list[dict]:
    totals: list[dict] = []

    for line in text.splitlines():
        match = ROW_RE.match(line)
        if not match:
            continue

        parts = line.split()
        # Standard 5MCSE row columns:
        # Cat, Year, Mon, Day, Time, DeltaT, Luna, Saros, Type, QLE,
        # Gamma, Mag, Lat, Long, Alt, Width, Duration.
        if len(parts) < 15 or parts[8] != "T":
            continue

        year = int(parts[1])
        month = MONTHS[parts[2]]
        day = int(parts[3])
        lat = parse_coord(parts[12])
        lng = parse_coord(parts[13])

        width = maybe_float(parts[15]) if len(parts) > 15 else None
        duration = parts[16] if len(parts) > 16 and re.fullmatch(r"\d{2}m\d{2}s", parts[16]) else None
        continent = principal_continent(lat, lng)

        totals.append({
            "id": f"{nasa_id(year, month, day)}-total",
            "nasaId": nasa_id(year, month, day),
            "catalogNumber": int(parts[0]),
            "year": year,
            "month": month,
            "day": day,
            "monthCode": parts[2],
            "timeTdt": parts[4],
            "deltaTSeconds": maybe_float(parts[5]),
            "lunation": int(parts[6]),
            "saros": int(parts[7]),
            "type": "total",
            "qle": parts[9],
            "gamma": maybe_float(parts[10]),
            "magnitude": maybe_float(parts[11]),
            "focus": [lat, lng],
            "sunAltitudeDeg": maybe_float(parts[14]),
            "maxPathWidthKm": width,
            "maxDuration": duration,
            "continent": continent,
        })

    totals.sort(key=lambda item: (item["year"], item["month"], item["day"], item["timeTdt"]))
    return totals


def main() -> None:
    request = urllib.request.Request(
        CATALOG_URL,
        headers={"User-Agent": "EclipseGlobeCatalogBuilder/1.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read()

    # NASA's file is plain ASCII in practice; latin-1 makes the build robust to
    # occasional legacy bytes in comments/header text.
    text = raw.decode("latin-1")
    totals = parse_catalog(text)

    if len(totals) != EXPECTED_TOTALS:
        raise RuntimeError(
            f"NASA catalog parser found {len(totals)} total eclipses; expected {EXPECTED_TOTALS}. "
            "Refusing to publish an incomplete catalog."
        )

    payload = {
        "source": {
            "publisher": "NASA GSFC / Fred Espenak & Jean Meeus",
            "title": "Five Millennium Catalog of Solar Eclipses: -1999 to +3000",
            "url": CATALOG_URL,
            "totalCount": EXPECTED_TOTALS,
            "continentGrouping": "nearest principal continent to the point of greatest eclipse",
        },
        "eclipses": totals,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Generated {OUT_PATH} with {len(totals)} total solar eclipses")
    print("First:", totals[0])
    print("2026:", next(item for item in totals if item["nasaId"] == "20260812"))
    print("2027:", next(item for item in totals if item["nasaId"] == "20270802"))
    print("Last:", totals[-1])


if __name__ == "__main__":
    main()
