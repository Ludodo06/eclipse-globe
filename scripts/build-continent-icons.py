#!/usr/bin/env python3
"""Generate compact continent silhouette SVGs from Natural Earth 1:110m data."""

from __future__ import annotations

import json
import math
import urllib.request
from pathlib import Path

SOURCE_URLS = [
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
    "https://cdn.jsdelivr.net/gh/vasturiano/globe.gl@master/example/datasets/ne_110m_admin_0_countries.geojson",
]
OUT_DIR = Path("assets/continents")
WIDTH = 160.0
HEIGHT = 100.0
PADDING = 7.0

REGIONS = {
    "world": {"continents": None, "bbox": None},
    "europe": {"continents": {"Europe"}, "bbox": (-25.0, 45.0, 34.0, 72.0), "exclude_admin": {"Russia"}},
    "africa": {"continents": {"Africa"}, "bbox": (-20.0, 55.0, -38.0, 38.0)},
    "asia": {"continents": {"Asia"}, "bbox": (25.0, 180.0, -10.0, 82.0), "include_russia": True},
    "north-america": {"continents": {"North America"}, "bbox": (-170.0, -20.0, 5.0, 84.0)},
    "south-america": {"continents": {"South America"}, "bbox": (-90.0, -30.0, -60.0, 15.0)},
    "oceania": {"continents": {"Oceania"}, "bbox": None, "wrap_oceania": True},
    "antarctica": {"continents": {"Antarctica"}, "bbox": None, "polar": True},
}


def fetch_geojson():
    last_error = None
    for url in SOURCE_URLS:
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "EclipseGlobeIconBuilder/1.0"})
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8")), url
        except Exception as exc:  # pragma: no cover - network fallback
            last_error = exc
            print(f"Natural Earth source unavailable: {url}: {exc}")
    raise RuntimeError(f"Unable to fetch Natural Earth data: {last_error}")


def polygons(geometry):
    if not geometry:
        return []
    kind = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if kind == "Polygon":
        return [coords]
    if kind == "MultiPolygon":
        return coords
    return []


def clip_edge(points, inside, intersect):
    if not points:
        return []
    output = []
    previous = points[-1]
    previous_inside = inside(previous)
    for current in points:
        current_inside = inside(current)
        if current_inside:
            if not previous_inside:
                output.append(intersect(previous, current))
            output.append(current)
        elif previous_inside:
            output.append(intersect(previous, current))
        previous = current
        previous_inside = current_inside
    return output


def clip_ring(ring, bbox):
    points = [tuple(point[:2]) for point in ring]
    if len(points) > 1 and points[0] == points[-1]:
        points.pop()
    if len(points) < 3 or bbox is None:
        return points

    xmin, xmax, ymin, ymax = bbox

    def vertical(x_value):
        def intersection(a, b):
            dx = b[0] - a[0]
            if abs(dx) < 1e-12:
                return (x_value, a[1])
            t = (x_value - a[0]) / dx
            return (x_value, a[1] + (b[1] - a[1]) * t)
        return intersection

    def horizontal(y_value):
        def intersection(a, b):
            dy = b[1] - a[1]
            if abs(dy) < 1e-12:
                return (a[0], y_value)
            t = (y_value - a[1]) / dy
            return (a[0] + (b[0] - a[0]) * t, y_value)
        return intersection

    points = clip_edge(points, lambda p: p[0] >= xmin, vertical(xmin))
    points = clip_edge(points, lambda p: p[0] <= xmax, vertical(xmax))
    points = clip_edge(points, lambda p: p[1] >= ymin, horizontal(ymin))
    points = clip_edge(points, lambda p: p[1] <= ymax, horizontal(ymax))
    return points if len(points) >= 3 else []


def project(region_name, lon, lat):
    config = REGIONS[region_name]
    if config.get("polar"):
        radius = max(0.0, 90.0 + lat)
        angle = math.radians(lon)
        return radius * math.sin(angle), -radius * math.cos(angle)
    if config.get("wrap_oceania") and lon < 0:
        lon += 360.0
    return lon, -lat


def selected_feature(region_name, feature):
    config = REGIONS[region_name]
    props = feature.get("properties") or {}
    admin = props.get("ADMIN")
    if admin in config.get("exclude_admin", set()):
        return False
    wanted = config.get("continents")
    if wanted is None:
        return True
    continent = props.get("CONTINENT")
    if continent in wanted:
        return True
    return bool(config.get("include_russia") and admin == "Russia")


def region_geometry(region_name, features):
    bbox = REGIONS[region_name].get("bbox")
    shapes = []
    for feature in features:
        if not selected_feature(region_name, feature):
            continue
        for polygon in polygons(feature.get("geometry")):
            rings = []
            for ring in polygon:
                clipped = clip_ring(ring, bbox)
                if len(clipped) < 3:
                    continue
                rings.append([project(region_name, lon, lat) for lon, lat in clipped])
            if rings:
                shapes.append(rings)
    return shapes


def svg_for(region_name, shapes, source_url):
    points = [point for polygon in shapes for ring in polygon for point in ring]
    if not points:
        raise RuntimeError(f"No geometry generated for {region_name}")

    min_x = min(point[0] for point in points)
    max_x = max(point[0] for point in points)
    min_y = min(point[1] for point in points)
    max_y = max(point[1] for point in points)
    span_x = max(max_x - min_x, 1e-9)
    span_y = max(max_y - min_y, 1e-9)
    scale = min((WIDTH - 2 * PADDING) / span_x, (HEIGHT - 2 * PADDING) / span_y)
    offset_x = (WIDTH - span_x * scale) / 2.0
    offset_y = (HEIGHT - span_y * scale) / 2.0

    def screen(point):
        x = offset_x + (point[0] - min_x) * scale
        y = offset_y + (point[1] - min_y) * scale
        return x, y

    path_elements = []
    for polygon in shapes:
        parts = []
        for ring in polygon:
            coords = [screen(point) for point in ring]
            if len(coords) < 3:
                continue
            parts.append("M" + " ".join(f"{x:.2f},{y:.2f}" for x, y in coords) + "Z")
        if parts:
            path_elements.append(
                f'  <path d="{" ".join(parts)}" fill="#f4f7fb" stroke="#f4f7fb" stroke-width="0.9" stroke-linejoin="round" fill-rule="evenodd"/>'
            )

    return "\n".join([
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" role="img">',
        f'  <!-- Natural Earth 1:110m public-domain geometry. Source: {source_url} -->',
        *path_elements,
        '</svg>',
        '',
    ])


def main():
    payload, source_url = fetch_geojson()
    features = payload.get("features") or []
    if not features:
        raise RuntimeError("Natural Earth dataset contains no features")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for region_name in REGIONS:
        shapes = region_geometry(region_name, features)
        svg = svg_for(region_name, shapes, source_url)
        output = OUT_DIR / f"{region_name}.svg"
        output.write_text(svg, encoding="utf-8")
        print(f"Generated {output} ({len(svg)} bytes)")


if __name__ == "__main__":
    main()
