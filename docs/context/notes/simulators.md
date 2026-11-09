# Open-source alternatives to PTV Visum and PTV Vissim (state as of 2026-11-09)

Method note for the report writer: licence, language, last commit and release data were read directly from the GitHub REST API on 2026-11-09 (`repos/{owner}/{repo}`, `/commits`, `/releases/latest`, `/tags`, and LICENSE file contents). "Last commit" is the newest commit on the default branch. Only legal, publicly licensed software and public documentation were consulted. MDPI, aequilibrae.com and yadda.icm.edu.pl returned HTTP 403 to the fetch tool, so those items rest on abstracts (DOAJ, Crossref) or on repository source. Where a claim rests only on a search excerpt, it is marked "(excerpt only)".

## For each tool: licence, language, 2025-2026 activity, URL, what it models, closeness to Visum/Vissim

### Takeaway
No single open tool replaces either product. The closest Vissim-like tools are Eclipse SUMO (broadest, EPL-2.0, released October 2026) and OpenTrafficSim (BSD-3-Clause, the most permissive licence with explicit conflict-area logic). The closest Visum-like tool for static assignment and four-step components is AequilibraE (MIT plus an attribution clause, released October 2026). ActivitySim, MATSim and POLARIS cover demand or agent-based modelling instead. Several tools named in the brief are dormant, and "TrafficPy" could not be identified as a traffic simulator at all.

### Cited Findings

Comparison table. All licence and activity values come from the linked repository unless noted.

| Tool | Licence (verified) | Language | Latest release / tag | Last commit | Models | Closest to |
|---|---|---|---|---|---|---|
| [Eclipse SUMO](https://github.com/eclipse-sumo/sumo), incl. netedit | EPL-2.0 | C++ core with Python tools (GitHub's primary-language tag says Python) | [1.28.0, 2026-10-08](https://sumo.dlr.de/docs/Downloads.php) | 2026-11-09 | Microscopic continuous simulation, demand and network tooling | Vissim |
| [MATSim](https://github.com/matsim-org/matsim-libs) | [GPL-2.0-or-later](https://github.com/matsim-org/matsim-libs/blob/main/matsim/LICENSE) (GitHub API shows none at repo level) | Java | 2026.0, 2026-04-10 | 2026-11-07 | Multi-agent planning with queue-based flow | Partly Visum (agent-based alternative) |
| [AequilibraE](https://github.com/AequilibraE/aequilibrae) | [MIT with added attribution clause](https://github.com/AequilibraE/aequilibrae/blob/develop/LICENSE.TXT) | Python/Cython | v1.7.2, 2026-10-20 | 2026-10-20 | Static assignment, gravity, IPF, zoning | Visum |
| [QAequilibraE QGIS plugin](https://github.com/AequilibraE/qaequilibrae) | [MIT](https://github.com/AequilibraE/qaequilibrae/tree/develop/qaequilibrae) (LICENSE sits in a subfolder, GitHub shows NOASSERTION) | Python | No GitHub releases | 2026-10-26 | QGIS front end for AequilibraE | Visum UI |
| [ActivitySim](https://github.com/ActivitySim/activitysim) | BSD-3-Clause | Python (GitHub tag: Jupyter Notebook) | v1.6.0 tag, 2026-09-17 | 2026-11-05 | Activity-based travel demand | Demand side only |
| [DTALite](https://github.com/asu-trans-ai-lab/DTALite) | GPL-3.0 | C++ | No releases | 2024-08-17 ([jdlph fork](https://github.com/jdlph/DTALite): 2024-07-06) | Assignment and DTA engine | Visum / DTA |
| [Path4GMNS](https://github.com/jdlph/Path4GMNS) | Apache-2.0 | Python | v0.10.0, 2025-12-16 | 2025-12-16 | [Link- and path-based UE, DTA, ODME, accessibility, zone and OD synthesis](https://github.com/jdlph/Path4GMNS) | Visum subset |
| [GMNS](https://github.com/zephyr-data-specs/GMNS) | [Apache-2.0](https://github.com/zephyr-data-specs/GMNS/blob/master/LICENSE-2.0.txt) (non-standard filename, API shows none) | JSON schema | v0.97 tag, 2026-03-04 | 2026-03-04 | Network data format | Data model |
| [TransportationNetworks](https://github.com/bstabler/TransportationNetworks) | [No software licence; "for academic research purposes only"](https://github.com/bstabler/TransportationNetworks#license) | Data | None | 2025-06-19 | Assignment benchmark networks | Test data |
| [OpenTrafficSim](https://github.com/averbraeck/opentrafficsim) | BSD-3-Clause | Java | v1.8.1, 2026-08-29 | 2026-11-08 | Multi-level simulation, IDM+/LMRS, conflicts | Vissim |
| [UXsim](https://github.com/toruseo/UXsim) | MIT | Python | v1.15.1, 2026-10-16 | 2026-11-09 | [Macro/mesoscopic DTA, Newell-based](https://github.com/toruseo/UXsim) | Between the two |
| [CityFlow](https://github.com/cityflow-project/CityFlow) | Apache-2.0 | C++ | No releases | 2025-08-19 | [Microscopic, multi-threaded, RL-oriented](https://cityflow.readthedocs.io/en/latest/introduction.html) | Partial Vissim |
| [CityFlowER](https://github.com/cityflow-project/CityFlowER) (the brief's "CityFlower") | Apache-2.0 | C++ (GitHub tag: Makefile) | None | 2024-12-19 | CityFlow with embedded ML behaviour models | Research only |
| [Flow](https://github.com/flow-project/flow) | MIT | Python | v0.4.1, 2019-09-08 | 2020-12-11 | RL framework for traffic control | Dormant |
| [A/B Street](https://github.com/a-b-street/abstreet) | Apache-2.0 | Rust | v0.3.49, 2024-01-09 | 2025-09-10 | Street editing plus traffic simulation on OSM | UI reference |
| [MovSim](https://github.com/movsim/movsim) | GPL-3.0 | Java | v1.0 tag (old, date not checked) | 2026-09-02 | Multi-model vehicular simulator | Partial Vissim |
| [traffic-simulation.de](https://github.com/movsim/traffic-simulation-de) | GPL-3.0 | JavaScript | None | 2026-10-29 | In-browser IDM/ACC with MOBIL | In-browser reference |
| [MITSIMLab](https://sourceforge.net/projects/mitsim/) | MIT (SourceForge listing) | C++ | Single file `view_8.04.tar.gz` | SourceForge last update 2015-08-06 | Operational traffic-management evaluation | Dormant |
| [Eclipse MOSAIC](https://github.com/eclipse-mosaic/mosaic) | EPL-2.0 | Java | 25.2 tag, 2025-12-15 | 2026-04-28 (pushed 2026-08-10) | [Co-simulation of SUMO with ns-3/OMNeT++](https://www.eclipse.dev/mosaic/) | V2X, not a Vissim substitute |
| [OpenTripPlanner](https://github.com/opentripplanner/OpenTripPlanner) | [LGPL-3.0-or-later](https://github.com/opentripplanner/OpenTripPlanner/blob/dev-2.x/LICENSE) (API: NOASSERTION) | Java | v2.10.0, 2026-09-09 | 2026-11-09 | Multimodal trip planning | Not assignment |
| [Conveyal R5](https://github.com/conveyal/r5) | MIT | Java | v7.6 tag, 2026-08-01 | 2026-11-09 | Routing engine behind Conveyal Analysis | Accessibility only |
| [Conveyal analysis-ui](https://github.com/conveyal/analysis-ui) | MIT | TypeScript | None | 2022-01-13 | Scenario-editing front end | UI reference, stale |
| [TRANSIMS](https://sourceforge.net/projects/transims/) | NASA Open Source Agreement (SourceForge listing) | C++ | `TRANSIMS 7.1 64bit July 2018` | SourceForge last update 2022-03-15 | Integrated regional travel forecasting | Legacy |
| [POLARIS](https://vms.taps.anl.gov/announcements/polaris/2024/polaris_studio_release) | Mixed, see below | C++ core, Python Studio | [polaris-studio 2026.10.1](https://pypi.org/project/polaris-studio/) | GitLab, not checked | Agent-based demand and traffic simulation | Partly Visum |

Additional findings:
- **TrafficPy:** no traffic simulator of that name was found. GitHub search returned only small unrelated repositories, such as [bbayles/trafficpy](https://github.com/bbayles/trafficpy), described as a network traffic monitor, and [waqasishaq/Trafficpy](https://github.com/waqasishaq/Trafficpy), a departure-time analysis.
- **POLARIS licensing is mixed:** Argonne says POLARIS Studio was released [with an open-source license](https://vms.taps.anl.gov/announcements/polaris/2024/polaris_studio_release), but PyPI metadata gives the custom identifier `LicenseRef-Polaris-Studio` ([PyPI](https://pypi.org/pypi/polaris-studio/json)). The documentation says [a license is required to use and run POLARIS](https://polaris.taps.anl.gov/polaris/getting_started/index.html) (excerpt only).
- **A/B Street status:** the README says that ["As of 2025, this project has turned into several others"](https://github.com/a-b-street/abstreet), developed by A/B Street Ltd, including od2net and a low-traffic neighbourhood tool.
- **PTV Vissim student version:** free for one year, not for commercial use, capped at 600 seconds of simulation, and watermarked during simulation ([PTV](https://www.ptvgroup.com/en/products/ptv-vissim/student-version)). The same page is reported to limit networks to 1 km x 1 km and 30 zones (excerpt only).
- **PTV Visum student version:** free for one year, not for commercial use, fixed at size A2 (30 districts, 500 nodes, 1,500 links, 100 travel time profiles), and files saved under it cannot be opened with a regular licence ([PTV](https://www.ptvgroup.com/en/products/ptv-visum/student-version)). Both student versions are proprietary and are not open alternatives.
- **netedit** has three supermodes (Network, Demand, Data). Network has Edges, Connections, Prohibitions, Traffic Lights, Additionals, Crossings, TAZ and Shapes modes, and the tool offers unlimited undo/redo. The exception is Compute Junctions with volatile options (Shift+F5), which cannot be undone ([SUMO docs](https://sumo.dlr.de/docs/Netedit/index.html)).
- **GMNS** defines tables for node, link, geometry, lane, segment, movement, zone, use definitions, signal controllers, phases and timing plans, plus time-of-day variants ([spec folder](https://github.com/zephyr-data-specs/GMNS/tree/master/spec)).
- **OpenTrafficSim** has separate modules including `ots-editor`, `ots-web`, `ots-opendrive` and `ots-road` ([repository](https://github.com/averbraeck/opentrafficsim)).
- **SimWrapper**, the MATSim-linked results viewer, is [GPL-3.0, written in Vue, with its last commit on 2026-11-06](https://github.com/simwrapper/simwrapper).

### Inferences
- Best fit for reuse under a permissive licence: OpenTrafficSim (BSD-3) for microsimulation, GMNS (Apache-2.0) for the data model, Path4GMNS (Apache-2.0) and AequilibraE (MIT plus attribution) for macro logic.
- GPL-licensed code (MATSim, DTALite, MovSim, traffic-simulation.de, SimWrapper) should be treated as reference only if the editor will not itself be GPL. Reimplementing from published equations is the safer path. EPL-2.0 (SUMO) is weak copyleft, so copying SUMO source files carries obligations on those files. Both points need legal review.
- Path4GMNS is Apache-2.0 but [acts as a Python API to the C++ DTALite](https://github.com/jdlph/Path4GMNS), which is GPL-3.0 in the repositories checked. Check which binary and licence ship before relying on the permissive label.
- Treat Flow, MITSIMLab, TRANSIMS and CityFlowER as historical or research references, given their activity dates.
- TransportationNetworks should not be bundled in a commercial product given its "academic research purposes only" statement. Use in internal benchmarking needs a licence judgment.

### Gaps
- TransModeler was excluded as not open, per the brief. Its licensing was not separately checked.
- POLARIS: the text of `LicenseRef-Polaris-Studio` and the core simulator's terms were not read, and GitLab activity was not checked.
- MITSIMLab: the SourceForge download is named `view_8.04`, and it is unconfirmed whether it holds the full simulator source.
- The MovSim v1.0 tag date and whether its 2026 commits are substantive were not checked.
- ActivitySim's lack of network assignment, and the exact scope of R5 and OpenTripPlanner, come from repository descriptions and were not checked in the docs.

## Transport-district features (zoning, TAZ generation, OD matrices, gravity, four-step) and automatic TAZ delineation from OSM buildings

### Takeaway
Grid or hexagon zoning, gravity models and IPF are available as open code, with AequilibraE the most complete. I found no verified open code that delineates TAZs end to end from OSM buildings: the closest open tool computes attractiveness for existing zones, and the published delineation methods had no repository I could locate.

### Cited Findings
- **AequilibraE** ships [`gravity_application.py`, `gravity_calibration.py`, `synthetic_gravity_model.py`, `ipf.py` and `project/zoning.py`](https://github.com/AequilibraE/aequilibrae/tree/develop/aequilibrae/distribution). Its [example](https://github.com/AequilibraE/aequilibrae/blob/develop/docs/source/examples/other_applications/plot_create_zoning.py) creates hex-bin zones covering a network and adds centroid connectors and a special generator zone.
- **SUMO district tools:** `gridDistricts.py` builds a grid of TAZs of a set width, `stationDistricts.py` builds TAZs around public transport stations, `edgesInDistricts.py` assigns edges to zones from polygons, and `filterDistricts.py` trims zones by vehicle class and connectivity ([SUMO docs](https://sumo.dlr.de/docs/Tools/District.html)). The [`tools/district` folder](https://github.com/eclipse-sumo/sumo/tree/main/tools/district) also holds `aggregateAndSplitMatrices.py` and `districtMapper.py`.
- **SUMO's TAZs are edge-based:** the district tools work on edge lists, with `tazSource` and `tazSink` elements ([SUMO docs](https://sumo.dlr.de/docs/Tools/District.html)). netedit has a [TAZ mode and a TAZ Relation data mode](https://sumo.dlr.de/docs/Netedit/index.html).
- **macro_traffic_sim_core** (Rust, Apache-2.0) implements the [four-step model](https://docs.rs/crate/macro_traffic_sim_core/0.1.0): trip generation by regression or cross-classification, gravity distribution with exponential, power or combined impedance, Furness balancing, multinomial logit mode choice, and assignment with a skim feedback loop. Its core has no I/O and uses a GMNS-based graph.
- **Path4GMNS** includes [zone and OD demand synthesis](https://github.com/jdlph/Path4GMNS).
- **OSM2Attractiveness** (Python and R, described as open source) assigns OSM elements to activity types, estimates usable floor space from building polygons and floor counts, converts this to trip attraction, and aggregates to TAZ. The abstract says it is on GitHub but gives no URL or licence, and notes missing floor counts limit accuracy ([State of the Map 2026 talk](https://pretalx.com/sotm2026-osm-science/talk/EYA7UN/)).
- **Adaptive zoning from OSM data:** a method applies constrained k-means to OSM building data and then dissolves Voronoi cells into contiguous zones ([TRID record](https://trid.trb.org/View/2711042), excerpt only). I found no code link.
- **Molloy and Moeckel, gradual zone systems:** a quadtree algorithm on open data, with code reported to be on GitHub ([paper](https://rd.springer.com/content/pdf/10.1186/s40965-017-0032-5.pdf), excerpt only). I could not locate the repository.
- **Castiglione et al. 2025** cluster Sentinel-2 imagery, OSM layers and over 1.5 million floating-car trips to define TAZs for Rome's EUR district. The abstract page mentions no code ([Journal of Transport Geography](https://ideas.repec.org/a/eee/jotrge/v128y2025ics0966692325002157.html)).
- **zonebuilder** (R, [GPL-3.0, last commit 2025-02-13](https://github.com/zonebuilders/zonebuilder)) generates [ClockBoard radial zones](https://archive.linux.duke.edu/cran/web/packages/zonebuilder/vignettes/paper.html) around a centre. It does not use buildings.

### Inferences
- A practical browser pipeline would combine a building-weighted clustering step (the k-means and Voronoi approach above) with road-network boundary snapping. This would be new development, since no reusable implementation was verified.
- Storing zones as polygons plus connectors (AequilibraE, GMNS `zone` table) matches Visum's district concept better than SUMO's edge-set TAZ. An editor could export to SUMO by deriving edge sets, the same operation `edgesInDistricts.py` performs.

### Gaps
- OSM2Attractiveness repository URL and licence are unconfirmed.
- Whether the adaptive zoning paper or the Rome paper publish code would need the full texts.
- I found no evidence for or against a built-in gravity model in SUMO. Its OD tooling beyond the items above was not reviewed.

## Macro assignment implementations (Frank-Wolfe, MSA, BPR, bush-based) portable to JS/TS or WASM

### Takeaway
I found no maintained open Frank-Wolfe implementation already running in the browser. The most direct route is compiling a permissively licensed Rust core to WASM (macro_traffic_sim_core or PyTraf), or writing TypeScript from AequilibraE's or tap-b's logic. WASM builds of these are untested.

### Cited Findings
- **macro_traffic_sim_core:** Rust, [Apache-2.0, last pushed 2026-08-05](https://github.com/LdDl/macro_traffic_sim_core). Offers [Frank-Wolfe with bisection line search, MSA, gradient projection, and BPR](https://docs.rs/crate/macro_traffic_sim_core/0.1.0). Its docs do not mention WASM or BFW. The repository is very small (3 stars).
- **PyTraf:** Rust, [MIT, last pushed 2026-10-14](https://github.com/harisbal/pytraf). Static user equilibrium in path space by gradient projection, with Frank-Wolfe as a reference method, turn delays and multiple vehicle classes.
- **AequilibraE:** [`traffic_assignment.py`](https://github.com/AequilibraE/aequilibrae/blob/develop/aequilibrae/paths/traffic_assignment.py) accepts all-or-nothing, MSA, Frank-Wolfe, CFW and BFW. Volume-delay functions are in [Cython files for BPR, BPR2, conical and INRETS](https://github.com/AequilibraE/aequilibrae/tree/develop/aequilibrae/paths/cython).
- **Path4GMNS** v0.10.0 added [link-based Frank-Wolfe with line search](https://github.com/jdlph/Path4GMNS), reported to be faster per iteration with less memory.
- **spartalab/tap-b:** C, [MIT, last commit 2024-09-23](https://github.com/spartalab/tap-b), a fast implementation of Dial's Algorithm B (bush-based).
- **TAsK:** C++, [MIT, last pushed 2015](https://github.com/pedrocamargo/TAsK), with 11 algorithms including Algorithm B and TAPAS. It was tested only on Ubuntu 12.10 to 14.04.
- **tabench** documents Python modules for [Algorithm B](https://tabenchmark.readthedocs.io/en/latest/_modules/tabench/models/algb.html) and [TAPAS](https://tabenchmark.readthedocs.io/en/latest/_modules/tabench/models/tapas.html). Its TAPAS notes flag one step as verified only against a secondary reference.
- **cppRouting** (R) offers [bush-based Algorithm B with batching](https://search.r-project.org/CRAN/refmans/cppRouting/html/assign_traffic.html) alongside MSA and Frank-Wolfe variants.
- **SUMO marouter is weaker than its name suggests:** incremental is the default, SUE is supported, and UE is listed as "Not yet implemented". It uses a hard-coded capacity function ([SUMO docs](https://sumo.dlr.de/docs/marouter.html)).
- **Unlicensed code warning:** GitHub search reports no detected licence for popular Frank-Wolfe scripts such as [matteobettini/Traffic-Assignment-Frank-Wolfe-2021](https://github.com/matteobettini/Traffic-Assignment-Frank-Wolfe-2021). The same applies to [harisbal/tarust](https://github.com/harisbal/tarust).

### Inferences
- Rust cores are the lowest-friction WASM path because they have few system dependencies. TAsK's age and tap-b's C code imply more porting effort, though C compiles to WASM with Emscripten.
- For an interactive editor, link-based BFW with warm starts from the previous solution would suit edit-and-reassign loops. Bush-based methods give higher precision at more memory cost. This is my judgment and is not a benchmarked finding.
- TransportationNetworks instances (Sioux Falls and others) are the natural convergence test set, subject to the licence caveat above.

### Gaps
- No browser benchmark of any of these was found.
- The licences of tabench and cppRouting were not verified.
- [TrafficAssignment.jl](https://github.com/chkwon/TrafficAssignment.jl) reports NOASSERTION on GitHub, and its terms were not read.

## Open lane-change, car-following (IDM, Wiedemann) and conflict-area logic for an in-browser microsimulation

### Takeaway
SUMO has the widest set of models, including Wiedemann and W99. OpenTrafficSim has the most reusable conflict-area algorithm under BSD-3. traffic-simulation.de proves IDM and MOBIL run well in plain JavaScript, but its GPL-3.0 licence means reimplementing from the published equations instead of copying.

### Cited Findings
- **SUMO car-following models:** Krauss (default), KraussOrig1, PWagner2009, BKerner, IDM, IDMM, EIDM, KraussPS, KraussAB, SmartSK, Wiedemann, W99, Daniel1, ACC, NaSch, CACC and Rail ([SUMO docs](https://sumo.dlr.de/docs/Definition_of_Vehicles%2C_Vehicle_Types%2C_and_Routes.html)). Source files include `MSCFModel_IDM.cpp`, `MSCFModel_Wiedemann.cpp` and `MSCFModel_W99.cpp` ([source](https://github.com/eclipse-sumo/sumo/tree/main/src/microsim/cfmodels)).
- **SUMO lane-change models:** LC2013 (default), SL2015 and DK2008 ([SUMO docs](https://sumo.dlr.de/docs/Definition_of_Vehicles%2C_Vehicle_Types%2C_and_Routes.html), [source](https://github.com/eclipse-sumo/sumo/tree/main/src/microsim/lcmodels)).
- **SUMO intersections:** internal lanes and internal junctions let left-turners wait inside the junction, and link states encode priority. `visibilityDistance` sets where a vehicle checks for foes, `impatience` sets merging aggressiveness, and `keepClear` plus `jmIgnoreKeepClearTime` handle junction blocking. Turn speed is limited by `speedLimit = sqrt(radius * factor)` with default factor 5.5 ([SUMO docs](https://sumo.dlr.de/docs/Simulation/Intersections.html)).
- **OpenTrafficSim conflict derivation:** after a bounds check, it intersects the left and right edges of two lanes (four edge pairs), sorts the intersections along lane 1, and classifies merge conflicts (equal downstream ends) and split conflicts (equal upstream ends). Crossing conflicts come from toggling a "crossed" flag per edge pair until all four agree again, and a lane pair can yield several crossings ([OTS docs](https://opentrafficsim.readthedocs.io/en/latest/99-appendices/conflict-areas/)).
- **OpenTrafficSim source (BSD-3):** [`Idm.java`](https://github.com/averbraeck/opentrafficsim/blob/main/ots-road/src/main/java/org/opentrafficsim/road/gtu/tactical/following/Idm.java), [`IdmPlus.java`](https://github.com/averbraeck/opentrafficsim/blob/main/ots-road/src/main/java/org/opentrafficsim/road/gtu/tactical/following/IdmPlus.java), [`Lmrs.java`](https://github.com/averbraeck/opentrafficsim/blob/main/ots-road/src/main/java/org/opentrafficsim/road/gtu/tactical/lmrs/Lmrs.java), [`ConflictUtil.java`](https://github.com/averbraeck/opentrafficsim/blob/main/ots-road/src/main/java/org/opentrafficsim/road/gtu/tactical/util/ConflictUtil.java) and [`ConflictBuilder.java`](https://github.com/averbraeck/opentrafficsim/blob/main/ots-road/src/main/java/org/opentrafficsim/road/network/conflict/ConflictBuilder.java).
- **LMRS** combines route, speed and right-keeping incentives into a lane-change desire that drives gap acceptance and synchronization ([TU Delft](https://repository.tudelft.nl/file/File_2a3984e4-0d72-4de3-abf6-ddb68115e96a), excerpt only).
- **traffic-simulation.de** is [GPL-3.0 JavaScript](https://github.com/movsim/traffic-simulation-de) with `models.js`, `road.js`, `vehicle.js`, `intersection.js` and `roundabout.js` ([js folder](https://github.com/movsim/traffic-simulation-de/tree/master/js)). Its [documentation](https://traffic-simulation.de/info/info_IDM.html) describes IDM with an ACC variant, MOBIL lane changing, and a ballistic update with Δt below 0.5 s being adequate.
- **Published IDM example parameters** for cars on that page: v0 120 km/h, T 1.5 s, s0 2 m, a 0.3 m/s², b 3 m/s². The page says 0.3 m/s² is deliberately low to provoke stop-and-go, and that realistic acceleration is 0.8 to 2.5 m/s² ([traffic-simulation.de](https://traffic-simulation.de/info/info_IDM.html)).
- **UXsim** uses [Newell's simplified car-following model and the X-model](https://github.com/toruseo/UXsim) for a lighter mesoscopic option, reporting over 60,000 vehicles in 30 seconds in a city case (project claim).
- **[micro_traffic_sim_core](https://github.com/LdDl/micro_traffic_sim_core)** is a Rust microsimulation core (Apache-2.0, pushed 2026-10-31, 2 stars). Its models were not examined.

### Inferences
- A sensible browser design: IDM or IDM+ for longitudinal control, a MOBIL- or LMRS-style desire model for lane changes, and OTS-style geometric conflict detection run at edit time. The detection is a pure geometry computation, so it fits a network editor and can be cached per junction.
- Wiedemann 74 and 99 can be studied in SUMO's source, but those files are EPL-2.0, and a port would inherit that licence on the ported files.

### Gaps
- OTS docs did not state numeric tolerances or complexity for conflict derivation.
- A/B Street's traffic model documentation returned 404, so its discrete-event model is unverified here.
- How SUMO computes foes internally is not on the intersection page and would need its source (`MSLink`, `NBRequest`), which was not reviewed.
- No direct SUMO W99 versus Vissim W99 equivalence test was found. Vissim's implementation is proprietary and was not examined.

## Published comparisons of SUMO and Vissim, or MATSim and Visum

### Takeaway
The literature is small and scenario-specific. Open tools tend to win on runtime, memory and scalability, while Vissim matched observed travel times more closely in the most recent quantitative study. MATSim and Visum agree in aggregate but differ in how traffic spreads across links.

### Cited Findings
- **Anyin, Wittenberg and Pannek, *Future Transportation*, December 2025** tested VISSIM, SUMO and MATSim on runtime, memory, runtime consistency, travel time, safe gap distance and scalability. SUMO and MATSim performed strongly on runtime and memory, MATSim scaled best, and VISSIM matched real-world travel times more closely and suited less dense detailed simulation ([DOI 10.3390/futuretransp5040201](https://doi.org/10.3390/futuretransp5040201), abstract via Crossref).
- **Piątkowski and Maciejewski, *Transport Problems*, 2013** compared VISUM and MATSim on a virtual city using link volumes, average travel time and distance. Overall results converged but detailed distribution differed: static assignment raised flows on links near connectors, while VISUM's dynamic assignment spread traffic more uniformly, matching MATSim ([DOAJ](https://doaj.org/article/f2d1e3e5cf3c419eaaf5cda3397c9041)).
- **Maciejewski, *Transport Problems*, 2010** applied TRANSIMS, SUMO and VISSIM to a fragment of a real urban network, with calibration and comparison against real traffic ([DOAJ](https://doaj.org/article/e167acd4bbb64f8fb309b8c29e5de1b4)). It used SUMO 0.11.1 (excerpt only), so its findings are dated.
- **Raney et al., STRC 2003 (Zurich)** reported a mean relative error of 25% for the agent-based model against 30% for a VISUM assignment, noting the OD matrices had been adjusted with a VISUM module to match counts ([STRC](https://www.strc.ch/2003/raney.pdf), excerpt only).
- **Lane-merging microsimulation comparison (2022 proceedings):** the simulators had similar computational demand, but delay estimates were inconsistent and SUMO showed more variability than Vissim ([AMiner](https://www.aminer.org/pub/635badf990e50fcafdbb2a59/a-microsimulation-comparison-for-lane-merging-driver-behaviors), excerpt only).
- **WSC 2024 conference paper** on VISSIM, AIMSUN and SUMO reported that network-level performance was consistent across the three ([WSC](https://informs-sim.org/wsc24papers/con326.pdf), excerpt only, full text could not be extracted).
- **SUMO User Conference 2024** recalibrated Krauss, IDM and W99 on trajectory data and reported default SUMO models tend to give shorter time headways than observed, which calibration reduced ([paper](https://sumo.dlr.de/pdf/2024/6-3.pdf), excerpt only).

### Inferences
- The connector-loading artefact in static assignment is a concrete design lesson: an editor should make connector placement visible and easy to distribute across several network nodes.
- Defaults matter more than the simulator's label. The evidence supports requiring calibration before comparing any open tool with Vissim output.

### Gaps
- Full texts of the 2025 and 2013 papers were blocked, so effect sizes and network details are missing.
- A TU Braunschweig record ([dbbs_mods_00079681](https://leopard.tu-braunschweig.de/receive/dbbs_mods_00079681)) appeared in search with wording identical to the Anyin abstract. It is probably the same work and should not be counted as independent. The page was behind a security check and this could not be confirmed.
- I found no recent peer-reviewed head-to-head of AequilibraE and Visum, or of OpenTrafficSim and Vissim.
- [A 2021 comparative evaluation of road traffic simulators](https://www.scitepress.org/Papers/2021/102383/102383.pdf) turned up in search but was not read.
