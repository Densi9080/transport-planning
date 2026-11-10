# OSM lane and junction geometry libraries; exact tag handling in SUMO netconvert, MATSim SupersonicOsmNetworkReader and Webots osm_importer (state of main/master on 2026-11-09)

Method: source files were downloaded from GitHub raw on 2026-11-09 and read directly (full read of `NIImporter_OpenStreetMap.cpp`, including `RelationHandler` to the end of the file, of `SupersonicOsmNetworkReader.java`, of `road.py`). Line numbers refer to that day's main/master. Latest commits touching the code read: SUMO importer 2026-10-30 ("keeping stop. refs #18454"), MATSim `networkReader` 2026-07-16, Webots `resources/osm_importer` 2026-08-07. Nothing was executed; all behaviour is from reading code and docs.

## Libraries for lane and intersection geometry usable in a browser editor

### Takeaway
Only osm2streets computes actual lane polygons and intersection polygons and has a WASM binding, but its npm package dates from 2023 and repo activity stopped in October 2025, so it should be built from git. For tag-to-lane parsing in TypeScript there is one direct option (Graphmasters `osm-lanes`, brand new, v0.1.0); Muv `muv-osm` is the most actively developed Rust parser and has an optional wasm-bindgen feature but no published package was found. No library surveyed computes lane-to-lane junction connectivity in the form netconvert does.

### Cited Findings

**osm2streets** ([repo](https://github.com/a-b-street/osm2streets))
- License Apache-2.0, Rust, last commit 2025-10-02, not archived, 160 stars — [GitHub API](https://api.github.com/repos/a-b-street/osm2streets).
- Schema: roads as thickened line-strings with a left-to-right lane list (type, direction, width); intersections as polygons with each road meeting at a perpendicular angle; "Planned: turning movements and crosswalks" — [README](https://github.com/a-b-street/osm2streets/blob/main/README.md).
- Transformations: collapsing unnecessary 2-road intersections, merging sausage links and dual carriageways, merging dog-legs and short roads into one logical intersection, snapping parallel cycletracks and footways — [README](https://github.com/a-b-street/osm2streets/blob/main/README.md). Enum: `ZipSidepaths`, `RemoveDisconnectedRoads`, `CollapseShortRoads`, `CollapseDegenerateIntersections`, `MergeDualCarriageways` — [transform/mod.rs](https://github.com/a-b-street/osm2streets/blob/main/osm2streets/src/transform/mod.rs).
- WASM: `osm2streets-js` crate exposes `new JsStreetNetwork(osm_input: &[u8], clip_pts_geojson, input)`, `toGeojsonPlain`, `toLanePolygonsGeojson`, `toLaneMarkingsGeojson`, `toIntersectionMarkingsGeojson`, `debugMovementsFromLaneGeojson`, `getOsmTagsForWay`, `wayToXml`, `overwriteOsmTagsForWay`, `collapseShortRoad`, `findBlock`, `findAllBlocks` — [osm2streets-js/src/lib.rs](https://github.com/a-b-street/osm2streets/blob/main/osm2streets-js/src/lib.rs).
- npm `osm2streets-js` latest 0.1.4, registry last modified 2023-06-04, Apache-2.0 — [npm registry](https://registry.npmjs.org/osm2streets-js).

**osm2lanes** ([repo](https://github.com/a-b-street/osm2lanes))
- Apache-2.0, Rust, archived, last push 2023-03-09; README: "This repository is archived and unmaintained. Work continues instead with osm2streets" — [README](https://github.com/a-b-street/osm2lanes/blob/main/README.md). Its `data/tests.yml` test cases and `spec-lanes.json` remain a useful corpus — same README. The osm2streets repo also contains an `osm2lanes` directory and an `osm2lanes-js` directory — [repo tree](https://github.com/a-b-street/osm2streets).
- Package name `osm2lanes` returns Not found on npm — [npm registry](https://registry.npmjs.org/osm2lanes).

**Muv / muv-osm** ([GitLab](https://gitlab.com/LeLuxNet/Muv))
- `muv-osm` is MPL-2.0, Rust edition 2024, version 0.1.0, `crate-type = ["lib", "cdylib"]`, with optional `wasm-bindgen`, `js-sys`, `serde-wasm-bindgen` deps and a `wasm-bindgen` feature; a `lanes` feature exists — [muv-osm/Cargo.toml](https://gitlab.com/LeLuxNet/Muv/-/blob/main/muv-osm/Cargo.toml).
- README: parsing of OSM tags "with its flagship feature being the ability to extract lanes data", and states it is currently used by osm2streets. Only `muv-transit-ticket` is GPL; other crates MPL-2.0 — [README](https://gitlab.com/LeLuxNet/Muv/-/blob/main/README.md).
- GitLab `last_activity_at` 2026-11-04, 2 stars — [GitLab API](https://gitlab.com/api/v4/projects/LeLuxNet%2FMuv). Lanes source directory has `lanes.rs`, `lane.rs`, `travel.rs`, `parking.rs`, `highway/`, `railway/` — [tree](https://gitlab.com/LeLuxNet/Muv/-/tree/main/muv-osm/src/lanes).
- An osm2streets issue describes Muv as doing the tags-to-lanes job better than the code in osm2streets or osm2lanes — [osm2streets#232](https://github.com/a-b-street/osm2streets/issues/232).

**Graphmasters osm-lanes** ([repo](https://github.com/Graphmasters/osm-lanes))
- Apache-2.0, TypeScript, zero runtime dependencies, ESM/CJS/IIFE builds; npm `osm-lanes` 0.1.0, registry modified 2026-11-09; 0 stars — [package.json](https://github.com/Graphmasters/osm-lanes/blob/main/package.json), [npm](https://registry.npmjs.org/osm-lanes).
- `interpretLanes(tags)` is a pure function returning `RoadLanes` (`forward`, `backward`, `bothWays`, `cycleways`, `oneway`, `warnings`); covers `lanes`, `turn:lanes`, `change:lanes`, `bus:lanes`, `maxspeed:lanes`, `destination:lanes`; `renderLanesSvg` draws a diagram. Scope is per-way tags plus SVG, no junction geometry — [README](https://github.com/Graphmasters/osm-lanes/blob/main/README.md).
- README states the code was generated with Claude under human direction and review — [README](https://github.com/Graphmasters/osm-lanes/blob/main/README.md). Relevant only as a maturity signal, alongside version 0.1.0.

**OSMnx** ([repo](https://github.com/gboeing/osmnx))
- MIT, Python, last push 2026-11-07, 5893 stars — [GitHub API](https://api.github.com/repos/gboeing/osmnx). `simplify_graph` removes interstitial nodes; `consolidate_intersections(tolerance=10)` merges by buffering, and "tolerance represents a per-node buffering radius", so 10 m consolidation needs `tolerance=5` — [simplification.py](https://github.com/gboeing/osmnx/blob/main/osmnx/simplification.py). Graph topology only, no lanes.

**CityFlow converter** ([repo](https://github.com/cityflow-project/CityFlow))
- Apache-2.0, C++, last push 2025-08-19 — [GitHub API](https://api.github.com/repos/cityflow-project/CityFlow). `tools/converter/converter.py` converts SUMO `.net.xml` to CityFlow JSON and requires SUMO; there is no OSM reader in that directory — [converter readme](https://github.com/cityflow-project/CityFlow/blob/master/tools/converter/readme.md).

**Validators**
- JOSM `Lanes.java`: warns when `*:lanes` value counts are inconsistent, when `lanes` exceeds `*:lanes` count, and when `lanes:forward + lanes:backward > lanes` — [Lanes.java](https://github.com/JOSM/josm/blob/master/src/org/openstreetmap/josm/data/validation/tests/Lanes.java). File header "License: GPL".
- JOSM `ConnectivityRelations.java`: missing or unusual `connectivity` tag, inconsistent lane numbering between relation and member tags, "This connectivity may already be implied" — [ConnectivityRelations.java](https://github.com/JOSM/josm/blob/master/src/org/openstreetmap/josm/data/validation/tests/ConnectivityRelations.java).
- JOSM `TurnrestrictionTest.java`: includes "The "from" way does not start or end at a "via" node", "from way equals to way", superfluous restrictions on oneways, unconnected via ways — [TurnrestrictionTest.java](https://github.com/JOSM/josm/blob/master/src/org/openstreetmap/josm/data/validation/tests/TurnrestrictionTest.java).
- JOSM MapCSS rules: `resources/data/validator/` holds `highway.mapcss`, `combinations.mapcss`, `geometry.mapcss`, `numeric.mapcss`, `relation.mapcss`, and more; `highway.mapcss` includes regexes validating `turn:lanes*` values — [highway.mapcss](https://github.com/JOSM/josm/blob/master/resources/data/validator/highway.mapcss).
- Osmose `plugins/Highway_Lanes.py` (GPL-3.0, repo pushed 2026-10-26): bad lanes value, conflict between `*:lanes` and directional variants, invalid `*:lanes:backward` on oneway, unknown turn lane value, bad turn lane order, `merge_to_*` needing an adjacent lane, unknown change lanes value — [Highway_Lanes.py](https://github.com/osm-fr/osmose-backend/blob/master/plugins/Highway_Lanes.py).
- iD (ISC, JavaScript/TypeScript, pushed 2026-11-09) has browser-native validators `almost_junction.ts`, `close_nodes.ts`, `crossing_ways.ts`, `disconnected_way.ts`, `impossible_oneway.ts`, `mismatched_geometry.js`, `missing_tag.ts` — [modules/validations](https://github.com/openstreetmap/iD/tree/develop/modules/validations). No dedicated lanes module exists in `modules/osm` on `develop`; `way.ts` only reads `lanes` with `parseInt` — [way.ts](https://github.com/openstreetmap/iD/blob/develop/modules/osm/way.ts).
- SUMO `tools/net/netcheck.py` reports connected components of a built `.net.xml`, with `--component-output` — [Tools/Net](https://github.com/eclipse-sumo/sumo/blob/main/docs/web/docs/Tools/Net.md).

**Others checked (metadata only)**: OSM2World MIT, Java, pushed 2026-11-04 ([API](https://api.github.com/repos/tordanik/OSM2World)); streets-gl MIT, TypeScript, pushed 2025-08-21 ([API](https://api.github.com/repos/StrandedKitty/streets-gl)); Lanelet2 BSD-3, C++, pushed 2026-10-10 ([API](https://api.github.com/repos/fzi-forschungszentrum-informatik/Lanelet2)); parking-lanes MIT, TypeScript, pushed 2024-11-27 ([API](https://api.github.com/repos/zlant/parking-lanes)).

### Inferences
- Practical stack for a TypeScript editor: `osm-lanes` or a small in-house parser for per-way lane display; osm2streets built with wasm-pack from `main` for lane and intersection polygons; iD validators as a code reference for connectivity checks, since iD is ISC and browser-native. JOSM and Osmose rules are GPL, so reimplement the logic rather than copying code if the editor is not GPL-compatible.
- osm2streets' own transformations (dual carriageway merge, short-road collapse) produce a model different from what netconvert, MATSim and Webots will see from the file. Use it for preview only, or the preview will show a simplified network that the simulators do not build.
- The most accurate turn-lane parser for this pipeline is a TypeScript port of the 40 lines of `EdgesHandler::myStartElement` in SUMO, because netconvert is the only consumer that acts on `turn:lanes`. See its semantics in the next section.

### Gaps
- `muv-osm`: crates.io returned 404 for the name and no npm package was located, so distribution for browser use is build-from-source only; I did not build it. Quality comparison against osm2streets was not tested.
- Whether osm2streets on `main` already uses Muv for parsing rests on Muv's README and issue #232; `Cargo.toml` dependencies of osm2streets were not checked.
- `OsmLaneVisualizer` (mueschel) appeared in search but was not examined. Pyodide viability for OSMnx in a browser was not checked.
- JOSM's overall license is reported NOASSERTION by GitHub; only the per-file "GPL" header was seen.

## SUMO netconvert: exactly which OSM tags are read

### Takeaway
netconvert reads far fewer tags than OSM offers and silently drops many that look relevant: `type=connectivity`, `restriction:conditional`, `highway=stop`, `give_way`, `traffic_calming`, `traffic_signals:direction`, `bridge`, `tunnel`, `motor_vehicle` and `vehicle` are not read. Options that look like defaults are mostly off: `turn:lanes`, sidewalks, crossings, lane access, `ele` and `layer` have no effect unless the matching `--osm.*` option is given.

### Cited Findings

**Way tag filter.** `EdgesHandler::myStartElement` returns early for any key not on its allow-list: keys ending in `way`, starting with `lanes`, `cycleway`, `sidewalk`, `parking`, `change`, `vehicle:lanes`, `width`, `turn:*:lanes`, plus `maxspeed`, `maxspeed:type`, `zone:maxspeed`, `maxspeed:forward`, `maxspeed:backward`, `junction`, `name`, `tracks`, `layer`, `route`, `ref`, `highspeed`, `access`, `emergency`, `service`, `electrified`, `segregated`, `bus`, `psv`, `foot`, `bicycle`, `oneway:bicycle`, `oneway:bus`, `oneway:psv`, `placement`, `bus:lanes*`, `psv:lanes*`, `bicycle:lanes*`, `postal_code`, `usage`, `public_transport`, `railway:*` subset — [NIImporter_OpenStreetMap.cpp L1914-1959](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L1914-L1959). Note `oneway` passes via the `endsWith("way")` test. `bridge`, `tunnel`, `motor_vehicle`, `vehicle`, `motorcar`, `hgv`, `area`, `surface` are not on the list and are ignored unless `--osm.all-attributes` is set, which only stores them as edge params — same lines and [L1909-1912](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L1909-L1912).

**Node tag filter.** `NodesHandler::myStartElement` reads only `highway`, `ele`, `crossing`, `railway`, `public_transport`, `name`, `train`, `bus`, `tram`, `light_rail`, `subway`, `station`, `noexit`, `crossing:barrier`, `crossing:light`, `railway:ref`, `railway:signal*`, `railway:position*` — [L1663-1670](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L1663-L1670).

**maxspeed.** Keys `maxspeed`, `maxspeed:type`, `maxspeed:forward`, `zone:maxspeed` set the speed only while it is still unset, so the first usable one in file order wins; `maxspeed:backward` is separate — [L2217-2222](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2217-L2222). A `maxspeed:backward` tag forces `addBackward = true`, so it creates a reverse edge even on a oneway — [`insertEdge` L746-749](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L746-L749). Speed map: `RU:urban`=60, `RU:rural`=90, `RU:motorway`=110, `RU:living_street`=20 km/h; `none`/`no` use `--osm.speedlimit-none`; `walk`=5 km/h; `nan`, `sign`, `signals` mean unset — [L1772-1844](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L1772-L1844). `interpretSpeed` also handles `XX:30` and `XX:zone30` forms by stripping the country prefix — [L2376-2396](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2376-L2396). Plain numbers are km/h; units `km/h`, `kph`, `kmh`, `kmph`, `m/s`, `mph`, `knots` accepted — [StringUtils::parseSpeed L661-684](https://github.com/eclipse-sumo/sumo/blob/main/src/utils/common/StringUtils.cpp#L661-L684).

**lanes.** `insertEdge` L679-718 — [source](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L679-L718):
- Oneway: forward lanes = `lanes:forward` if >0, else `lanes`.
- Two-way with `lanes` only: forward = ceil(lanes/2), backward = rest, each direction min 1.
- `lanes=0`: edge skipped with warning.
- No `lanes` tag: type default applies to each direction separately.
- `lanes:forward` and `lanes:backward` are stored in one signed field, so the later tag overwrites the earlier; a total is derived when `lanes` is absent — [L2194-2216](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2194-L2216).
- `lanes=1` on a two-way road yields two edges of one lane each; with no width tag each lane width is halved and routing type `narrow` set — [L754-769](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L754-L769).
- A semicolon list uses the minimum, with a warning — [L2172-2190](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2172-L2190).

**turn:lanes** (only applied with `--osm.turn-lanes`, default false — [NIFrame L212](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIFrame.cpp#L212)).
- Parsed for all `turn:*:lanes*` keys; `none`, empty and `through` map to STRAIGHT; `left`/`sharp_left` to LEFT; `right`/`sharp_right` to RIGHT; `slight_*` to PARTLEFT/PARTRIGHT; `reverse` to TURN; `merge_to_*` to NODIR. Keys ending in `lanes` or `lanes:forward` apply to forward; `turn:bus`/`turn:psv`, `turn:taxi`, `turn:bicycle` go in per-class bit blocks — [L2305-2350](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2305-L2350).
- Lane count must equal driving lanes on the edge, otherwise "Ignoring turn sign information" — [`applyTurnSigns` L1564-1579](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L1564-L1579).
- Signs are used only on the edge ending at the way's last node (first node for backward): `setTurnSignTarget(last->getID())` at [L936](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L936) and the test `myTurnSignTarget != myTo->getID()` at [NBEdge.cpp L2993](https://github.com/eclipse-sumo/sumo/blob/main/src/netbuild/NBEdge.cpp#L2993).
- If there are more signed directions than target edges, the signs are dropped with a warning and connections are guessed — [NBEdge::applyTurnSigns L2727-2775](https://github.com/eclipse-sumo/sumo/blob/main/src/netbuild/NBEdge.cpp#L2727-L2775).
- Docs caution: on roads where only some lanes have markings, unmarked lanes are treated as through — [OpenStreetMap.md L125-126](https://github.com/eclipse-sumo/sumo/blob/main/docs/web/docs/Networks/Import/OpenStreetMap.md).

**width, width:lanes.** `width` is the total for raw lanes, divided by lane count; applied unless `--ignore-widths` — [L732-737](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L732-L737). `width:lanes` and `width:lanes:forward` go to forward, `width:lanes:backward` to backward — [L2123-2141](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2123-L2141). The list length is compared with `nbe->getLanes().size()` after sidewalk and bike lanes have been added, so a mismatch discards widths with a warning — [L943-973](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L943-L973). `parseDist` accepts bare metres and units such as `m`, `km`, `mi`, `ft` — [StringUtils L613-639](https://github.com/eclipse-sumo/sumo/blob/main/src/utils/common/StringUtils.cpp#L613-L639).

**change:lanes.** `change`, `change:lanes`, plus `:forward`, `:backward` variants; values `no`, `not_left`, `not_right`, always applied, no option needed; left and right map to permission only for `SVC_AUTHORITY` — [L2279-2284](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2279-L2284), [L1511-1523](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L1511-L1523).

**Traffic signals.** `highway` value containing `traffic_signal`, or `crossing` containing `traffic_signals`, sets `tlsControlled` — [L1672-1675](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L1672-L1675). `direction` and `traffic_signals:direction` are not in the node key list, so they have no effect — [L1663-1670](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L1663-L1670). A signal node on a way is always instantiated as a junction because `nodeUsage` is incremented — [L235-241](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L235-L241). `railway:signal:direction` exists but only for rail.

**Crossing, stop, give_way, traffic_calming.** `highway=crossing` sets `pedestrianCrossing` — [L1676-1677](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L1676-L1677). It only matters with `--osm.crossings` (default false), and a crossing is added only where the incoming edge has both a driving lane and a sidewalk lane — [L292-369](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L292-L369). The docs say crossings work when `--osm.sidewalks` is set — [OpenStreetMap.md L633](https://github.com/eclipse-sumo/sumo/blob/main/docs/web/docs/Networks/Import/OpenStreetMap.md). There is no branch for `highway=stop`, `highway=give_way` or `traffic_calming`; those values reach only the harmless final `interpretTransportType(key)` or are filtered out — [L1672-1733](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L1672-L1733).

**Relations (`RelationHandler`).**
- `type=restriction` with key `restriction` starting `only_` or `no_`. Key match is exact, so `restriction:conditional` and `restriction:hgv` are not read; a relation carrying only those is dropped as "unknown type" — [L2640-2661](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2640-L2661), [L2725-2743](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2725-L2743). `except=psv;bicycle;hgv;motorcar;emergency` is honoured — [L2662-2676](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2662-L2676).
- Via must be a node: "interpreting via-ways or via-node lists not yet implemented", and the relation is ignored with a warning — [`applyRestriction` L2940-2944](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2940-L2944).
- `findEdgeRef` matches by string prefix of the way id among edges at the via node and returns null if more than one matches ("Ambiguous way reference") — [L2949-2967](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2949-L2967).
- `type=connectivity` is not read. The only `type` values acted on are `restriction` and `route` — [L2642-2649](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2642-L2649). The feature request is open: "OSM: import connectivity relation" (opened 2022-03-03, last updated 2025-09-23) — [issue #10268](https://github.com/eclipse-sumo/sumo/issues/10268). The OSM wiki lists SUMO among software with requests for support — [Relation:connectivity](https://wiki.openstreetmap.org/wiki/Relation:connectivity).
- `type=route` with `route` in train, subway, light_rail, monorail, tram, bus, trolleybus, aerialway, ferry, share_taxi, minibus creates a PT line. Member roles starting `stop` or `platform` give stops; empty-role ways give the path; other roles such as `forward` are not consumed; a line with no stops is discarded — [L2574-2632](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2574-L2632), [L2682-2687](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2682-L2687), [L2824-2885](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2824-L2885). `public_transport=stop_area` links platforms to stops — [L2744-2823](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2744-L2823).
- `--ptline-output` requires `--ptstop-output` — [NWFrame.cpp L184-185](https://github.com/eclipse-sumo/sumo/blob/main/src/netwrite/NWFrame.cpp#L184-L185). Tutorial command: `netconvert --osm-files osm.xml -o net.net.xml --osm.stop-output.length 20 --ptstop-output additional.xml --ptline-output ptlines.xml` — [PT_from_OpenStreetMap.md](https://github.com/eclipse-sumo/sumo/blob/main/docs/web/docs/Tutorials/PT_from_OpenStreetMap.md).

**Stops and platforms.** Node `public_transport=stop_position` or `highway=bus_stop` sets `ptStopPosition` — [L1705-1711](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L1705-L1711). Way `public_transport=platform` is stored as a platform shape if the way is not a road; closed platform polygons are not supported — [L2271-2272](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2271-L2272), [L2766-2768](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2766-L2768).

**layer, bridge, tunnel, ele.** `layer` is stored and used only by `reconstructLayerElevation` when `--osm.layer-elevation` > 0 (default 0) — [L371-374](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L371-L374), [NIFrame L187](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIFrame.cpp#L187). `ele` is read only with `--osm.elevation` (default false) — [L1714](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L1714). `bridge` and `tunnel` are not read.

**Other structural behaviour.**
- Two OSM nodes at identical lat and lon are substituted into one node, `CompareNodes` compares only lat and lon — [L1640-1647](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L1640-L1647), [header L292-297](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.h#L292-L297).
- Way end nodes are always built; interior nodes only if used by more than one way — [L258-275](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L258-L275).
- Ways with `action="delete"` are skipped — [L1866-1869](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L1866-L1869).
- `oneway`: `yes/true/1`, `no/false/0`, `-1`, `reverse`; other values warn — [L653-666](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L653-L666). `junction=roundabout` or `circular` implies oneway only if no `oneway` was seen earlier, and only `roundabout` sets roundabout priority — [L2223-2229](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2223-L2229).
- `access=no` removes all but public, emergency and authority classes; other `access` values are not handled — [L2119-2122](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2119-L2122).
- `placement=left_of:N|right_of:N|middle_of:N` shifts the shape, only on explicit oneway forward edges — [L831-892](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L831-L892), [L2425-2455](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L2425-L2455).

**Type defaults** — [osmNetconvert.typ.xml](https://github.com/eclipse-sumo/sumo/blob/main/data/typemap/osmNetconvert.typ.xml) (used when no `--type-files`; passing `--type-files` replaces it, so include it explicitly — [docs L105-106](https://github.com/eclipse-sumo/sumo/blob/main/docs/web/docs/Networks/Import/OpenStreetMap.md)):

| highway | lanes per dir | m/s (km/h) | oneway | notes |
|---|---|---|---|---|
| motorway | 2 | 39.44 (142) | true | no ped, bike, moped |
| trunk | 2 | 27.78 (100) | false | |
| primary | 2 | 27.78 (100) | false | |
| secondary | 1 | 27.78 (100) | false | |
| tertiary | 1 | 22.22 (80) | false | |
| *_link | 1 | 22.22 (80) | true only for motorway_link | |
| unclassified, residential | 1 | 13.89 (50) | false | |
| living_street | 1 | 2.78 (10) | false | |
| service | 1 | 5.56 (20) | false | `allow="delivery pedestrian bicycle"`, so no passenger cars |
| track | 1 | 5.56 | false | motorcycle, moped, ped, bike only |
| footway, pedestrian | 1 | 2.78 | true | width 2, pedestrian only |

`highway.construction` is `discard="true"`. A `highway` value not in the map leaves the way unimported — [L1966-1968](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp#L1966-L1968).

**--osm.\* options and defaults** — [NIFrame.cpp L181-239](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIFrame.cpp#L181-L239):

| option | default | effect |
|---|---|---|
| osm.skip-duplicates-check | false | skips duplicate node and edge check |
| osm.elevation | false | import `ele` |
| osm.layer-elevation | 0 | raise each layer by N m |
| osm.layer-elevation.max-grade | 10 | percent at 50 km/h |
| osm.oneway-spread-right | false | spread oneways right instead of centered |
| osm.lane-access | false | apply `bus:lanes`, `psv:lanes`, `bicycle:lanes`, `vehicle:lanes` |
| osm.bike-access | false | bike lanes, directions, permissions |
| osm.sidewalks | false | import sidewalks |
| osm.oneway-reverse-sidewalk | false | two sidewalks on oneways |
| osm.crossings | false | import `highway=crossing` |
| osm.turn-lanes | false | use `turn:lanes` arrows |
| osm.stop-output.length | 25 | bus 15, tram 25, train 200 |
| osm.railsignals | DEFAULT | main and combined signals |
| osm.all-attributes | false | store tags as params |
| osm.extra-attributes | all | which tags |
| osm.speedlimit-none | 39.4444 | speed for `none` |
| osm.annotate-defaults | false | mark typemap use |

Non-osm defaults relevant here — [NBFrame.cpp](https://github.com/eclipse-sumo/sumo/blob/main/src/netbuild/NBFrame.cpp): `geometry.remove` false (L173), `junctions.join` false (L354), `junctions.join-dist` 10 (L358), `junctions.join.parallel-threshold` 30 (L362), `junctions.join-same` -1 (L371), `roundabouts.guess` true (L324), `ramps.guess` false (L751), `tls.guess` false (L535), `tls.join` false (L552), `tls.join-dist` 20 (L556), `tls.guess-signals` false (L572), `tls.guess-signals.dist` 25 (L575), `tls.guess-signals.slack` 0 (L578), `keep-edges.components` 0 (L720), `remove-edges.isolated` false (L726), `no-turnarounds` false (L147). `tls.discard-simple` false — [NIFrame L387](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIFrame.cpp#L387).

Recommended import options per docs: `--geometry.remove --ramps.guess --junctions.join --tls.guess-signals --tls.discard-simple --tls.join --tls.default-type actuated` — [OpenStreetMap.md L52](https://github.com/eclipse-sumo/sumo/blob/main/docs/web/docs/Networks/Import/OpenStreetMap.md).

### Inferences
- A from or to member that is a two-way way passing through the via node matches two incoming (or outgoing) edges in `findEdgeRef`, so the restriction is ignored. This matches the OSM rule that from and to "must start/end at the via node", per [Relation:restriction](https://wiki.openstreetmap.org/wiki/Relation:restriction). So split ways at restriction via nodes.
- Because `findEdgeRef` uses a prefix test, an editor assigning way ids where one id is a string prefix of another (12 and 123) at the same via node can trigger a false "Ambiguous" drop. Use same-length positive ids.
- Negative ids risk a collision: way 5's reverse edge is `-5#0` and way -5's forward edge is also `-5#0`, which would raise "Could not add edge". Positive ids only. Not tested.
- Distinct nodes at identical coordinates merge regardless of `layer`, so an overpass drawn with coincident nodes would become a real junction in SUMO only. The editor should avoid exact coordinate coincidence for non-connected nodes.

### Gaps
- The docs still mention `--osm.discard-tls`, but no such string is found in NIFrame, NBFrame or the importer; the current option appears to be `--tls.discard-loaded` ([NIFrame L384](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIFrame.cpp#L384)).
- How restrictions behave when their from or to edge is absorbed inside a `--junctions.join` cluster was not traced through `joinNodeCluster`.
- The exact netconvert options used by the user's pipeline are unknown, so which defaults apply there must be read from its log or config.

## MATSim SupersonicOsmNetworkReader

### Takeaway
The reader takes only ways with a known `highway` value and uses just five tags: `highway`, `lanes` (with directional variants), `maxspeed`, `oneway`, `junction=roundabout`. It ignores relations and node tags, parses `maxspeed` only as a number or `N mph`, and its input parser is PBF-only, so a `.osm` XML file cannot be read directly.

### Cited Findings
- Input format: class doc says "uses the binary osm.pbf format as an input"; `OsmNetworkParser.parse` calls `PbfParser` only, which reads blobs through `PbfUtil.parseHeader` — [SupersonicOsmNetworkReader.java L27](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/SupersonicOsmNetworkReader.java#L27), [OsmNetworkParser.java L81-94](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/OsmNetworkParser.java#L81-L94), [PbfParser.java L61-66](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/PbfParser.java#L61-L66).
- Way selection: `isStreetOfInterest` requires a `highway` key whose value is in the link-properties map — [OsmNetworkParser.java L154-156](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/OsmNetworkParser.java#L154-L156). Ways with no such tag, including `service`, `track`, `path`, `footway`, `road`, are dropped by default; a builder can add types with `addOverridingLinkProperties` — [Reader L441-454](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/SupersonicOsmNetworkReader.java#L441-L454).
- Defaults — [LinkProperties.java L70-120](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/LinkProperties.java#L70-L120):

| highway | level | lanes per dir | km/h | veh/h per lane | oneway |
|---|---|---|---|---|---|
| motorway | 1 | 2 | 120 | 2000 | yes |
| motorway_link | 1 | 1 | 80 | 1500 | yes |
| trunk | 2 | 1 | 80 | 2000 | no |
| trunk_link | 2 | 1 | 50 | 1500 | no |
| primary | 3 | 1 | 80 | 1500 | no |
| primary_link | 3 | 1 | 60 | 1500 | no |
| secondary, secondary_link | 4 | 1 | 30 | 800 | no |
| tertiary, tertiary_link | 5 | 1 | 25 | 600 | no |
| unclassified | 6 | 1 | 15 | 600 | no |
| residential | 7 | 1 | 15 | 600 | no |
| living_street | 8 | 1 | 10 | 300 | no |

- Capacity doubles on links shorter than 50 m (`DEFAULT_ADJUST_CAPACITY_LENGTH`), then is multiplied by lane count — [LinkProperties.java L155-158](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/LinkProperties.java#L155-L158), [Reader L280](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/SupersonicOsmNetworkReader.java#L280).
- `maxspeed` — `parseSpeedTag`: `Double.parseDouble(tag)/3.6`, or `N mph`; on `NumberFormatException` it returns `properties.freespeed` — [Reader L335-346](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/SupersonicOsmNetworkReader.java#L335-L346). So `RU:urban`, `60 km/h`, `walk`, `none` all silently become the highway-type default. Only the `maxspeed` key is read; `maxspeed:forward`, `maxspeed:backward`, `zone:maxspeed`, `maxspeed:type` are not — same file L318-333.
- Speed factor: when `maxspeed` is present, freespeed = speed × 0.9 if speed < 51 km/h, else unchanged — [LinkProperties.java L165-168](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/LinkProperties.java#L165-L168). The factor is also applied when the value came from the parse fallback, because the branch depends on tag presence — [Reader L318-325](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/SupersonicOsmNetworkReader.java#L318-L325).
- No `maxspeed`: for levels trunk to tertiary and links ≤300 m, speed is interpolated from 2.78 m/s at 0 m up to the default at 300 m — [LinkProperties.java L185-191](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/LinkProperties.java#L185-L191).
- Lanes — `getNumberOfLanes` L348-368 — [source](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/SupersonicOsmNetworkReader.java#L348-L368): directional tags are read only inside `if (tags.containsKey(LANES))`; a positive `lanes:forward` (forward link) or `lanes:backward` (reverse link) is used; otherwise `lanes`, halved if not oneway; no `lanes` tag or unparseable gives `lanesPerDirection`.
- Oneway — `yes/true/1` oneway; `-1/reverse/no/false/0` not oneway in `isOneway`; `-1/reverse` removes the forward link in `isOnewayReverse`; only if no recognised value, `junction=roundabout` implies oneway; else type default — [Reader L293-316](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/SupersonicOsmNetworkReader.java#L293-L316). `junction=circular` is not considered.
- Segmentation: links break at nodes referenced by more than one included way, at way ends, and at nodes kept by `preserveNodeWithId` — [Reader L200-207](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/SupersonicOsmNetworkReader.java#L200-L207). A way referencing a missing node throws "A node with id ... was null" — [L144-152](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/SupersonicOsmNetworkReader.java#L144-L152).
- Turn restrictions and signals: `OsmNetworkParser` sets no relation handler, so the Supersonic reader ignores `type=restriction`. Only the separate `OsmSignalsParser` and `OsmSignalsReader` read 3-member restrictions (via node) and `highway=traffic_signals|crossing` — [OsmNetworkParser L81-94](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/OsmNetworkParser.java#L81-L94), [OsmSignalsParser.java L62-113](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/OsmSignalsParser.java#L62-L113).
- The `access` key, `width`, `turn:lanes`, `layer`, `bridge`, `tunnel`, `ele` do not appear in the reader's logic — [full source](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/SupersonicOsmNetworkReader.java).

### Inferences
- Worked values. `maxspeed=RU:urban` on residential: 15 km/h default × 0.9 = 13.5 km/h, while SUMO reads 60 km/h. On secondary: 27 km/h. On primary: 80 km/h. A numeric `maxspeed=60` gives 60 km/h; `maxspeed=50` gives freespeed 45 km/h (allowed-speed attribute stays 50).
- `lanes=1` on a two-way road yields 0.5 lanes per direction, halving capacity. `lanes=3` two-way without directional tags yields 1.5 each.
- `oneway=-1` with `lanes=2`: `isOneway` returns false, so the single reverse link gets `lanes/2 = 1`. Reverse the way geometry and use `oneway=yes` instead.
- Each extra way boundary creates a real MATSim node and link. Under 50 m the capacity doubles, and with no `maxspeed` on trunk to tertiary roads the freespeed drops towards 10 km/h. Splitting therefore directly distorts MATSim unless numeric `maxspeed` is present.
- Since the reader ignores relations, a pipeline run through it will allow restricted turns. Only the SUMO stage honours them.

### Gaps
- How the user's pipeline feeds `.osm` XML to a PBF-only reader could not be determined from the sources. There must be a conversion step (osmium, osmconvert or similar) or custom code, and it could alter negative ids or `action` attributes.
- Which `LinkProperties` overrides, `setPreserveNodeWithId` or `setAfterLinkCreated` hooks the pipeline sets is unknown.

## Webots osm_importer

### Takeaway
The importer reads `highway`, `lanes`, `lanes:forward`, `lanes:backward`, `width`, `layer`, `oneway`, `junction`, `maxspeed`, `turn:lanes:forward`, `turn:lanes:backward`, and node `highway=crossing`. It does not read `highway=traffic_signals`, `width:lanes` or plain `turn:lanes`. It is fragile: several unexpected tag values crash it, a `<bounds>` element is mandatory, and short roads can vanish.

### Cited Findings
- `<bounds>` required: without it the importer warns and exits; detection is line-based, looking for `bounds` in each line — [importer.py L94-114](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/importer.py#L94-L114).
- Filter: road types come from config sections. Configured: motorway, motorway_link, trunk, trunk_link, primary, secondary, tertiary, residential, unclassified, service; `[road] ignore: TRUE` excludes everything else, including `primary_link`, `secondary_link`, `tertiary_link`, `living_street` — [config.ini L87-146](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/config.ini#L87-L146), [settings.py `get_section`](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/settings.py). A custom file can be supplied with `--config-file` — [importer.py L52](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/importer.py#L52).
- Layer: any way with a layer value below 0 is skipped entirely — [parser_objects.py L104-106](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/parser_objects.py#L104-L106). Positive layer raises the whole road by `layer × layerHeight` (default 5 m) — [road.py L391](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py#L391), [importer.py L53](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/importer.py#L53). `float(self.tags['layer'])` is unguarded in `parse_tags` although the parser tolerates `;` lists since the August 2026 fix — [road.py L116-117](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py#L116-L117).
- Lanes — [road.py L81-157](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py#L81-L157): defaults lanes 2, forward 1, backward 1. `lanes` uses a bare `int()` and `assert > 0`, then forward = lanes − backward. With no `lanes` tag, `laneNumber` from config sets lanes but leaves forward and backward at 1. `lanes:forward` and `lanes:backward` are validated in try blocks; if both exist they override `lanes`.
- Oneway: only literal `oneway=yes`, or `junction=roundabout`, sets oneway. `oneway=-1`, `1`, `true` do not — [road.py L149-157](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py#L149-L157).
- Width: `width` accepts `N`, `N.N`, `N km`, `N mi`, feet and inches; other units including `m` yield None with a warning; default is `laneWidth × lanes`, with laneWidth 3.5 or 4 by type — [road.py L171-205](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py#L171-L205), [config.ini](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/config.ini).
- Turn lanes: only `turn:lanes:forward` and `turn:lanes:backward`, and each must have as many `|` values as lanes in that direction; plain `turn:lanes` is not read — [road.py L159-169](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py#L159-L169). Values are exported to `turnLanesForward`, which the Road PROTO describes as painted arrows — [Road.proto L48-49](https://github.com/cyberbotics/webots/blob/master/projects/objects/road/protos/Road.proto#L48-L49).
- maxspeed: country tags from a table (`RU:urban` 60, `RU:rural` 90, `RU:motorway` 110, `RU:living_street` 20), else regex `(\d*)\s*(.*)?` then `int(m.group(1))` — [speed_limit.py L40-61](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/speed_limit.py#L40-L61).
- Crossings: node `highway=crossing` on a road creates a `PedestrianCrossing` of width equal to road width — [road.py L335-338, L465-518](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py#L335-L338).
- Junctions: any node shared by two imported roads becomes a `Crossroad`, and roads are split there — [`Road.process` L524-575](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py#L524-L575). A 2-road crossroad of "similar" roads has no shape; bidirectional similarity needs `forwardLanes == other.backwardLanes` — [L212-232](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py#L212-L232), [L663-666](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py#L663-L666).
- Crossroad shape: each road's influence distance starts at 1 m, grows by 3 m up to 60 steps until no overlap, and the shape is the convex hull — [L672-735](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py#L672-L735). If the distance exceeds road length, `cut_line_string` returns the whole line — [shapely_utils.py](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/utils/shapely_utils.py). Roads are cut by subtracting the shape, and a road whose remaining path is empty or not a single LineString is skipped on export — [L782-784](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py#L782-L784), [L385-387](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py#L385-L387).
- Sharp angles over 1.3 rad with both segments over 5 m are smoothed by inserted points — [L268-303](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py#L268-L303).
- Parser does not check `action` on elements, and `OSMNode.nodeDictionnary[ref]` is unguarded — [parser_objects.py L76-125](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/parser_objects.py#L76-L125), [road.py L335-336](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py#L335-L336).
- No match for `traffic_signal`, `bridge`, `tunnel`, `width:lanes`, `give_way`, `restriction` or `connectivity` in the road-related importer files (`importer.py`, `parser_objects.py`, `osm_objects.py`, `settings.py`, `road.py`, `speed_limit.py`, `elevation.py`), by text search.

### Inferences
- Crash conditions by code reading, not run: `lanes=2;3`, `lanes=0`, a `layer` list on a highway, a `maxspeed` that is neither numeric nor in the table (`walk`, `none`, `RU:zone30`, `int('')` raises `ValueError` and no try surrounds `Road.process`), and a way referencing a missing node.
- Short roads between two crossroads can be entirely inside the shapes and disappear from the `.wbt`, while the crossroad still lists them in `connectedRoadIDs`. With 7 m-wide roads meeting at 90 degrees, each junction consumes about 4 to 7 m by the 1+3k stepping, so roads under about 10 to 15 m are at risk. Estimate only.
- `lanes=1` on a two-way road gives forward 0, backward 1 in Webots. `lanes=2` on residential without `width` gives an 8 m road because laneWidth is 4. Write `width` explicitly.
- A layer step has no ramp: the bridge road is at `layer × 5 m` while the crossroad at its end stays at ground level.

### Gaps
- `area.py`, `barrier.py`, `building.py`, `parking_lines.py`, `river.py`, `tree.py` were not read, as they are not road related.
- Actual Webots behaviour on a generated file was not tested. The `R2025a`-pinned texture URLs suggest the release cycle, but the installed Webots version in the pipeline is unknown.

## SUMO teleports, disconnected networks, short ways, junction joining, way splitting

### Takeaway
Teleports come from gridlock, wrong-lane and disconnected-route conditions. From OSM the main sources are unjoined clusters of nodes with short edges between them, inconsistent lane counts and missing connectivity. Splitting a way only harms when the split survives as a junction: `--geometry.remove` merges compatible parts, but only if lane count, priority and speed match on both sides.

### Cited Findings
- Teleport trigger: first vehicle waiting below 0.1 m/s longer than `--time-to-teleport` (default 300 s). Reasons reported: `wrong lane`, `highway`, `yield`, `jam`, `blocked`, `disconnected`, `bidi`, `railSignal` — [Why_Vehicles_are_teleporting.md](https://github.com/eclipse-sumo/sumo/blob/main/docs/web/docs/Simulation/Why_Vehicles_are_teleporting.md). `disconnected` means current and next edge are not connected for the vehicle's vClass — same.
- Docs: "When leaving junctions unjoined, there is a high risk of getting low throughput, jams and even deadlocks due to the short intermediate edges and the difficulty in computing proper traffic light plans for the junction clusters." — [OpenStreetMap.md L303-306](https://github.com/eclipse-sumo/sumo/blob/main/docs/web/docs/Networks/Import/OpenStreetMap.md).
- FAQ causes of deadlocks: wrong lane counts, missing turn lanes, bad connections, "big clusters of small junctions should be joined", invalid traffic lights, demand and routing problems, `departLane="best"` for insertion near turn lanes — [FAQ](https://sumo.dlr.de/docs/FAQ.html).
- `--junctions.join` clustering walks along edges, not by proximity alone: an edge is followed if `length + dist < maxDist` (default 10 m), pedestrian-only edges are never followed, and non-passenger, non-tram edges only when extremely short — [generateNodeClusters L552-672](https://github.com/eclipse-sumo/sumo/blob/main/src/netbuild/NBNodeCont.cpp#L552-L672). Only `--junctions.join-same` joins unconnected nodes by coordinates — [NBFrame L371](https://github.com/eclipse-sumo/sumo/blob/main/src/netbuild/NBFrame.cpp#L371).
- Clusters are rejected or reduced in `feasibleCluster`: more than 5 incoming edges, parallel incoming or outgoing edges (threshold 30 degrees), a PT stop edge inside, "not compact", only 1 entry or exit node without TLS, or 2 nodes with one edge inside and no cross-traffic — [L1465-1697](https://github.com/eclipse-sumo/sumo/blob/main/src/netbuild/NBNodeCont.cpp#L1465-L1697). Rejections are logged as `Reducing junction cluster` warnings — [L856-879](https://github.com/eclipse-sumo/sumo/blob/main/src/netbuild/NBNodeCont.cpp#L856-L879). Manual exclusion: `--junctions.join-exclude` — [docs L300-301](https://github.com/eclipse-sumo/sumo/blob/main/docs/web/docs/Networks/Import/OpenStreetMap.md).
- Joined node gets id `cluster_id0_id1`, connections guessed unless loaded — [PlainXML.md](https://github.com/eclipse-sumo/sumo/blob/main/docs/web/docs/Networks/PlainXML.md).
- Splitting: with `--geometry.remove`, a one-in-one-out node is removed only if not TLS or crossing and `expandableBy` passes: same lane count, not a loop, connected, same priority, same speed — [NBNode::checkIsRemovableReporting L2679-2709](https://github.com/eclipse-sumo/sumo/blob/main/src/netbuild/NBNode.cpp#L2679-L2709), [NBEdge::expandableBy L3979-4053](https://github.com/eclipse-sumo/sumo/blob/main/src/netbuild/NBEdge.cpp#L3979-L4053).
- TLS: `--tls.guess-signals` treats signal nodes with one incoming edge or geometry-like as upstream signal positions and controls the central junction if all passenger arms have a signal within `dist` (25 m default) — [guessTLs L2218-2300](https://github.com/eclipse-sumo/sumo/blob/main/src/netbuild/NBNodeCont.cpp#L2218-L2300). `--tls.discard-simple` removes TLS at geometry-like nodes unless the node has crossings or the TLS is joined — [discardTrafficLights L2759-2790](https://github.com/eclipse-sumo/sumo/blob/main/src/netbuild/NBNodeCont.cpp#L2759-L2790).
- Isolated edges: `--remove-edges.isolated` — [docs L396-407](https://github.com/eclipse-sumo/sumo/blob/main/docs/web/docs/Networks/Import/OpenStreetMap.md). Unexpected routes "are often caused by invalid lane-to-lane connections or vClass-restrictions", netcheck can visualise reachability — [FAQ](https://sumo.dlr.de/docs/FAQ.html).

### Inferences
Edits that should reduce teleports and disconnection (derived from the above, not measured):
- Every at-grade connection must share one node id; near-misses are not bridged by `--junctions.join`, which follows existing edges.
- Do not route car traffic through `highway=service`, since the default typemap denies passenger cars there. Use `unclassified` or `residential` for through connections, or supply a typemap. MATSim also drops `service`.
- Keep lane counts consistent along a street and tag the pocket lanes with a split at the pocket start, so wrong-lane conditions are avoided.
- With `--osm.turn-lanes`, the way must end at the junction, its `turn:lanes` must have one entry per lane, and every signed direction must exist there, otherwise the data is discarded.
- Avoid `change:lanes=no` right up to a junction, because vehicles still needing a lane change would stay on the wrong lane.
- For short connector ways inside a junction, keep them under the join distance so clusters form, or merge them in the editor. Connector ways just over 10 m stay as separate junctions with the short edge problem.
- Put `highway=traffic_signals` on the intersection node, or else on every approach within 25 m and use `--tls.guess-signals`. A partial set leaves an uncontrolled junction next to signal-only junctions.
- Do not split ways needlessly. Split only at real junctions, at restriction via nodes, where lane count or speed truly changes, and at the turn-lane start. Each gratuitous split is harmless in SUMO only with `--geometry.remove`; in MATSim it always creates a link, and in Webots it creates a Crossroad, which is shapeless only if the roads are "similar".

### Gaps
- No quantitative study of the teleport effect of specific OSM edits was found; recommendations are source-derived.
- A minimum safe edge length is not stated in the SUMO docs for vehicles; the FAQ only addresses insertion edges and braking distance.

## How to write one .osm file for the MATSim, SUMO, Webots pipeline

### Takeaway
Write for the intersection of the three readers: numeric km/h `maxspeed`, explicit integer `lanes`, `oneway=yes` drawn in travel direction, bare-number `width`, a `<bounds>` element, positive unique ids and complete node references. Treat tags that only SUMO reads as additive.

### Cited Findings
Per-feature behaviour, all from the source sections above:

| Feature | MATSim Supersonic | SUMO netconvert | Webots |
|---|---|---|---|
| `maxspeed=60` | 60 km/h | 60 km/h | 60 km/h |
| `maxspeed=RU:urban` | type default (×0.9 if <51) | 60 km/h | 60 km/h |
| `maxspeed=walk` or `none` | type default | 5 km/h or 142 km/h | crash (code reading) |
| `lanes=2`, two-way | 1 each way | 1 each way | 1 each way |
| `lanes=1`, two-way | 0.5 each way | 1 each, half width, narrow | forward 0, backward 1 |
| `lanes=3`, `lanes:forward=2`, `lanes:backward=1` | 2 and 1 | 2 and 1 | 2 and 1 |
| `lanes:forward` without `lanes` | ignored | used | used, with default lanes |
| `oneway=yes` | ok | ok | ok |
| `oneway=-1` | reverse link, half lanes | ok | treated as two-way |
| `junction=roundabout` | oneway | oneway, priority | oneway |
| `junction=circular` | not oneway | oneway | not oneway |
| `width=7` | ignored | 7 m total | 7 m total |
| `width=7 m` | ignored | 7 m total | rejected, default width |
| `turn:lanes` | ignored | with `--osm.turn-lanes` | ignored |
| `turn:lanes:forward` | ignored | with `--osm.turn-lanes` | painted arrows |
| `type=restriction`, via node | ignored | applied | ignored |
| `type=restriction`, via way | ignored | warning, ignored | ignored |
| `type=connectivity` | ignored | ignored | ignored |
| `highway=traffic_signals` node | ignored | TLS at node | ignored |
| `highway=crossing` node | ignored | with `--osm.crossings` and sidewalks | PedestrianCrossing |
| `layer=1` | ignored | only with `--osm.layer-elevation` | raised 5 m |
| `layer=-1` | ignored | same | road dropped |
| `highway=service` | dropped | no passenger cars | imported |
| `highway=primary_link` | imported | imported | dropped by default config |
| `highway=living_street` | imported | imported, 10 km/h default | dropped by default config |
| `<bounds>` | n/a | not needed | mandatory |
| Missing node reference | exception | warning | crash |

Sources: [NIImporter_OpenStreetMap.cpp](https://github.com/eclipse-sumo/sumo/blob/main/src/netimport/NIImporter_OpenStreetMap.cpp), [SupersonicOsmNetworkReader.java](https://github.com/matsim-org/matsim-libs/blob/main/contribs/osm/src/main/java/org/matsim/contrib/osm/networkReader/SupersonicOsmNetworkReader.java), [road.py](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/road.py), [speed_limit.py](https://github.com/cyberbotics/webots/blob/master/resources/osm_importer/webots_objects/speed_limit.py).

OSM conventions: `turn:lanes` lists lanes left to right, `|` between lanes and `;` within a lane, and the count must equal lanes in that direction — [Key:turn](https://wiki.openstreetmap.org/wiki/Key:turn). Restriction from and to must start or end at via — [Relation:restriction](https://wiki.openstreetmap.org/wiki/Relation:restriction).

### Inferences
Suggested writing rules:
1. File: `<bounds>` on its own line, no `action` attributes, positive ids of equal digit length, every `nd` and member reference present.
2. Speeds: `maxspeed=<integer km/h>` only, and put `RU:urban` in `source:maxspeed`, which none of the three reads. Do not write `maxspeed:type`, `maxspeed:backward` on oneways, or `maxspeed:forward` alone.
3. Lanes: always integer `lanes`. On two-way roads with an odd count add both `lanes:forward` and `lanes:backward`, consistent with `lanes`. Never `lanes=1` on an ordinary two-way road.
4. Direction: draw oneway ways in travel direction with `oneway=yes`; add `oneway=yes` explicitly on `junction=roundabout` and `circular`, and on motorways.
5. Width: `width=<bare metres>` for the total carriageway. Use `width:lanes` only for SUMO and only when no sidewalk or bike lane is added.
6. Turn arrows: on oneways write both `turn:lanes` for SUMO and `turn:lanes:forward` for Webots if arrows are wanted there. On two-way ways use `turn:lanes:forward` and `turn:lanes:backward`. Way must end at the junction.
7. Junctions: one shared node per at-grade connection, no coincident coordinates for non-connected nodes. Keep roads between junctions over about 15 m for Webots, or merge them.
8. Bridges: positive `layer` only if a 5 m step in Webots is acceptable; avoid negative `layer` unless the road should vanish from Webots. Add `--osm.layer-elevation` for SUMO if z matters.
9. Road classes: avoid `service` for car through-routes; use a custom Webots `--config-file` if `*_link` or `living_street` must appear there.
10. netconvert: use the documented recommended options plus `--osm.turn-lanes`, with `--osm.sidewalks --osm.crossings` if pedestrians matter and `--ptstop-output --ptline-output` for PT.

### Gaps
- None of these rules has been tested end-to-end through the actual pipeline; a small fixture run through all three tools would confirm them.
- The pipeline's conversion step for MATSim and its exact options for netconvert and Webots remain unknown.
