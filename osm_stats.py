"""Print the composition of an .osm file: bounds, element counts, key tags."""
import sys
import xml.etree.ElementTree as ET
from collections import Counter


def stats(path):
    root = ET.parse(path).getroot()
    bounds = root.find("bounds")
    nodes = root.findall("node")
    ways = root.findall("way")
    relations = root.findall("relation")

    print(f"file: {path}")
    print(f"generator: {root.get('generator')}")
    if root.find("meta") is not None:
        print(f"osm_base: {root.find('meta').get('osm_base')}")
    print(f"bounds: {dict(bounds.attrib) if bounds is not None else None}")
    print(f"nodes={len(nodes)} ways={len(ways)} relations={len(relations)}")

    lats = [float(n.get("lat")) for n in nodes]
    lons = [float(n.get("lon")) for n in nodes]
    print(f"node extent: lat {min(lats)}..{max(lats)} lon {min(lons)}..{max(lons)}")
    print(f"nodes with version attr: {sum(1 for n in nodes if n.get('version'))}")

    def tags(el):
        return {t.get("k"): t.get("v") for t in el.findall("tag")}

    way_keys, highway, railway, node_kinds, rel_types = (Counter() for _ in range(5))
    untagged_scope = 0
    for w in ways:
        t = tags(w)
        way_keys.update(k for k in t if k in
                        ("highway", "railway", "building", "public_transport",
                         "landuse", "natural", "amenity", "waterway", "leisure", "barrier"))
        if "highway" in t:
            highway[t["highway"]] += 1
        if "railway" in t:
            railway[t["railway"]] += 1
        if not any(k in t for k in ("highway", "railway", "building", "public_transport")):
            untagged_scope += 1
    for n in nodes:
        t = tags(n)
        for key in ("highway", "railway", "public_transport"):
            if key in t:
                node_kinds[f"{key}={t[key]}"] += 1
        if t and not any(k in t for k in ("highway", "railway", "public_transport")):
            node_kinds["(other tagged)"] += 1
    for r in relations:
        t = tags(r)
        rel_types[f"{t.get('type')}:{t.get('route') or t.get('restriction') or ''}"] += 1

    print(f"ways outside highway/railway/building/public_transport: {untagged_scope}")
    for title, c in (("way keys", way_keys), ("highway", highway), ("railway", railway),
                     ("tagged nodes", node_kinds), ("relations", rel_types)):
        print(f"-- {title}: {dict(c.most_common(30))}")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        stats(p)
