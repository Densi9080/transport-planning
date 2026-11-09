"""Download the hackathon fragment of Irkutsk (Gosuniversitet - Zhukovskogo stops)
from the OSM API and check it against the organizers' example.osm.

Usage: python -I export_osm.py [output.osm] [reference.osm]
"""
import sys
import urllib.request
import xml.etree.ElementTree as ET

# Same bounds as <bounds> in hack_task/example.osm: minlon,minlat,maxlon,maxlat
BBOX = "104.2565600,52.2511300,104.2677000,52.2694200"
URL = f"https://api.openstreetmap.org/api/0.6/map?bbox={BBOX}"
USER_AGENT = "hack-team4-osm-export/1.0"


def download(path):
    request = urllib.request.Request(URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=300) as response:
        data = response.read()
    with open(path, "wb") as f:
        f.write(data)
    print(f"saved {path}: {len(data)} bytes")


def versions(root, tag):
    return {el.get("id"): el.get("version") for el in root.findall(tag)}


def check_integrity(root):
    node_ids = {n.get("id") for n in root.findall("node")}
    missing = sum(1 for w in root.findall("way") for nd in w.findall("nd")
                  if nd.get("ref") not in node_ids)
    print(f"way node refs missing from file: {missing}")


def compare(root, reference):
    for tag in ("node", "way", "relation"):
        new, old = versions(root, tag), versions(reference, tag)
        changed = sum(1 for i in new.keys() & old.keys() if new[i] != old[i])
        print(f"{tag}: now={len(new)} example={len(old)} "
              f"added={len(new.keys() - old.keys())} "
              f"removed={len(old.keys() - new.keys())} version_changed={changed}")


def main():
    output = sys.argv[1] if len(sys.argv) > 1 else "irkutsk_center.osm"
    download(output)
    root = ET.parse(output).getroot()
    check_integrity(root)
    if len(sys.argv) > 2:
        compare(root, ET.parse(sys.argv[2]).getroot())


if __name__ == "__main__":
    main()
