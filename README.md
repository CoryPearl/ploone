# Ploon

A little plane. An endless sky. A desktop flying game with daily mountain races, free flight, eight American aircraft, personal ghosts, and an endlessly generated low-poly world.

Vanilla HTML, CSS, and JavaScript modules. Three.js is the only runtime dependency. The backend uses Node.js built-ins. No frameworks or build step.

## Run

Requires Node.js 22 or newer.

```sh
npm install
npm start
```

Open **http://localhost:3000**. Use `npm run dev` to restart when backend files change; refresh the browser after frontend changes. `PORT` and `HOST` configure the server. For another device, run `HOST=0.0.0.0 npm start`.

The home screen has a plane picker, a pilot name field, Daily race, Free flight, and Custom map. Leave the name blank to use the automatic name assigned to this browser. Both the home field and Settings edit the same saved name. Today's course is always visible, with terrain, the finish, and the race ceiling. The Top 10 shows shared times for that course and selected plane. The plane picker and board header identify the aircraft; its best-time row shows your current rank alongside your time. Controls and Settings are available from home and the pause menu. Open the plane picker → Customize, or choose Customize while paused, to decorate the selected aircraft.

## Fly

| Keys | Action |
| --- | --- |
| W / S or ↑ / ↓ | Pitch down / up |
| A / D or ← / → | Roll left / right; banking turns the aircraft |
| Q / E | Yaw left / right |
| Shift / Ctrl | Increase / decrease throttle |
| Shift (hold at 100% throttle) | Afterburner on F-16, F/A-18, F-22, and F-35 |
| Space (hold) | Air drift / airbrake; yaw or bank to slide |
| C | Switch chase / cockpit views |
| H | Show / hide the flight HUD |
| G | Landing gear in free fly; personal ghost in races |
| R | Restart flight |
| Escape | Pause / resume |
| Enter / N (home) | Play daily race / choose a custom seed |

In **free fly**, press **G** to extend or retract the animated landing gear. It takes 1.4 seconds to lock; the Cessna's fixed gear stays down. The HUD shows each aircraft's landing speed limit in your selected units and warns if an approach is too fast. Touch down gently, with level wings, on a runway or flat grass. Excessive speed, a hard impact, steep ground, sideways or banked touchdowns, and gear-up landings cause a crash with an explanation. Water and buildings remain hazardous. After landing, hold **Space** to brake, use **Q/E** to taxi, and add power with **Shift**, then pull up with **S** to take off. Gear cannot retract while grounded. Landing physics apply only to free fly; race ground collisions, G's ghost toggle, and existing race/ghost versions stay unchanged.

Daily and custom races have **one large finish ring**. Its marker shows direction and distance, even when mountains hide the ring. Approach from either side and fly through it. The map shows open terrain without preset paths. Choose your own gaps, saddle crossings, climbs, and detours to reach the finish. Terrain, buildings, wells, silos, boulder outcrops, balloons, radio towers, and spinning turbine blades create obstacles.

Procedural courses have a fixed ceiling rounded up to a **500 ft increment**, such as **3,500 or 4,000 ft**, shown on the map and HUD. A translucent red grid fades into view at the actual ceiling altitude when you approach it, remaining anchored in the 3D world as you fly. It disappears when you descend away from the limit. The altitude display and ceiling badge also turn red, with a “Ceiling · descend now” banner and a countdown of the height remaining. HUD warnings begin within 100 m (328 ft), or three seconds of continued climb, whichever gives more notice. Exceeding the ceiling ends the race with an explanation; replay verification uses the same per-course limit. Maverik uses its special low-approach and climb ceilings described below. **Free flight has no ceiling or grid.** There are no missiles.

**mph and feet are the default.** Settings → Units switches to km/h and meters. The setting updates both camera HUDs, the cockpit panel, destination distance, ceiling, aircraft speed descriptions, and results. It is saved on this device. The finish marker always uses feet in imperial mode and meters in metric mode.

The aircraft are F-16, F/A-18, F-22, F-35, A-10, P-51, F4U, and Cessna 172. All are unlocked. Each has original procedural geometry proportioned from aircraft references; see [aircraft model notes](docs/aircraft-models.md). Performance and aerodynamic limits are game tuning.

## Handling and cockpit

Aircraft have direct, distinct pitch, roll, and yaw rates, with modest turn drag and fast normal grip. G load is feedback rather than a turn limiter. Low-speed stalls remain possible. Very steep climbs progressively lose useful thrust and drain speed under gravity, so every plane slows and stalls in a vertical climb, even on afterburner. Diving restores airspeed.

The HUD warns before lift loss. A stall causes a sagging flight path, nose drop, and softer controls. Release the pull, lower the nose, level the wings, and add power. Holding a hard pull or prolonged airbraking can keep the plane stalled.

Keep holding Shift after reaching 100% throttle to engage afterburner on equipped fighters. Release Shift to stop boost; full normal throttle stays set. Burner gives extra acceleration, flames, and up to 32% more level-flight top speed, with a modest turn penalty. Space takes priority over boost and lets the nose swing quickly while momentum carries the aircraft forward. Releasing Space quickly regrips the new heading. Ailerons, elevators or fighter stabilators, and rudders are real hinged geometry following the controls. Inboard flaps deploy during drift and partly at low speed.

Each aircraft has its own original, aircraft-inspired 3D cockpit: the F-16 has two green displays and a side stick; the Hornet has a framed windscreen and three displays; the Raptor has a cool-colored integrated panel; the F-35 has a wide panoramic display; the A-10 has an olive armored panel and twin engine gauges; the Mustang and Corsair have round analog instruments; and the Skyhawk has a cream six-pack, radios, an overhead compass, sun visors, and a moving yoke. Gauges, power readouts, attitude displays, and the stick/yoke follow flight state. These are stylized layouts, rather than detailed systems simulations.

The green HUD shows speed, altitude, heading, pitch ladder, bank/G indicators, and a flight-path marker in cockpit and chase views. The marker follows momentum during drift. Settings → Show flight HUD or H toggles the overlay; the physical cockpit remains visible. Its layout adapts for narrow screens and metric units.

Crashes play a burst of faceted fire, rising smoke, and aircraft-colored debris with a synthesized impact sound. The camera pulls back before results appear. Retry clears the pooled effect and cancels any pending results screen. Ceiling violations end the race without an explosion.

## Sound and music

Jets use layered low engine roar, airflow, turbine whine, and an extra exhaust roar on afterburner. Single- and twin-engine aircraft have distinct pitches and mixes. Prop planes use a pulsing piston motor, exhaust, and a rotating prop wash, with different character for the Mustang, Corsair, and Skyhawk. Throttle and airspeed affect the sound smoothly; fast windmilling, turns, and drift change the airflow. Cockpit view is softer and filters the higher frequencies.

An original, slow ambient score uses soft stereo pads and sparse bell notes. It starts after the first click or keypress, stays below the engines, and gets quieter in menus and while paused. Warning and completion sounds briefly lower the music. Settings → **Volume** controls all audio; **Music** controls the background score separately, with a quiet 15% default and 0 for off. Both settings save on this device, and an existing master mute remains muted.

Engine audio fades out on pause, crash, results, and home. Music can continue quietly through those screens. Hidden tabs fade out and suspend audio until you return. The Web Audio graph reuses a fixed set of engine sources across retries and plane changes; scheduled effects and music voices are released when they finish. A gentle output compressor leaves room for warning and impact sounds. Sounds and music are synthesized locally, without external tracks or audio downloads.

## Make it yours

Choose a plane → **Customize**, or open **Pause → Customize**. The live preview switches between Plane and Cockpit views. Choose from six original sticker designs, placed independently on the left wing, right wing, left fuselage, and right fuselage. Projected stickers follow the actual airframe surface, including swept and gull wings. The hangar thumbnails also show your stickers.

Inside, add hanging fuzzy dice, a mini plane, or a tree air freshener in cream, coral, mint, or black. A mountain postcard or lucky duck can sit on the dashboard. A sixteen-character nameplate personalizes the instrument panel. Hanging objects respond to turns, pitch, and air drift, and freeze while paused.

Choices save immediately in localStorage, separately for each aircraft and across maps. **Reset this plane** restores only that aircraft's appearance. Cosmetics leave flight handling, collisions, and leaderboard categories unchanged. The same projected sticker artwork is used on personal ghosts. All sticker art, instrument faces, postcards, and fuzzy dice textures are generated locally in canvas, with no external assets.

## World and scenery

Seeds choose among eight distinct kinds of geography. Broken mountain ranges distribute several chains and saddles across the arena. Island chains separate mountainous islands with open sea and bays. Fjords combine long ridges, steep shores, and water channels. Canyon plateaus scatter broad mesas cut by erosion. Lake basins contain depressed lake floors, high rims, and eroded saddles. Rolling highlands favor lower hills and fast flight. Coastal escarpments put a continuous mainland beside a winding coastline. Volcanic fields spread cones and calderas across lower uplands. There is no compulsory central mountain or requirement that every straight line meet one huge blocker.

Each family varies feature count, spacing, orientation, aspect, and relief. Course lengths vary from 5.8 to 10.5 km, widths vary, and race headings cover the compass. Aircraft launch facing the actual course, and the home camera turns with it. The course preview names the geography and shows its actual land/water layout. Clear launch and finish areas remain available. Island and fjord background fields and the coastline continue outside race bounds for free flight.

Seeded geological fractures branch and reconnect across the landscape, opening irregular crosscuts through ridges, mesas, and crater rims. Basin walls have more unevenly eroded exits. These cuts have varying heights, so a shorter saddle crossing can cost more climbing speed than a longer low route. They are terrain features, not prescribed lanes or checkpoints, and the map leaves racing lines for pilots to discover. An independent 3D search checks 200 seeds for ten separated terrain-clear alternatives each, including several with comparable distance/climb costs; real control recordings separately check race completion and timing differences.

Geography uses compatible palettes from alpine valleys, red rock country, heather highlands, volcanic uplands, golden foothills, limestone country, glacial ranges, and painted desert. Mountains mix craggy summits, long narrow ridges, broad domes, flat-topped mesas, cones, and calderas with depressed centers.

Grass, dry ground, heather, layered rock, sand, and snow blend through continuous climate and altitude fields. Cliffs expose the local geology, and patchy snow follows a seed-specific snowline while steep faces remain rocky. Trees, boulders, and water use matching landscape colors; vegetation and rocks also vary in tint. The course preview uses the same terrain palette. Colors and heights match across chunk borders and shared vertices at different detail settings.

Terrain is not carved around routes. Broad clearings leave room to launch and approach the finish. High peaks can exceed the race ceiling, while climbing over lower peaks costs time and airspeed; lower shoulders and gaps offer shorter, riskier lines while wider detours preserve room and speed. Landmarks scatter over the landscape instead of lining up along passes.

Farm villages contain houses, barns, roofed stone wells, silos, hay bales, orchards, crop rows, and fences. Buildings sit at local terrain heights. Farmland colors are part of the terrain mesh, avoiding overlapping ground planes. Trees avoid steep rock faces and farm plots. Villages use instanced geometry and distance-based detail, with bounded scenery caches.

A glowing sun, gradient sky, clouds, distant bird flocks, radio towers, balloons, and spinning turbines fill the landscape. Terrain streams in Web Workers; distant chunks are discarded and the render origin shifts on long flights. The camera, aircraft, and HUD share an interpolated pose between fixed 120 Hz physics steps. Shadows use a stable texel grid and logarithmic depth improves precision. Propeller blades fade into a translucent disc with soft rotating streaks and a pale tip band at high RPM, including windmilling at high airspeed. Solid blades stay hidden at full speed. The propeller remains visible in cockpit view while the rest of the external airframe is hidden.

The tall artificial rock spikes have been replaced with broad, low boulder outcrops tinted to the local geology. Each stone samples its own terrain footprint and is partly buried, rather than stretched up from a single slope sample. Turbines and radio towers search for gentle, buildable sites with embedded foundations. Turbine placement checks clearance across the full rotor footprint. Solid tapered blades have integrated red tips, with no overlapping tip panels, and the rotor sits ahead of a visible nacelle. Rotating blade, nacelle, foundation, and boulder collisions follow their rendered positions through world-origin shifts.

The world/course layout uses **generator version 9** and handling uses **flight version 4**. Earlier scores and ghosts remain stored under their older version keys, separate from the new terrain cuts and route choices. Maverik retains its separate mission version and existing records.

## Maverik trench run

Enter **Maverik** in Custom map and choose Race. Capitalization does not matter; **Maverick** also selects the same named course and leaderboard. This original layout follows the low trench approach, pop-up over a mountain ridge, valley dive, and steep escape climb inspired by *Top Gun: Maverick*. It is a dedicated mission rather than one of the random geography families. Choose your aircraft normally; the F/A-18 suits the run, and fighters and props can complete it.

The 12.4 km course starts in a winding, steep-walled trench with a **1,000 ft** absolute ceiling. At the trench exit the ceiling rises to **4,000 ft**, giving room to clear the first ridge, descend into the valley, and climb over the escape ridge. The HUD names and points to the current objective, gives its distance, and announces each transition. There are four ordered HUD objectives and **one physical finish ring**, beyond the escape. Passing over the valley without descending does not complete the mission. The active ceiling, warning colors, red ceiling grid, cockpit navigation, metric settings, restart, and replay verifier use the same course state. Free flight explores the same terrain without race limits or objectives.

The canyon is kept clear of tourist balloons, turbines, and farm villages. It retains natural terrain, trees, rocks, and the launch airfield. `generatorVersionFor(seed)` assigns this mission revision **8001**, isolating it from the earlier randomly generated Maverik seed. This separate revision keeps Maverik's records valid when ordinary procedural terrain changes.

## Scores and persistence

`GET /api/daily` returns `{ date, seed, generatorVersion }` using UTC. Shared URLs can set `seed`, `mode` (`race` or `free`), and `aircraft`. The same seed generates the same world, finish, ceiling, and scenery.

Pilot names, settings, personal bests, ghost data, and race history live in localStorage. Bests use `ploon:record:1:<generator>:<flight>:<seed>:<plane>` keys; `ploon:races:1` stores finished and crashed attempts with the pilot name, course, aircraft, elapsed time, distance, splits, controls, and handling versions. Ghosts sample world coordinates, controls, speed, throttle, and burner at 20 Hz. Existing IndexedDB bests migrate to localStorage when loaded, with the original data retained. Storage restrictions or a full quota can prevent saving; the name field and race results report failed writes.

The shared Top 10 uses the Node backend, with one best time per anonymous pilot for each course/plane. The aircraft dropdown to the left of the Top 10 heading defaults to your selected plane and lets you browse all eight aircraft's boards for the same course. Choosing another plane in the hangar resets the dropdown to that plane; automatic or manual refresh keeps the board you are browsing. Browsing changes neither your aircraft nor the personal best/rank beside the course preview, which always belongs to your selected plane. An HttpOnly cookie identifies the browser. Choose a public pilot name above Daily race or in Settings, or leave it blank to use the saved automatic name. Completed races submit control changes; a worker replays the same flight, terrain, obstacles, ceiling, and finish crossing and computes the time. Results show the personal best time and its rank together, with the aircraft named in the ranking message, or a retryable submission error. Each board retains every pilot’s best so positions beyond #10 are available beside the best time while the list still shows only the fastest ten. A faster local time without a matching verified submission is labeled Unranked; failed rank checks leave the local time visible with Rank unavailable. The board refreshes every 30 seconds and has a Refresh button.

`GET /api/leaderboard?seed=…&aircraft=f16` returns the top-ten `entries`, the requesting pilot’s `personal` rank/name/time, and `totalPilots`. `POST /api/leaderboard` submits a versioned recording. Results persist atomically in `data/leaderboards.json`, outside the public directory. `LEADERBOARD_FILE` can point to a persistent volume. The single-server store keeps the 512 most recently updated boards; multiple server instances would need a shared database.

## Verify

```sh
npm test
```

Tests cover terrain determinism and chunk borders in every geography, actual disconnected islands and highland masses, water/land contrast, open ground and independently discovered flight lines across 160 seeds, varied course headings, meaningful route choices, swept finish crossings from either direction, race-only ceilings, village structures and collisions, grounded scenery and rotor alignment, stalls and recovery, render interpolation, propeller blur, crash-particle reuse, unit conversions, replay verification, leaderboard persistence, per-aircraft customization saves, sticker projection and disposal, distinct cockpit layouts, and HTTP routes. Browser QA covers all eight geographies in 3D and in the course preview, high/low detail, launch headings, cockpit starts, verified race submissions, mobile, both unit systems, customization, ceiling warnings, uncapped free flight, and HUD settings.

The server serves `public/` and Three.js build files. Production hosting, HTTPS, and domain configuration are still needed for players to share a public server.
