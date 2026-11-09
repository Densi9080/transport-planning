# Open-source editors for OSM road graphs and lane-level road data (as of 2026-11-09)

Method note: license, last push, last commit on the default branch, latest release and stars were read from the GitHub REST API on 2026-11-09. Where the API said `NOASSERTION` or `none`, the LICENSE file or source headers were read directly. "Last commit" is the default-branch head; "pushed" can be later because of branches and PRs. Not legal advice.

## Q1. License, stack, activity and reuse value per project

### Takeaway
The directly copyable core is small and good: iD/Rapid (ISC) for the OSM graph model and turn-restriction logic, osm2streets (Apache-2.0) for OSM-to-lanes interpretation and a working MapLibre lane renderer, Maid (ISC, new) as a MapLibre port of iD's model, and MapLibre itself. JOSM and its plugins, Osmose, Keep Right, Blender DSC, CommonRoad and ORBIT are GPL; Streetmix and 3DStreet are AGPL. Those are inspiration only unless the team adopts a matching copyleft license.

### Cited Findings

**OSM editors**

| Project | License (how verified) | Stack | Activity | Reuse value |
|---|---|---|---|---|
| [iD](https://github.com/openstreetmap/iD) | ISC (API) | JS migrating to TS, d3/SVG | v2.42.3, 2026-10-20; commit 2026-11-03; 3923 stars | Copyable: [`modules/osm/intersection.ts`](https://github.com/openstreetmap/iD/blob/develop/modules/osm/intersection.ts) exports `osmIntersection`, `osmInferRestriction`, `osmTurn`; [`modules/ui/fields/restrictions.js`](https://github.com/openstreetmap/iD/blob/develop/modules/ui/fields/restrictions.js) (25 KB); `modules/core/graph.ts`, `history.ts`, `modules/osm/way.ts`, `node.ts`, `relation.ts` |
| [Rapid](https://github.com/meta/Rapid) (facebook/Rapid now redirects to meta/Rapid; rapideditor/Rapid returned 404) | ISC (API) | JS, pixi.js 8.6.6, maplibre-gl ^3.6.2, d3 ([package.json](https://github.com/meta/Rapid/blob/main/package.json)) | rapid-2.5.6, 2026-02-03; commit 2026-04-15; quieter than iD | Same model as iD in plain JS; has a schematic [`lanes.js`](https://github.com/meta/Rapid/blob/main/modules/ui/fields/lanes.js) field that iD no longer has in `modules/ui/fields` |
| [JOSM](https://github.com/JOSM/josm) | GPL-2.0-or-later ([LICENSE](https://github.com/JOSM/josm/blob/master/LICENSE): "all its integral parts") | Java/Swing | 19678-tested, 2026-11-05; commit 2026-11-07 | Inspiration only |
| [JOSM turnlanes](https://github.com/JOSM/josm-plugins/tree/master/turnlanes) | GPL v2 or later (LICENSE + README; original author Benjamin Schulz) | Java/Swing; model classes `Junction`, `Lane`, `Road`, `Route`, `Turn`, `Validator` | Folder commit 2026-09-18 | Inspiration only; its junction UI is the best desktop pattern (Q2) |
| [JOSM turnlanes-tagging](https://github.com/JOSM/turnlanes-tagging) | GPL per source header ("License: GPL. For details, see LICENSE file"), but no LICENSE file in the repo; API says none | Java | v309, 2026-03-28; commit 2026-10-27 | Inspiration only; "alternative way to add turn:lanes tags" per README |
| [JOSM junctionchecking](https://github.com/JOSM/josm-plugins/tree/master/junctionchecking) | GPL per source header; no LICENSE in folder; author Jörg Possin (build.xml) | Java; channel digraph | Folder commit 2026-01-31 | Inspiration only; builds a channel digraph and tests subsets for being junctions (README) |
| [JOSM conflation](https://github.com/JOSM/conflation) | GPL v2/v3 text files in repo; API says none | Java | v280, 2026-08-12; commit 2026-11-02 | Inspiration only |
| [JOSM turnrestrictions](https://github.com/JOSM/josm-plugins/tree/master/turnrestrictions) | LICENSE file present in folder; text not read | Java | Not checked | Inspiration only (assumed GPL as JOSM plugin; see Gaps) |
| [BjornRasmussen/Lanes](https://github.com/BjornRasmussen/Lanes) ("Visual OpenStreetMap Lane Editor Plugin for JOSM") | GPL V2 (README and GPL text files) | Java; `LaneMappingMode`, `RoadSegmentRenderer`, `RoadPiece`, `Lane`, `Divider`, `RoadEdge` | Last push 2022-04-27 | Inspiration only; the class breakdown is a useful design outline |
| [LaneConnector plugin](https://wiki.openstreetmap.org/wiki/JOSM/Plugins/LaneConnector) | Not stated on wiki; jar from TrifanAdrian/LanecConnectorPlugin | Java (JOSM) | Wiki edited 2025-04-08; "beta" | Treat as not reusable; idea only |
| [Vespucci](https://github.com/MarcusWolschon/osmeditor4android) | Apache-2.0 per [README](https://github.com/MarcusWolschon/osmeditor4android/blob/master/README.md) "License and trademarks" (API NOASSERTION; root LICENSE.txt only points to `src/main/assets`) | Java/Android | 22.1.3.0, 2026-10-18; commit 2026-11-09 | Android code, little direct value; OSM XML handling could be read |
| [Level0](https://github.com/Zverik/Level0) | WTFPL (API) | PHP (README, composer); GitHub's "Motoko" label is a misdetection | Commit 2026-09-18 | Text-format OSM editing idea; permissive |
| [Potlatch 2](https://github.com/openstreetmap/potlatch2) | WTFPL ([LICENCE.txt](https://github.com/openstreetmap/potlatch2/blob/master/LICENCE.txt)) | ActionScript/Flash | Commit 2019-06-21; [systemed fork](https://github.com/systemed/potlatch2) archived | Dead platform; no practical reuse |

**QA and task tools**

| Project | License | Stack | Activity | Reuse value |
|---|---|---|---|---|
| [MapRoulette frontend](https://github.com/maproulette/maproulette-frontend) (renamed from maproulette3) | MIT (API) | React 17, Leaflet | v3.18.8, 2026-11-01 | Task-queue UX |
| [MapRoulette backend](https://github.com/maproulette/maproulette-backend) | Apache-2.0 (API) | Scala | v4.13.0, 2026-11-01 | Low |
| [Osmose backend](https://github.com/osmose-qa/osmose-backend) (moved from osm-fr) | GPL-3.0 (API) | Python | Commit 2026-10-26 | Inspiration: `plugins/Highway_Lanes.py` shows which lane-tag inconsistencies are worth checking; rewrite rules, do not copy |
| [Osmose frontend](https://github.com/osmose-qa/osmose-frontend) | GPL-3.0 (API) | Python | Commit 2026-10-29 | Inspiration only |
| [Keep Right](https://github.com/keepright/keepright) | GPLv2 (README line: "Sources are licensed under GPLv2"; no LICENSE file) | PHP | Commit 2017-03-26 | Inspiration only; stale |

**Street and lane tools**

| Project | License | Stack | Activity | Reuse value |
|---|---|---|---|---|
| [osm2streets + web demo](https://github.com/a-b-street/osm2streets) ([live](https://a-b-street.github.io/osm2streets/)) | Apache-2.0 (root and `web/LICENSE`) | Rust to WASM (`osm2streets-js`, `osm2lanes-js`, py, java bindings); web is Svelte 4 + maplibre-gl ^4.1 + svelte-maplibre | Commit 2025-10-02; no activity in 2026 | **Highest value.** Includes a browser [lane editor](https://github.com/a-b-street/osm2streets/tree/main/web/src/lane-editor) and render layers (`RenderLanePolygons`, `RenderLaneMarkings`, `RenderIntersectionPolygons`) |
| [A/B Street](https://github.com/a-b-street/abstreet) | Apache-2.0 (API) | Rust, own `widgetry` UI, runs on web via [play.abstreet.org](https://a-b-street.github.io/docs/print.html) | Commit 2025-09-10 | Copyable but in Rust/own UI, so practically a design reference: [`apps/game/src/edit/roads.rs`](https://github.com/a-b-street/abstreet/blob/main/apps/game/src/edit/roads.rs), [`edit/traffic_signals/`](https://github.com/a-b-street/abstreet/tree/main/apps/game/src/edit/traffic_signals) (includes `gmns.rs`, `offsets.rs`, `picker.rs`, `preview.rs`) |
| [Streetmix](https://github.com/streetmix/streetmix) | **AGPL-3.0-or-later** for current code; original codebase was BSD-3 ([LICENSE](https://github.com/streetmix/streetmix/blob/main/LICENSE)) | TypeScript | coastmix-v1.0.1, 2026-10-23; commit 2026-11-03 | Inspiration only |
| [3DStreet](https://github.com/3DStreet/3dstreet) | AGPL-3.0 with A-Frame Inspector origin ([LICENSE](https://github.com/3DStreet/3dstreet/blob/main/LICENSE)) | JS/A-Frame | 2026.9.0, 2026-09-24; commit 2026-11-09 | Inspiration only |
| [OsmLaneVisualizer](https://github.com/mueschel/OsmLaneVisualizer) | No license file | Perl | Last push 2023-04-01 | Look only |
| [merge](https://github.com/lachlan2357/merge) ("lane visualisation tool", inspired by OsmLaneVisualizer) | GPL-3.0 (API) | TypeScript | Push 2026-04-02 | Inspiration only |
| [zlant/parking-lanes](https://github.com/zlant/parking-lanes) | MIT (API) | TypeScript | Push 2024-11-27 | Copyable pattern for per-side lane attributes |
| [StreetComplete](https://github.com/streetcomplete/StreetComplete) | GPL-3.0 (API) | Kotlin | v64.1, 2026-11-01 | Inspiration only |
| [TM:PE](https://github.com/CitiesSkylinesMods/TMPE) (Cities: Skylines mod) | MIT (API) | C# | 11.9.4.1, 2026-03-10 | Lane-connector UX reference from games; permissive |

**Simulation, OpenDRIVE and HD-map tools**

| Project | License | Stack | Activity | Reuse value |
|---|---|---|---|---|
| [SUMO / netedit](https://github.com/eclipse-sumo/sumo) ([src/netedit](https://github.com/eclipse-sumo/sumo/tree/main/src/netedit)) | EPL-2.0 with GPL-2.0-or-later as secondary option for `src` and `tools`; `src/foreign` and `tools/contributed` carry own licenses ([SUMO docs](https://sumo.dlr.de/docs/Libraries_Licenses.html)) | C++/FOX (FOX is required for sumo-gui and netedit) | Tag v1_28_0 is newest listed; commit 2026-11-09 | Run `netconvert` as a separate process; copy UX ideas from netedit |
| [esmini](https://github.com/esmini/esmini) | MPL-2.0 (API) | C++; apps `odrplot`, `odrviewer`, `replayer` | v3.11.0, 2026-11-05 | Validation/preview tool |
| [libOpenDRIVE](https://github.com/pageldev/libOpenDRIVE) | Apache-2.0 (API) | C++ (WASM builds reported) | Release 0.5.0, 2023-09-13; commit 2025-12-31 | Copyable |
| [odrviewer web](https://github.com/pageldev/odrviewer) | No license detected | HTML/JS | Push 2025-01-19 | Look only; use libOpenDRIVE instead |
| [xodr_edit](https://github.com/p-schulz/xodr_edit.github.io) | Apache-2.0 (API) | Dependency-free JS, Canvas | Push 2026-08-04; created 2026-07-06 | Copyable OpenDRIVE parse, lane-width sampling, `.xodr` export |
| [opendrivejs](https://github.com/Saquib764/opendrivejs) | No license detected | React, three.js, TS | Push 2020-12-10 | Look only |
| [Blender Driving Scenario Creator](https://github.com/johschmitz/blender-driving-scenario-creator) | GPL-3.0 (API) | Python/Blender | v0.38.0, 2026-10-14 | Inspiration only |
| [LaneMaker](https://github.com/guotata1996/lanemaker) | Apache-2.0 (LICENSE) | C++/Qt5 | Push 2026-01-08 | Copyable; its [README](https://github.com/guotata1996/lanemaker) says OpenDRIVE is used for geometry bookkeeping |
| [CommonRoad Scenario Designer](https://github.com/CommonRoad/commonroad-scenario-designer) | GPL-3.0 (API) | Python | Push 2026-08-27 | Inspiration only |
| [ORBIT](https://github.com/RI-SE/ORBIT) | GPL-3.0 (API) | Python | Push 2026-11-02 | Inspiration only |
| [COVISE / ODDLOT](https://github.com/hlrs-vis/covise) ([ODDLOT](https://www.hlrs.de/solutions/types-of-computing/visualization/oddlot)) | LGPL v2.1 unless stated otherwise (README) | C++ | Push 2026-11-09 | Desktop reference |
| [CARLA](https://github.com/carla-simulator/carla) | MIT (API) | C++/Unreal | Push 2026-11-09 | Consumer of OpenDRIVE; carla-simulator/OSM2ODR returned 404 |
| [Truevision Designer](https://github.com/truevisionai/designer) | **Not open source:** LICENSE.md says use is governed by an [EULA](https://www.truevision.ai/eula), although the repo is public | TypeScript | Push 2026-02-02 | Do not copy |
| [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2) | BSD-3-Clause (API) | C++ | 1.2.3, 2026-06-18; push 2026-10-10 | Copyable. There is no JOSM "Lanelet2 plugin" that I could find; it ships [JOSM presets and styles](https://github.com/fzi-forschungszentrum-informatik/Lanelet2/tree/master/lanelet2_maps/josm) (`laneletpresets.xml`, `lanelets.mapcss`, `lines.mapcss`), and [its docs](https://docs.ros.org/en/jazzy/p/lanelet2_maps/) recommend JOSM for editing |
| [Vector Map Builder](https://tools.tier4.jp) (TIER IV) | No license or source found; [Autoware docs](https://docs.autoware.org/1.8.0/tutorials/integrating-autoware/creating-maps/creating-vector-map/) call it a free web-based tool and it needs a TIER IV account | Web | Not determinable | Treat as closed; inspiration only |
| [autoware_tools](https://github.com/autowarefoundation/autoware_tools) | Apache-2.0 (API) | C++/ROS | 0.8.0, 2026-10-20 | Copyable, ROS-bound |
| [autoware_lanelet2_extension](https://github.com/autowarefoundation/autoware_lanelet2_extension) | Apache-2.0 (API) | C++ | Commit 2026-11-04 | Copyable, ROS-bound |
| [autoware_lanelet2_map_validator](https://github.com/tier4/autoware_lanelet2_map_validator) | Apache-2.0 (API) | C++ | 1.8.2, 2026-10-29 | Validator rule ideas |
| [MapToolbox](https://github.com/autocore-ai/MapToolbox) | LGPL-3.0 (API) | C#/Unity | Commit 2022-08-26 | Stale |
| [OSMnx](https://github.com/gboeing/osmnx) | MIT (API) | Python | Tag v2.1.1 is first in the tags API; commit 2026-11-07; 5893 stars | Copyable: Django-side graph download, simplification and analysis. Not an editor |
| [matsim-org/pt2matsim](https://github.com/matsim-org/pt2matsim) | GPL-2.0 (API) | Java | Push 2026-11-06 | External process only |

**Building blocks for the Vue + MapLibre client**

- [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js): BSD-style text in [LICENSE.txt](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt) (API NOASSERTION).
- [Terra Draw](https://github.com/JamesLMilner/terra-draw): MIT, 1.39.0, 2026-10-28. [mapbox-gl-draw](https://github.com/mapbox/mapbox-gl-draw): ISC, v1.5.2, 2026-09-14.
- [osmtogeojson](https://github.com/tyrasd/osmtogeojson): MIT, last commit 2022-10-18.

### Inferences
- Best legal base: take the iD/Rapid data model (ISC), or Maid's TypeScript port of it, and run osm2streets WASM for lane geometry. Both are permissive and browser-native.
- osm2streets has had no commit since 2025-10-02, so pin a version and expect no upstream support during the hackathon.
- A/B Street code is Apache-2.0 but tied to its own Rust UI toolkit, so its practical value is design reference, not code.

### Gaps
- JOSM Validator was not checked as a separate component. JOSM's LICENSE covers "all its integral parts", but I did not confirm where the validator lives.
- `turnrestrictions` LICENSE text and the license of JOSM/josm-plugins as a whole (API: none) were not read per plugin beyond those listed.
- Vespucci's bundled assets may carry separate terms; only the README statement was read.
- The JOSM plugin list page was too large to retrieve the relevant rows, so plugin discovery relied on the GitHub mirror and wiki pages. A plugin literally named "Lanes" exists only as the third-party BjornRasmussen repo in what I found.
- Streetplan was not investigated; I did not establish its license. Trian3D, TruckMaker and RoadRunner were treated as closed per the brief and not checked.
- MIT/ISC status from the API was not cross-read against each LICENSE file, except Maid and those noted.

## Q2. Which tools already have lane-by-lane views, lane connection editing or intersection editing UX in a browser, and which patterns are worth copying

### Takeaway
Nobody open-source combines all three for OSM in a browser. Browser lane views exist (osm2streets, A/B Street, Rapid's schematic), browser turn-restriction editing exists (iD, Rapid), and browser lane-to-lane connection editing was found only in a very new MIT OpenDRIVE project. The most complete connection UX is still desktop: SUMO netedit and JOSM turnlanes.

### Cited Findings

**Browser**

- **iD and Rapid, turn restrictions (ISC, copyable).** From [`restrictions.js`](https://github.com/openstreetmap/iD/blob/develop/modules/ui/fields/restrictions.js):
  - The field appears only when the selected vertex is a real intersection with more than two ways, and shows an auto-zoomed mini-map of the junction in the sidebar.
  - Click a way to set FROM; turns leaving it are highlighted. Clicking an empty area clears FROM.
  - Clicking a turn arrow cycles Allowed → No → Only → Allowed. Moving to "Only" temporarily removes other direct restrictions from the same FROM toward the same VIA and restores them later. Indirect turns cannot be toggled.
  - Hover updates help text with the restriction type and FROM/VIA/TO names.
  - Distance slider 20–50 m (default 30) and via slider 0–2 rebuild the intersection and persist in preferences. Each change is one undoable, annotated edit.
- **Rapid, lane schematic.** [`lanes.js`](https://github.com/meta/Rapid/blob/main/modules/ui/fields/lanes.js) draws an SVG with `LANE_WIDTH` 40 and `LANE_HEIGHT` 200 from `way.lanes()` data. A grep found no click or drag handlers, so it reads as display only. It is registered as field type `lanes` in [`fields/index.js`](https://github.com/meta/Rapid/blob/main/modules/ui/fields/index.js).
- **osm2streets lane editor (Apache-2.0, copyable).** From [`web/src/lane-editor`](https://github.com/a-b-street/osm2streets/tree/main/web/src/lane-editor):
  - Click a lane polygon on MapLibre to select the OSM way; if a road maps to more than one way, it alerts that the road cannot be edited.
  - The side panel shows a key/value tag table with add and delete, then recalculates and re-renders the lane polygons from edited tags.
  - Edited ways accumulate in a list and export as `lane_edits.osc` through `wayToXml`.
  - Wasm methods observed: `getOsmTagsForWay`, `getGeometryForWay`, `wayToXml`.
  - The [web README](https://github.com/a-b-street/osm2streets/blob/main/web/README.md) describes it as "modify OSM way tags and visualize the results".
  - Limit: the [main README](https://github.com/a-b-street/osm2streets/blob/main/README.md) lists turning movements and crosswalks as planned, so intersections are polygons without modeled movements.
- **A/B Street road editor (Apache-2.0).** From [`roads.rs`](https://github.com/a-b-street/abstreet/blob/main/apps/game/src/edit/roads.rs):
  - Each lane is a card in a drag-and-drop strip ordered left to right, with a drop-position indicator on the map during dragging.
  - Selected and hovered lanes are highlighted on the map, and hovering works in both directions (card and map).
  - The panel for a selected lane has "delete lane", "flip direction", "change to <type>", width preset dropdown and custom width spinner. Changing lane type resets to a typical width.
  - Undo and redo are bound to Ctrl+Z and Ctrl+Y.
  - [Docs](https://a-b-street.github.io/docs/print.html): lane edits take effect in real time, usually under a second, and a web version exists.
- **A/B Street signals.** Each stage holds protected and yield movement sets ([`traffic_signals/mod.rs`](https://github.com/a-b-street/abstreet/blob/main/apps/game/src/edit/traffic_signals/mod.rs)). The [JSON format](https://a-b-street.github.io/docs/tech/dev/formats/traffic_signals.html) requires every possible turn to appear in at least one stage on import, and that validation rule is worth copying.
- **studentdsx/opendrive-editor (MIT, browser, TS).** Per its [README](https://github.com/studentdsx/opendrive-editor), junction connections are made by clicking entry lane then exit lane one by one, adjacent lanes auto-merge into multi-lane connecting roads, and clicking arm ends generates connections in bulk by traffic rules for later adjustment. Connecting roads use Hermite curves. Created 2026-08-19, 0 stars, so expect immaturity.
- **Apollo Map Studio (browser, HD maps).** Per its [README](https://github.com/SakuraPuare/apollo-map-studio) it edits lanes, roads, junctions, crosswalks and signals, derives overlap and lane topology, and separates worker-backed cold layers from live-edit hot layers. **LICENSE is CC BY-NC 4.0**, so inspiration only.
- **Lanelet-Editor (Apache-2.0, browser).** [README](https://github.com/guyunge-guma/Lanelet-Editor): draw LineStrings on a Potree point cloud, assemble a Lanelet by choosing left and right boundaries plus direction, export `.osm` for Autoware.
- **Maid (ISC).** Has a [`module-turn-restrictions` package](https://github.com/osm-editor-kit/maid/tree/main/packages) and a `maid-bicycle` app; contents not inspected.

**Desktop, best patterns**

- **SUMO netedit connection mode** ([docs](https://sumo.dlr.de/docs/Netedit/editModesNetwork.html)):
  - Click a source lane; outgoing lanes at the junction are colored by category.
  - Click a Target to remove a connection, click a Possible Target to add one; Shift-click sets `pass="true"`.
  - Conflict lanes need Ctrl-click, and the status bar gives the reason.
  - ESC cancels, ENTER confirms.
- **netedit traffic light mode** (same page): click a junction to add or remove control, right-click a connection to set its signal state, right-click an incoming lane to set all its connections, "apply to all phases" checkbox, directly editable phase table.
- **netedit crossing mode** (same page): select junction, select edges to cross, "Create Crossing", then F5 to recompute junctions.
- **JOSM turnlanes** ([proposal page](https://wiki.openstreetmap.org/wiki/Proposed_features/turn_lanes)):
  - Split ways at the junction, select junction node and via ways to open the graphical editor.
  - "+" adds lanes; selecting a lane adjusts its length.
  - Drag from an incoming lane connector to an outgoing connector to allow a turn.
  - Ctrl+A shows all connections; Space recenters; Ctrl+L and Ctrl+R rotate; F5 refreshes.
  - It writes `type=turnlanes:lengths` and `type=turnlanes:turns` relations, but the proposal is **Obsoleted** and recommends `turn(:lanes)` tags.
- **JOSM LaneConnector** ([wiki](https://wiki.openstreetmap.org/wiki/JOSM/Plugins/LaneConnector)): Junction View and Junction View Restrictions tabs where connections are drawn between lane connectors; output goes to a per-node file, not clearly OSM tags.

### Inferences
Recommended composite for the hackathon, adapted not copied where GPL:
1. Way selected: A/B Street-style lane card strip, with two-way hover highlight between card and map.
2. Junction selected: iD-style mini junction view, using netedit's source-lane click and colored target states, plus JOSM's drag from connector to connector as an alternative gesture.
3. Default connections generated by rule (studentdsx pattern), with the user only correcting exceptions.
4. Ctrl-click to force a conflicting connection, with the reason shown in a status line (netedit).
5. Signals as a phase table plus a validation that every movement is served in at least one stage (A/B Street).
6. Store turn information as standard `turn:lanes` tags plus restriction relations, since the relation scheme is obsoleted. Connection detail beyond what `turn:lanes` can express needs `type=connectivity` or a sidecar; the proposal page mentions the limits of the older scheme, but this was not separately verified.

### Gaps
- Streetmix's drag-and-drop cross-section interaction was not verified in this session; the OSM wiki URL tried returned 404. Its UX is commonly cited but no primary description was read.
- Live demos were not operated; all UX descriptions come from source code, READMEs or docs.
- Vespucci, MapRoulette and Osmose lane-specific UX was not found or examined.
- Maid's turn-restriction module was not inspected, and whether Maid or osm2streets opens a local `.osm` file was not confirmed (osm2streets README mentions Overpass and test cases).

## Q3. Recent hackathon, student or small projects close to this exact idea

### Takeaway
I found no public project matching the exact combination of browser, OSM `.osm` round trip, lane and junction editing, and MATSim/SUMO/Webots export. The niche looks open, with neighbors on each side. Search coverage is limited, so this is "not found", not "does not exist".

### Cited Findings

Closest in function:

- [osm-editor-kit/maid](https://github.com/osm-editor-kit/maid): ISC per [LICENSE.md](https://github.com/osm-editor-kit/maid/blob/main/LICENSE.md), with a [NOTICE.md](https://github.com/osm-editor-kit/maid/blob/main/NOTICE.md) tracking code ported from iD. React 19, maplibre-gl ^6, TypeScript. Created 2026-10-11, 2 stars, push 2026-11-08. Packages include `model`, `operations`, `module-osmchange`, `module-turn-restrictions`, `module-way-table`, `module-parking`. Its README states the code was written and reviewed by an AI model, with a named human specifying and testing behavior, which bears on maturity. Closest OSM-plus-MapLibre foundation, but React, not Vue.
- [das-rise/open-road-editor](https://github.com/das-rise/open-road-editor): GPL-3.0, PyQt6 desktop, built on ORBIT. Edits OSM ways, stitches and splits roads, exports local OSM, and re-runs `netconvert` to refresh an OpenDRIVE overlay live. Push 2026-05-12, 0 stars. Closest concept; desktop and GPL, so inspiration only.
- [guyunge-guma/Lanelet-Editor](https://github.com/guyunge-guma/Lanelet-Editor): Apache-2.0, browser, Vue and Python backend, exports `.osm` (Lanelet2 flavor). Created 2026-07-20, 1 star. Closest stack match.
- [studentdsx/opendrive-editor](https://github.com/studentdsx/opendrive-editor): MIT, browser, OpenDRIVE 1.8, 2026-08-19, 0 stars.
- [FelisPimeja/osm-simple3d-editor](https://github.com/FelisPimeja/osm-simple3d-editor): ISC, MapLibre + three.js, browser OSM editor for 3D buildings, 23 stars, push 2026-11-08. A pattern for a topic-specific OSM editor.
- [pratiksinghlad/openx-studio](https://github.com/pratiksinghlad/openx-studio): MIT, esmini compiled to WASM in Web Workers, React, three.js. Push 2026-10-21.
- [42arch/hdmap-viewer](https://github.com/42arch/hdmap-viewer): Vue 3 + three.js with a TS OpenDRIVE parser building lane topology. No license detected, so look only.
- [Terrency/OpenDriveEditor](https://github.com/Terrency/OpenDriveEditor): MIT, JS, last push 2022-04-08.

Simulation-side and small projects:

- [knejadshamsi/ez-utils](https://github.com/knejadshamsi/ez-utils): no license. Desktop MATSim XML editor on Leaflet. Keeps raw XML blobs and rebuilds only changed fields so unknown attributes survive round trip.
- [aintzevi/matsim-network-editor](https://github.com/aintzevi/matsim-network-editor): no license, JavaFX, imports `.xml` and `.osm`, last push 2021.
- [TagCopperLight/RoadIA](https://github.com/TagCopperLight/RoadIA): no license. Next.js, Pixi.js, Leaflet, Rust. Road editor and simulator.
- [elam-byte/scenario-map-engine](https://github.com/elam-byte/scenario-map-engine): no license. Canvas road editor with junctions and lanes.
- [ipalermo/jOSuMO](https://github.com/ipalermo/jOSuMO): GPL-3.0, "JOSM based editor for SUMO simulation networks", last push 2015. [matt-wirtz/SUMO-NetEditor](https://github.com/matt-wirtz/SUMO-NetEditor): GPL-3.0, 2024.
- [hydrog2n/Atlas](https://github.com/hydrog2n/Atlas): GPL-3.0, C++, lane-level networks for games.
- [bermichevvolodymyr/yumaps](https://github.com/bermichevvolodymyr/yumaps) and [EngYoussefZaki/road-network-editor](https://github.com/EngYoussefZaki/road-network-editor): MIT, browser road drawing without OSM or lanes.

### Inferences
- The defensible novelty for the team is the round trip with simulator export and lane-level junction editing. Each exists separately, but I did not find them together.
- `ez-utils`' byte-preserving round trip is a good idea to reimplement for `.osm`: keep unknown tags and untouched elements unchanged.

### Gaps
- GitHub repository search returned nothing for "osm lane editor", "maplibre road editor", "lane editor vue", "turn lanes editor", "osm road editor vue", "traffic simulation network editor web" and "hackathon road network osm editor". GitHub code search was not used for discovery; GitLab, Gitee and Devpost were not searched.
- Hackathon provenance could not be established for any listed repo.

## Q4. License constraints for reuse in a project whose own license is not yet decided

### Takeaway
Until the team's license is decided, only copy MIT, ISC, BSD and Apache-2.0 code, keeping notices. MPL and EPL code can be used as unmodified, separate components with source-availability duties. GPL and AGPL code should be used only as inspiration or as a separate running tool. Repos with no license, EULA or NC terms should not be copied at all. OSM data itself is ODbL regardless of code license.

### Cited Findings

- **No license:** "the default copyright laws apply", and no one may reproduce, distribute or create derivative works; others may only view and fork on GitHub under its terms — [GitHub Docs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).
- **ISC:** permits use, copying, modification and distribution for any purpose provided the copyright and permission notice appear in all copies — text in [Maid LICENSE.md](https://github.com/osm-editor-kit/maid/blob/main/LICENSE.md).
- **BSD:** redistributions must retain the copyright notice, conditions and disclaimer — [MapLibre LICENSE.txt](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt).
- **Apache-2.0:** requires a copy of the license, prominent notices on changed files, retained notices and NOTICE contents — [Apache License §4](https://www.apache.org/licenses/LICENSE-2.0).
- **Apache and GPL:** Apache-2.0 code can go into GPLv3 projects but not the reverse; FSF has never considered Apache-2.0 compatible with GPLv2 — [Apache](https://www.apache.org/licenses/GPL-compatibility.html).
- **MPL-2.0:** file-level copyleft; new files without MPL code need not be MPL, even in a Larger Work; modified MPL files must stay available — [MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).
- **EPL-2.0:** distribution requires source availability; "Secondary License" means GPL-2.0 or later where designated; "Modified Works" covers additions, deletions, modifications and new files containing Program content — [EPL-2.0 text](https://www.eclipse.org/org/documents/epl-2.0/EPL-2.0.txt). SUMO offers EPL-2.0 with GPL-2.0-or-later as secondary — [SUMO docs](https://sumo.dlr.de/docs/Libraries_Licenses.html).
- **GPL, server only:** "The GPL does not require you to release your modified version" when used privately — [GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html).
- **GPL, browser JavaScript:** when a site distributes GPLed JavaScript to visitors, source "must be released to the user under the terms of the GPL" — [GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html).
- **GPL, separate programs:** pipes, sockets and command-line arguments are normally communication between separate programs, but exchanging intimate internal data structures could make them combined — [GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html).
- **AGPL:** modified versions must offer source to all users interacting over a network — [GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html).
- **Non-open items that look open:** Apollo Map Studio is [CC BY-NC 4.0](https://github.com/SakuraPuare/apollo-map-studio/blob/main/LICENSE); Truevision Designer is under an [EULA](https://github.com/truevisionai/designer/blob/main/LICENSE.md).
- **OSM data:** ODbL; attribution required; "If you alter or build upon our data, you may distribute the result only under the same license" — [OSM copyright](https://www.openstreetmap.org/copyright). SUMO's OSM-based test inputs are also ODbL — [SUMO docs](https://sumo.dlr.de/docs/Libraries_Licenses.html).

### Inferences

| Source license | Examples here | Copy into undecided-license project? | Allowed safely |
|---|---|---|---|
| ISC, MIT, BSD, WTFPL | iD, Rapid, Maid, OSMnx, MapLibre, Terra Draw, Lanelet2, Potlatch 2, Level0 | **Yes**, keep notices (WTFPL requires none, but credit anyway) | Copy, adapt, port |
| Apache-2.0 | osm2streets, A/B Street, libOpenDRIVE, Vespucci, xodr_edit, LaneMaker, Autoware tools | **Yes**, keep LICENSE and NOTICE, mark changed files | Copy, adapt, port. Blocks a later GPLv2-only choice |
| MPL-2.0 | esmini | As a component; modified files stay MPL | Link or bundle; do not paste into own files |
| EPL-2.0 / GPL-2+ | SUMO, netedit | **No copying into own code** | Run `netconvert`, `sumo` as separate processes; UX ideas |
| LGPL | COVISE/ODDLOT, MapToolbox | Library use only | Not useful for a web client |
| GPL-2/3 | JOSM + plugins, Osmose, Keep Right, Blender DSC, CommonRoad, ORBIT, open-road-editor, pt2matsim, StreetComplete | **No**, unless the whole project becomes GPL-compatible | External process; inspiration |
| AGPL-3 | Streetmix, 3DStreet | **No**; network clause applies even when only hosted | Inspiration |
| No license, EULA, CC BY-NC | turnlanes-tagging (no LICENSE file, GPL header, treat as GPL), RoadIA, hdmap-viewer, ez-utils, odrviewer, opendrivejs, OsmLaneVisualizer, Truevision, Apollo Map Studio | **No** | Read for ideas only |

- A GPL-derived frontend is the worst case for this architecture: serving it to browsers is distribution, so it would force the client's source under GPL. A GPL library merged into the Django server triggers duties once the code is handed to anyone, which plausibly includes organizers or a customer.
- Interaction patterns and general ideas are normally not protected the way code is, so reimplementing "click source lane, then click target" is low risk. Do not translate GPL source line by line into JS, because a port is still a derivative. Have the implementer work from docs and behavior.
- Keep a `THIRD_PARTY_NOTICES` file from the first commit and record the origin of each ported file; Maid's NOTICE.md is a good template.
- Choose the team's license early. MIT or Apache-2.0 keeps every permissive source usable; Apache-2.0 aligns with osm2streets.
- Exported `.osm` files and derived networks containing OSM data should carry OSM attribution and ODbL terms, separately from the code license.

### Gaps
- The Apache/GPL compatibility statement was read from Apache's page; the FSF's own compatibility list was not reached because the FAQ fetch truncated before those entries.
- The EPL-2.0 FAQ page returned only navigation text, so EPL points come from the license text excerpts, and the boundary of "Modified Works" for separately compiled tools was not analyzed in full.
- Whether a jury submission counts as "distribution" is an inference; real-world legal advice was not sought.
