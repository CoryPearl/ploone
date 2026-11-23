import * as THREE from 'three';
import { AIRCRAFT, getAircraft, supportsAfterburner } from './core/aircraft-data.js';
import { createWorld, CHUNK_SIZE } from './core/world.js';
import { dailyChallenge, normalizeSeed, generatorVersionFor, FLIGHT_VERSION } from './core/seed.js';
import { createFlight, stepFlight, FIXED_DT } from './core/flight.js';
import { toggleLandingGear, landingProfile, LANDING_FAILURES } from './core/landing.js';
import { generateCourse, createRace, stepRace, enforceRaceRules, formatTime, sampleGhost, raceTarget, raceCeiling } from './core/race.js';
import { loadSettings, saveSettings, getRecord, saveRecord, pilotDisplayName, saveRaceResult } from './core/storage.js';
import { createRecording, recordControls } from './core/recording.js';
import { unitsFor, heightValue, formatDistance, formatSpeed, travelValue } from './core/units.js';
import { Leaderboard } from './leaderboard.js';
import { bestStanding } from './core/standings.js';
import { createAircraft, animateAircraft, setCockpitAirframe, disposeAircraft } from './render/aircraft.js';
import { Terrain } from './render/terrain.js';
import { createClouds, createAirfield, FinishRing } from './render/scenery.js';
import { Atmosphere, HORIZON_COLOR } from './render/atmosphere.js';
import { configureSunShadow, updateSunShadow } from './render/sun-shadow.js';
import { FlightPose } from './render/flight-pose.js';
import { LandmarkField } from './core/landmarks.js';
import { LandmarkRenderer } from './render/landmarks.js';
import { FlightDisplay } from './render/flight-display.js';
import { CrashEffect } from './render/crash-effect.js';
import { CeilingGrid } from './render/ceiling-grid.js';
import { Cockpit } from './render/cockpit.js';
import { applyAircraftCustomization } from './render/aircraft-customization.js';
import { customizationFor, normalizeCustomization } from './core/customization.js';
import { Customizer } from './customizer.js';
import { Input } from './input.js';
import { FlightAudio } from './audio.js';

const $ = id => document.getElementById(id);
const settings = loadSettings();
let renderer, scene, camera, terrain, clouds, airfield, gates, sunlight;
let atmosphere,landmarkField,landmarkRenderer,flightDisplay,crashEffect,ceilingGrid,cockpit,customizer,customizeReturn;
let world, course, flight, race, aircraftModel, ghostModel, record = null, samples = [];
let selected = getAircraft(settings.aircraft), seed, mode = 'race', state = 'menu', activeModal = null, lastFocus;
let origin = new THREE.Vector3(), accumulator = 0, countdownTime = 0, cameraMode = 0, sampleTimer = 0;
let lastTime = 0, elapsed = 0, lastHud = 0, session = 0, ready = false, sessionReady = false, toastTimer, noticeTimer, thumbnailsReady = false;
let daily = dailyChallenge(), shared = null;
let recording = createRecording(), completedRun = null;
let resultTimer, lastStallAlert = -10;
const leaderboard = new Leaderboard(() => ({ seed: shared?.seed || daily.seed, aircraft: selected.id, name: selected.name, shared: !!shared }));
const audio = new FlightAudio();
const viewPosition = new THREE.Vector3(), desiredCamera = new THREE.Vector3(), desiredTarget = new THREE.Vector3(), cameraTarget = new THREE.Vector3();
const forward = new THREE.Vector3(), up = new THREE.Vector3(), projected = new THREE.Vector3();
const ghostA = new THREE.Quaternion(), ghostB = new THREE.Quaternion();
const input = new Input(onAction); input.settings = settings;
const flightPose = new FlightPose(), displayFlight = {};

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
}
function notice(message, milliseconds = 2200) {
  $('flight-notice').textContent = message; clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('flight-notice').textContent = ''; }, milliseconds);
}
function showModal(id) {
  if (activeModal) $(activeModal).hidden = true;
  lastFocus = document.activeElement;
  activeModal = id; $('modal-backdrop').hidden = false; $(id).hidden = false;
  $('menu').inert = true; $('header').inert = true; $('hud').inert = true; input.clear();
  requestAnimationFrame(() => $(id).querySelector('button, input, select')?.focus({ preventScroll: true }));
}
function closeModal() {
  if (!activeModal) return;
  const closing=activeModal;
  $(activeModal).hidden = true; activeModal = null; $('modal-backdrop').hidden = true;
  $('menu').inert = false; $('header').inert = false; $('hud').inert = false;
  if (lastFocus?.isConnected && !lastFocus.closest('[hidden]')) lastFocus.focus({ preventScroll: true });
  // Flight hotkeys should work immediately after a button-triggered transition.
  if (state === 'flying' || state === 'countdown') document.activeElement?.blur();
  if(['settings','help'].includes(closing)&&state==='paused')showModal('pause-modal');
  if(closing==='customize'&&['menu','paused'].includes(state)){
    showModal(customizeReturn||'hangar');if(customizeReturn==='hangar'){renderThumbnails();updateHangar();}
  }
}
function onAction(action) {
  if (!ready) return;
  if (state === 'menu' && !activeModal) {
    if (action === 'play') { startFlight(shared?.seed || daily.seed, shared?.mode || 'race'); return; }
    if (action === 'seed') { $('seed-button').click(); return; }
  }
  if (action === 'blur') { if (['flying', 'countdown'].includes(state)) pause(); return; }
  if (action === 'pause') {
    if (activeModal) {
      if (activeModal === 'pause-modal') resume();
      else if (!['result-modal'].includes(activeModal)) closeModal();
    } else if (['flying', 'countdown'].includes(state)) pause();
    return;
  }
  if (activeModal || !['flying', 'countdown'].includes(state)) return;
  if (action === 'restart') startFlight(seed, mode);
  if (action === 'camera') { cameraMode = (cameraMode + 1) % 2; updateCameraButton(); }
  if (action === 'instruments') { settings.instruments = !settings.instruments; saveSettings(settings); syncSettings(); }
  if (action === 'gearOrGhost') {
    if (mode === 'free') {
      const result = toggleLandingGear(flight);
      notice(result === 'fixed' ? 'Fixed landing gear · always down' : result === 'grounded' ? 'Keep the gear down on the ground' : `Landing gear ${result === 'down' ? 'lowering' : 'retracting'}`, 1800);
      updateHud();
    } else { settings.ghost = !settings.ghost; saveSettings(settings); notice(settings.ghost ? 'Ghost on' : 'Ghost off', 1200); syncSettings(); }
  }
}
let pausedFrom = 'flying';
function pause() { pausedFrom = state; state = 'paused'; showModal('pause-modal'); }
function resume() { state = pausedFrom; closeModal(); input.clear(); }
function updateCameraButton() {
  $('camera-label').textContent = cameraMode ? 'Chase view' : 'Cockpit view';
  $('camera-button').setAttribute('aria-label', `Switch to ${cameraMode ? 'chase' : 'cockpit'} view`);
}

function setupScene() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: $('world'), antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  } catch {
    $('unsupported').hidden = false; $('loading').hidden = true; return false;
  }
  renderer.setClearColor('#c5d6cc'); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene(); scene.background = new THREE.Color(HORIZON_COLOR); scene.fog = new THREE.Fog(HORIZON_COLOR, 1800, 6000);
  camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 1, 12000);
  scene.add(camera); cockpit = new Cockpit(camera);
  flightDisplay = new FlightDisplay($('flight-display'), $('cockpit-shell'), $('hud'));
  scene.add(new THREE.HemisphereLight('#fff5df', '#7e8b64', 2.5));
  sunlight = new THREE.DirectionalLight('#fff0ca', 3.1); sunlight.position.set(-800, 1400, 600); sunlight.castShadow = true;
  scene.add(sunlight); scene.add(sunlight.target);
  clouds = createClouds(scene); gates = new FinishRing(scene);
  atmosphere=new Atmosphere(scene);landmarkRenderer=new LandmarkRenderer(scene);
  crashEffect = new CrashEffect(scene);
  ceilingGrid = new CeilingGrid(scene);
  applyQuality(); window.addEventListener('resize', resize); resize();
  $('world').addEventListener('webglcontextlost', event => {
    event.preventDefault(); if (['flying', 'countdown'].includes(state)) pause();
    $('unsupported-message').textContent = 'The graphics connection was interrupted. Reload this page to return to the flight club. Your saved records are safe.';
    $('unsupported').hidden = false;
  });
  return true;
}
function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
function applyQuality() {
  if (!renderer) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, settings.quality === 'high' ? 1.75 : settings.quality === 'medium' ? 1.25 : 1));
  renderer.shadowMap.enabled = settings.quality !== 'low';
  configureSunShadow(sunlight, settings.quality);
  if (terrain) terrain.setQuality(settings.quality);
  if (scene.fog) {
    // Wider burner FOV must still fade the terrain before the streaming boundary.
    const radius = settings.quality === 'low' ? 3 : settings.quality === 'medium' ? 4 : 5;
    scene.fog.far = radius * CHUNK_SIZE - 150; scene.fog.near = scene.fog.far * 0.45;
  }
}
function setWorld(value) {
  crashEffect.reset();
  seed = normalizeSeed(value); world = createWorld(seed); course = generateCourse(world);
  landmarkField=new LandmarkField(world,course);landmarkRenderer.setField(landmarkField);
  if (!terrain) terrain = new Terrain(scene, seed, settings.quality); else terrain.reset(seed);
  gates.dispose(); gates.setCourse(course);
  if (airfield) {
    scene.remove(airfield); const geometries = new Set(), materials = new Set();
    airfield.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
    geometries.forEach(geo => geo.dispose()); materials.forEach(mat => mat.dispose());
  }
  airfield = createAirfield(world, scene);
  origin.set(0, 0, 0); terrain.setOrigin(origin); cameraTarget.set(0, 0, 0);
  flight = createFlight(selected, course.spawn); race = createRace(course);
  flightPose.reset(flight);
  renderMapPreview();
}
function setAircraft(plane) {
  selected = plane; settings.aircraft = selected.id; saveSettings(settings);
  if (aircraftModel) { scene.remove(aircraftModel); disposeAircraft(aircraftModel); }
  if (ghostModel) { scene.remove(ghostModel); disposeAircraft(ghostModel); }
  aircraftModel = createAircraft(selected); ghostModel = createAircraft(selected, true); ghostModel.visible = false;
  const appearance=customizationFor(settings,selected);
  applyAircraftCustomization(aircraftModel,appearance);applyAircraftCustomization(ghostModel,appearance,{ghost:true});
  cockpit.setAircraft(selected,appearance);
  scene.add(aircraftModel); scene.add(ghostModel);
  if (flight) flight.aircraft = selected;
  $('plane-name').textContent = selected.name; $('plane-full-name').textContent = selected.fullName;
  $('hud-aircraft').textContent = selected.name;
  updateHangar(); leaderboard.refresh();
}
function updateHangar() {
  document.querySelectorAll('.aircraft-card').forEach(button => {
    const active = button.dataset.aircraft === selected.id; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    button.querySelector('.card-check').hidden = !active;
  });
  $('hangar-name').textContent = `${selected.name} · ${selected.fullName}`;
  $('hangar-description').textContent = `${selected.type === 'jet' ? 'Jet' : 'Prop'} · ${formatSpeed(selected.maxSpeed, settings.units)}${supportsAfterburner(selected) ? ' · Afterburner' : ''}`;
  $('stat-speed').style.width = `${selected.speedRating}%`; $('stat-agility').style.width = `${selected.agility}%`;
}
function createHangar() {
  for (const aircraft of AIRCRAFT) {
    const button = document.createElement('button'); button.className = 'aircraft-card'; button.dataset.aircraft = aircraft.id;
    button.innerHTML = `<span class="card-type">${aircraft.type.toUpperCase()}</span><span class="card-check" hidden>✓</span><img alt="${aircraft.name} aircraft" width="220" height="110"><strong>${aircraft.name}</strong><small>${aircraft.fullName}</small>`;
    button.addEventListener('click', () => setAircraft(aircraft)); $('aircraft-grid').append(button);
  }
}
function renderThumbnails() {
  if (thumbnailsReady) return;
  let preview;
  try {
    preview = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); preview.setSize(400, 200); preview.setPixelRatio(1);
    preview.outputColorSpace = THREE.SRGBColorSpace; preview.toneMapping = THREE.ACESFilmicToneMapping; preview.toneMappingExposure = 1.2;
    const thumbnailScene = new THREE.Scene(); thumbnailScene.add(new THREE.HemisphereLight('#fff8e5', '#788b67', 3));
    const light = new THREE.DirectionalLight('#fff4d6', 3); light.position.set(-10, 20, 10); thumbnailScene.add(light);
    const view = new THREE.OrthographicCamera(-13, 13, 6.5, -6.5, 0.1, 200); view.position.set(19, 15, 22); view.lookAt(0, 0, 0);
    AIRCRAFT.forEach(aircraft => {
      const model = createAircraft(aircraft); applyAircraftCustomization(model,customizationFor(settings,aircraft)); thumbnailScene.add(model);
      // Fit each true-size airframe, including the wide A-10 and tall Skyhawk gear.
      // Hidden afterburner flames are deliberately excluded from this framing.
      const bounds = model.userData.airframeBounds, center = bounds.getCenter(new THREE.Vector3());
      view.position.copy(center).add(new THREE.Vector3(19, 15, 22)); view.lookAt(center); view.updateMatrixWorld(true);
      let halfWidth = 0, halfHeight = 0;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z).applyMatrix4(view.matrixWorldInverse);
        halfWidth = Math.max(halfWidth, Math.abs(point.x)); halfHeight = Math.max(halfHeight, Math.abs(point.y));
      }
      const framing = Math.max(halfHeight, halfWidth / 2) * 1.12;
      view.left = -framing * 2; view.right = framing * 2; view.top = framing; view.bottom = -framing; view.updateProjectionMatrix();
      preview.render(thumbnailScene, view);
      document.querySelector(`[data-aircraft="${aircraft.id}"] img`).src = preview.domElement.toDataURL('image/png');
      thumbnailScene.remove(model); disposeAircraft(model);
    });
    thumbnailsReady = true;
  } catch { toast('Aircraft previews are unavailable on this device.'); }
  finally { preview?.dispose(); preview?.forceContextLoss(); }
}

async function startFlight(nextSeed, nextMode) {
  clearTimeout(resultTimer); crashEffect.reset(); lastStallAlert = -10;
  const token = ++session;
  sessionReady = false; record = null;
  state = 'preparing'; closeModal(); input.clear(); clearTimeout(noticeTimer); $('flight-notice').textContent = '';
  const cleanSeed = normalizeSeed(nextSeed); if (seed !== cleanSeed) setWorld(cleanSeed);
  mode = nextMode === 'free' ? 'free' : 'race';
  flight = createFlight(selected, course.spawn, { landingEnabled: mode === 'free' }); race = createRace(course); samples = []; sampleTimer = 0; accumulator = 0; countdownTime = 3;
  flightPose.reset(flight);
  recording = createRecording(); completedRun = null;
  ghostModel.visible = false; cameraMode = 0; updateCameraButton();
  $('header').hidden = true; $('menu').hidden = true; $('hud').hidden = false; document.body.classList.add('playing');
  $('hud-mode').textContent = mode === 'free' ? 'Free flight' : course.mission ? 'Maverik run' : seed === daily.seed ? 'Daily race' : 'Custom race';
  $('race-clock').hidden = mode === 'free'; $('hud-split').textContent = '';
  $('countdown').hidden = false; $('countdown').querySelector('span').textContent = '…'; $('countdown').querySelector('small').textContent = 'Loading map';
  document.activeElement?.blur(); audio.volume = settings.volume; audio.start();
  const url = new URL(location.href); url.search = new URLSearchParams({ seed, mode, aircraft: selected.id }); history.replaceState(null, '', url);
  record = mode === 'race' ? await getRecord(seed, selected.id) : null;
  if (token !== session) return;
  sessionReady = true;
  camera.position.copy(flight.position).sub(origin).add(new THREE.Vector3(0, 14, 46)); cameraTarget.copy(flight.position).sub(origin);
  // Preparing remains active until the nearby terrain is in memory.
  updateHud();
}
function returnHome() {
  clearTimeout(resultTimer); crashEffect.reset();
  session++; state = 'menu'; closeModal(); input.clear(); $('hud').hidden = true; $('countdown').hidden = true; $('gate-guide').hidden = true;
  $('header').hidden = false; $('menu').hidden = false; document.body.classList.remove('playing');
  shared = null; updateDailyCard(); if (seed !== daily.seed) setWorld(daily.seed);
  flight = createFlight(selected, course.spawn); race = createRace(course); ghostModel.visible = false;
  flightPose.reset(flight);
  history.replaceState(null, '', location.pathname); cameraTarget.copy(flight.position).sub(origin); camera.position.copy(flight.position).sub(origin).add(new THREE.Vector3(32, 17, 35));
}
function ghostSample() {
  const { pitch, roll, yaw, drift } = flight.controls;
  return [flight.elapsed, ...flight.position.toArray(), ...flight.quaternion.toArray(), flight.burner, pitch, roll, yaw, Number(drift), flight.speed, flight.throttle];
}
async function endFlight(crashed) {
  const token = session;
  state = crashed ? 'crashed' : 'finished'; $('gate-guide').hidden = true; $('countdown').hidden = true; input.clear();
  if (!crashed) { samples.push(ghostSample()); audio.chime(true); }
  const obstacleHit=flight.crashReason==='obstacle',ceilingHit=flight.crashReason==='ceiling';
  $('result-title').textContent = crashed ? ceilingHit ? 'Ceiling exceeded' : obstacleHit ? 'Collision' : 'Crashed' : 'Flight complete';
  const isBest = !crashed && (!record || flight.elapsed < record.time);
  $('result-copy').textContent = crashed ? 'Try again and give the ground more room.' : isBest ? 'New personal best.' : 'Race complete.';
  if(crashed&&obstacleHit)$('result-copy').textContent=`You hit a ${flight.obstacle}.`;
  if (crashed && LANDING_FAILURES[flight.crashReason]) $('result-copy').textContent = LANDING_FAILURES[flight.crashReason];
  if (ceilingHit) $('result-copy').textContent = `Stay below ${formatDistance(flight.ceilingLimit??course.ceiling, settings.units)} in races. Free flight has no ceiling.`;
  $('result-stats').replaceChildren();
  const stats = crashed ? [[travelValue(flight.distance, settings.units), `${unitsFor(settings.units).travel} flown`], [formatTime(flight.elapsed), 'Flight time']] : [[formatTime(flight.elapsed), 'Your time'], [formatTime(Math.min(flight.elapsed, record?.time ?? Infinity)), isBest ? 'New personal best' : 'Personal best']];
  for (const [index, [value, label]] of stats.entries()) {
    const item = document.createElement('div'), strong = document.createElement('strong'), span = document.createElement('span'); strong.textContent = value; span.textContent = label;
    if (!crashed && index === 1) {
      const row = document.createElement('div'), badge = document.createElement('span'); row.className = 'best-standing';
      strong.id = 'result-best-time'; badge.id = 'result-rank'; badge.className = 'rank-badge'; badge.textContent = '…';
      row.append(strong, badge); item.append(row, span);
    } else item.append(strong, span);
    $('result-stats').append(item);
  }
  if (crashed && !ceilingHit) {
    const impact = flight.position.clone();
    if (flight.crashReason === 'terrain' || flight.crashReason === 'water') impact.y = Math.max(impact.y, world.height(impact.x, impact.z) + 4, 4);
    crashEffect.trigger(impact, flight.velocity, selected.color, flight.crashReason === 'water', `${seed}:crash:${flight.elapsed}`);
    audio.crash(); cameraMode = 0; $('hud').hidden = true;
    resultTimer = setTimeout(() => { if (session === token && state === 'crashed') showModal('result-modal'); }, 1350);
  } else { if (ceilingHit) $('hud').hidden = true; showModal('result-modal'); }
  $('result-ranking').hidden = crashed || mode !== 'race';
  const pilotName = pilotDisplayName(settings);
  const historySaved = mode !== 'race' || saveRaceResult({ seed, aircraft: selected.id, pilotName,
    status: crashed ? 'crashed' : 'finished', time: flight.elapsed, splits: [...race.splits], distance: flight.distance,
    crashReason: flight.crashReason || null, ticks: recording.ticks, commands: recording.commands });
  if (!historySaved) $('result-copy').textContent = 'Couldn’t save this run. Check site storage.';
  if (!crashed && mode === 'race') {
    completedRun = recording.valid ? { seed, aircraft: selected.id, ticks: recording.ticks, commands: recording.commands, generatorVersion: generatorVersionFor(seed), flightVersion: FLIGHT_VERSION, name: pilotName } : null;
    if (completedRun) submitCompletedRace(completedRun, token);
    else { $('result-leaderboard').textContent = 'This recording is too long to submit.'; $('result-submit').hidden = true; $('result-rank').textContent = 'Unranked'; }
    const result = await saveRecord(seed, selected.id, flight.elapsed, race.splits, samples, pilotName);
    if (session !== token) return;
    if (result === null) $('result-copy').textContent = 'Couldn’t save this run. Check site storage.';
  }
}
async function submitCompletedRace(run, token) {
  $('result-submit').hidden = true; $('result-leaderboard').textContent = 'Checking your race…';
  $('result-rank').textContent = '…'; $('result-rank').classList.remove('is-ranked');
  try {
    const result = await leaderboard.submit(run);
    if (session !== token) return;
    const planeName = getAircraft(run.aircraft).name;
    const standing = bestStanding({ time: Math.min(flight.elapsed, record?.time ?? Infinity) }, { time: result.bestTime, rank: result.rank });
    $('result-best-time').textContent = formatTime(standing.time);
    $('result-rank').textContent = standing.label; $('result-rank').classList.toggle('is-ranked', standing.rank !== null);
    $('result-rank').title = `${planeName} leaderboard for this course`;
    $('result-leaderboard').textContent = `Your shared best is #${result.rank} on the ${planeName} leaderboard${result.rank <= 10 ? ' · Top 10.' : '.'}`;
  } catch (error) {
    if (session !== token) return;
    $('result-rank').textContent = 'Rank unavailable';
    $('result-leaderboard').textContent = error.name === 'TimeoutError' || error instanceof TypeError ? 'Couldn’t submit this time. Try again.' : error.message;
    $('result-submit').hidden = false;
  }
}

function updateDailyCard() {
  $('daily-date').textContent = shared ? 'Shared' : new Date(`${daily.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  $('launch-label').textContent = shared ? 'Fly shared map' : 'Daily race';
  $('course-label').textContent = shared ? 'Shared map' : "Today's course";
  leaderboard.refresh();
}
function renderMapPreview() {
  const canvas = $('map-preview'), context = canvas.getContext('2d');
  $('course-ceiling').textContent = courseCeilingText();
  $('course-landscape').textContent = world.region.layout.name;
  canvas.setAttribute('aria-label', `${world.region.layout.name}: open terrain with a start and a single finish`);
  if (!context) return;
  const { minX, maxX, minZ, maxZ } = course.bounds;
  const width = 160, height = 125, image = context.createImageData(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const wx = minX + x / width * (maxX - minX), wz = minZ + y / height * (maxZ - minZ), h = world.height(wx, wz);
    const nearby = world.height(wx + 40, wz + 40), shade = Math.max(0.65, Math.min(1.2, 1 + (h - nearby) / 100));
    const color = (h <= 0 ? world.style.palette.water : world.color(wx, wz, h, Math.abs(h - nearby) / 57)).map(channel => channel * 255);
    const contour = h > 0 && Math.floor(h / 45) !== Math.floor(nearby / 45) ? 0.91 : 1;
    const i = (y * width + x) * 4;
    image.data[i] = color[0] * shade * contour; image.data[i + 1] = color[1] * shade * contour; image.data[i + 2] = color[2] * shade * contour; image.data[i + 3] = 255;
  }
  const buffer = document.createElement('canvas'); buffer.width = width; buffer.height = height; buffer.getContext('2d').putImageData(image, 0, 0);
  context.imageSmoothingEnabled = true; context.drawImage(buffer, 0, 0, canvas.width, canvas.height);
  const map = p => [(p.x - minX) / (maxX - minX) * canvas.width, (p.z - minZ) / (maxZ - minZ) * canvas.height];
  for(const obstacle of landmarkField.courseItems.filter(item=>item.overview)) {
    const [x,y]=map(obstacle);context.beginPath();context.moveTo(x,y-7);context.lineTo(x+6,y+5);context.lineTo(x-6,y+5);context.closePath();
    context.fillStyle='#bc6a43';context.fill();context.strokeStyle='#fff3d4';context.lineWidth=2;context.stroke();
  }
  const [sx, sy] = map(course.spawn); context.beginPath(); context.arc(sx, sy, 12, 0, Math.PI * 2); context.fillStyle = '#f06f4f'; context.fill(); context.strokeStyle = '#fff5dd'; context.lineWidth = 5; context.stroke();
  const [fx, fy] = map(course.finish);
  context.strokeStyle = '#fff5dd'; context.lineWidth = 4; context.beginPath(); context.moveTo(fx, fy + 12); context.lineTo(fx, fy - 25); context.stroke();
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) { context.fillStyle = (x + y) % 2 ? '#3a4438' : '#fff5dd'; context.fillRect(fx + x * 6, fy - 25 + y * 6, 6, 6); }
}
function courseCeilingText() {
  return course.mission ? `Ceiling ${formatDistance(course.mission.trenchCeiling,settings.units)} → ${formatDistance(course.ceiling,settings.units)}` : `Ceiling ${formatDistance(course.ceiling,settings.units)}`;
}
function syncSettings() {
  $('volume-setting').value = settings.volume; $('sensitivity-setting').value = settings.sensitivity;
  $('musicVolume-setting').value = settings.musicVolume;
  $('invert-setting').checked = settings.invert; $('ghost-setting').checked = settings.ghost; $('quality-setting').value = settings.quality;
  $('instruments-setting').checked = settings.instruments;
  for (const id of ['pilot-name', 'pilot-name-setting']) {
    $(id).value = settings.pilotName || ''; $(id).placeholder = settings.automaticName;
  }
  $('units-setting').value = settings.units === 'metric' ? 'metric' : 'imperial';
  const measure = unitsFor(settings.units);
  $('hud-speed-unit').textContent = measure.speed; $('hud-altitude-unit').textContent = `altitude · ${measure.length}`;
  $('cockpit-clearance-label').textContent = `AGL · ${measure.length}`; $('cockpit-climb-label').textContent = `Climb · ${measure.climb}`;
  $('flight-display').setAttribute('aria-label', `Green flight display: speed in ${measure.speed}, altitude in ${measure.length}, heading, pitch, and flight path.`);
  if (course) $('course-ceiling').textContent = courseCeilingText();
  updateHangar();
  $('free-note').textContent = 'No ceiling';
  audio.volume = settings.volume;
  audio.musicVolume = settings.musicVolume;
}
function openCustomization(parent) {
  customizeReturn=parent;
  if(!customizer)customizer=new Customizer(value=>{
    const appearance=normalizeCustomization(value);
    if(JSON.stringify(customizationFor(settings,selected).stickers)!==JSON.stringify(appearance.stickers))thumbnailsReady=false;
    settings.customizations[selected.id]=appearance;
    const saved=saveSettings(settings);
    setCockpitAirframe(aircraftModel,false);
    applyAircraftCustomization(aircraftModel,appearance);applyAircraftCustomization(ghostModel,appearance,{ghost:true});
    setCockpitAirframe(aircraftModel,state!=='menu'&&cameraMode===1);
    cockpit.setAppearance(appearance);return saved;
  });
  showModal('customize');customizer.open(selected,customizationFor(settings,selected),settings.units);
}
function connectUI() {
  createHangar(); syncSettings();
  const unlockAudio=()=>audio.start();
  window.addEventListener('pointerdown',unlockAudio,{once:true});window.addEventListener('keydown',unlockAudio,{once:true});
  $('pilot-save-status').textContent = saveSettings(settings) ? 'Saved on this device.' : 'Couldn’t save on this device.';
  $('daily-button').onclick = () => startFlight(shared?.seed || daily.seed, shared?.mode || 'race');
  $('free-button').onclick = () => startFlight(shared?.seed || daily.seed, 'free');
  $('hangar-button').onclick = () => { showModal('hangar'); renderThumbnails(); updateHangar(); };
  $('select-aircraft').onclick = closeModal;
  $('customize-aircraft').onclick = () => openCustomization('hangar');
  $('pause-customize').onclick = () => openCustomization('pause-modal');
  $('settings-button').onclick = () => showModal('settings'); $('help-button').onclick = () => showModal('help');
  $('seed-button').onclick = () => { $('seed-input').value = ''; showModal('seed-modal'); requestAnimationFrame(() => $('seed-input').focus()); };
  $('random-seed').onclick = () => { const words = ['sunday', 'cloud', 'paper', 'sunset', 'wild', 'little']; $('seed-input').value = `${words[Math.floor(Math.random() * words.length)]}-skies-${Math.floor(Math.random() * 10000)}`; };
  $('seed-form').onsubmit = event => { event.preventDefault(); startFlight($('seed-input').value, new FormData(event.target).get('seed-mode')); };
  for (const name of ['volume', 'musicVolume', 'sensitivity', 'invert', 'ghost', 'quality', 'instruments', 'units']) {
    $(`${name}-setting`).addEventListener('input', event => {
      settings[name] = ['invert', 'ghost', 'instruments'].includes(name) ? event.target.checked : ['quality','units'].includes(name) ? event.target.value : Number(event.target.value);
      saveSettings(settings); syncSettings(); if (name === 'quality') applyQuality();
    });
  }
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = closeModal);
  $('modal-backdrop').onclick = event => { if (event.target === $('modal-backdrop') && !['pause-modal', 'result-modal'].includes(activeModal)) closeModal(); };
  $('pause-button').onclick = pause; $('resume-button').onclick = resume;
  $('camera-button').onclick = () => { onAction('camera'); document.activeElement?.blur(); };
  $('gear-button').onclick = () => { onAction('gearOrGhost'); document.activeElement?.blur(); };
  $('result-submit').onclick = () => { if (completedRun) submitCompletedRace(completedRun, session); };
  for (const id of ['pilot-name', 'pilot-name-setting']) {
    $(id).addEventListener('input', event => {
      settings.pilotName = event.target.value;
      const saved = saveSettings(settings);
      for (const other of ['pilot-name', 'pilot-name-setting']) if (other !== id) $(other).value = settings.pilotName;
      $('pilot-save-status').textContent = saved ? 'Saved on this device.' : 'Couldn’t save on this device.';
    });
  }
  $('pause-settings').onclick=()=>showModal('settings');
  $('pause-help').onclick=()=>showModal('help');
  $('retry-button').onclick = $('result-retry').onclick = () => startFlight(seed, mode);
  $('home-button').onclick = $('result-home').onclick = returnHome;
  $('share-button').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); toast('Link copied.'); }
    catch { toast('Copy the browser address to share.'); }
  };
  document.addEventListener('keydown', event => {
    if (event.code === 'KeyR' && ['paused', 'finished', 'crashed'].includes(state) && !event.target.closest('input, select, textarea')) {
      event.preventDefault(); startFlight(seed, mode); return;
    }
    if (!activeModal) return;
    if (event.code === 'Escape') { event.preventDefault(); if (activeModal === 'pause-modal') resume(); else if (activeModal !== 'result-modal') closeModal(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...$(activeModal).querySelectorAll('button, input, select, [tabindex="0"]')].filter(element => !element.disabled);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  document.addEventListener('visibilitychange', () => { audio.setHidden(document.hidden);if (document.hidden && ['flying', 'countdown'].includes(state)) pause(); });
}

function updateHud() {
  $('gear-button').hidden = mode !== 'free';
  const fixedGear = landingProfile(selected).fixed, movingGear = Math.abs(flight.gear - Number(flight.gearDown)) > .02;
  $('gear-label').textContent = flight.grounded ? (flight.speed < .7 ? 'Landed' : 'Ground roll') : fixedGear ? 'Gear fixed' : `Gear ${movingGear ? (flight.gearDown ? 'lowering…' : 'retracting…') : flight.gearDown ? 'down' : 'up'}`;
  $('gear-button').setAttribute('aria-pressed', String(flight.gearDown));
  $('gear-button').title = `Landing gear · G. Touch down below ${formatSpeed(landingProfile(selected).maxSpeed, settings.units)} with wings level and a gentle descent. Space brakes on the ground; Shift adds power and S lifts off.`;
  $('landing-info').hidden = mode !== 'free';
  const landingLimit = landingProfile(selected).maxSpeed;
  const fastApproach = !flight.grounded && flight.gearDown && flight.speed > landingLimit && flight.position.y - Math.max(0, world.height(flight.position.x, flight.position.z)) < 120;
  $('landing-info').classList.toggle('unsafe-landing', fastApproach);
  $('landing-info').textContent = flight.grounded ? 'Space: brakes · Shift + S: take off' : movingGear ? 'Wait for the gear to lock' : flight.gearDown ? `${fastApproach ? 'Too fast · ' : 'Landing · '}below ${formatSpeed(landingLimit, settings.units)} · wings level` : 'G: lower gear to land';
  $('hud-timer').textContent = formatTime(flight.elapsed); $('hud-speed').textContent = String(Math.round(flight.speed * unitsFor(settings.units).speedFactor));
  $('hud-altitude').textContent = heightValue(flight.position.y, settings.units);
  $('hud-throttle').replaceChildren(document.createTextNode(String(Math.round(flight.throttle * 100))), Object.assign(document.createElement('span'), { textContent: '%' }));
  $('throttle-fill').style.width = `${flight.throttle * 100}%`;
  $('burner-chip').hidden = !supportsAfterburner(selected) || (!flight.afterburner && flight.burner < 0.05);
  $('drift-chip').hidden = !flight.drifting;
  const ceilingWarning = mode === 'race' && flight.ceilingWarning;
  const ceiling = raceCeiling(course,flight.position);
  $('hud').classList.toggle('ceiling-warning', !!ceilingWarning);
  $('stall-status').hidden = !flight.stallWarning && !ceilingWarning;
  $('stall-status').classList.toggle('stalled', flight.stalled);
  $('hud').classList.toggle('stall-warning', flight.stallWarning || ceilingWarning);
  $('stall-title').textContent = ceilingWarning ? 'Ceiling · descend now' : flight.stalled ? 'Stall' : flight.loadFactor > 1.5 ? 'High G · losing airspeed' : 'Low airspeed';
  $('stall-detail').textContent = ceilingWarning ? `${flight.stalled ? 'Stall · ' : ''}Lower the nose · limit ${formatDistance(ceiling, settings.units)}` : flight.stalled ? 'Lower the nose · level wings · add power' : 'Ease the turn and keep your speed';
  $('hud-ceiling').hidden = mode !== 'race';
  $('hud-ceiling').textContent = ceilingWarning ? `${formatDistance(Math.max(0, ceiling - flight.position.y), settings.units)} to ceiling` : `Ceiling ${formatDistance(ceiling, settings.units)}`;
  if (mode === 'race') {
    const finish = raceTarget(race);
    const distance = Math.hypot(finish.x - flight.position.x, finish.y - flight.position.y, finish.z - flight.position.z);
    $('hud-gates').textContent = formatDistance(distance, settings.units);
    $('hud-target-distance').textContent = `to ${finish.label?.toLowerCase()||'finish'}`;
  } else {
    $('hud-gates').textContent = `${travelValue(flight.distance, settings.units)} ${unitsFor(settings.units).travel}`; $('hud-target-distance').textContent = 'Distance flown';
  }
}
function updateGateGuide() {
  const guide = $('gate-guide');
  if (mode !== 'race' || !['flying', 'countdown'].includes(state) || race.finished) { guide.hidden = true; return; }
  const finish = raceTarget(race);
  projected.set(finish.x - origin.x, finish.y - origin.y, finish.z - origin.z).project(camera);
  const behind = projected.z > 1;
  const offscreen = behind || Math.abs(projected.x) > .82 || Math.abs(projected.y) > .64;
  let x = (behind ? -1 : 1) * projected.x, y = (behind ? -1 : 1) * projected.y;
  if (offscreen) {
    const scale = Math.min(.82 / Math.max(.001, Math.abs(x)), .64 / Math.max(.001, Math.abs(y)));
    x *= scale; y *= scale;
  }
  guide.hidden = false; guide.classList.toggle('destination-pin', !offscreen);
  guide.style.left = `${Math.max(78, Math.min(innerWidth - 78, (50 + x * 50) / 100 * innerWidth))}px`; guide.style.top = `${Math.max(90, Math.min(innerHeight - 100, (50 - y * 50) / 100 * innerHeight))}px`;
  guide.querySelector('span').textContent = offscreen ? '↑' : '◎';
  guide.querySelector('span').style.transform = offscreen ? `rotate(${Math.atan2(x, y || .001)}rad)` : '';
  const distance = Math.hypot(finish.x - flight.position.x, finish.y - flight.position.y, finish.z - flight.position.z);
  guide.querySelector('small').textContent = `${finish.label||'Finish'} · ${formatDistance(distance, settings.units)}`;
}

function simulate(dt) {
  if (state === 'preparing') {
    if (terrain.ready && sessionReady) { state = 'countdown'; countdownTime = 3; $('countdown').querySelector('small').textContent = 'Ready'; }
    return;
  }
  if (state === 'countdown') {
    countdownTime -= dt; $('countdown').querySelector('span').textContent = countdownTime > 0 ? String(Math.ceil(countdownTime)) : 'Go';
    if (countdownTime <= 0) {
      state = 'flying'; $('countdown').hidden = true;
      if (mode === 'race') notice(course.mission ? `Follow the trench · Stay below ${formatDistance(course.mission.trenchCeiling,settings.units)} until the exit.` : 'Find your own path to the finish ring.', 4000);
      else notice('Free flight · no altitude ceiling.', 2200);
    }
    return;
  }
  if (state !== 'flying') return;
  accumulator += dt;
  while (accumulator >= FIXED_DT && state === 'flying') {
    const controls = input.state();
    if (mode === 'race') recordControls(recording, controls);
    flightPose.capture(flight);
    const touchdowns = flight.touchdowns;
    stepFlight(flight, controls, FIXED_DT, world);
    if (flight.touchdowns > touchdowns) notice('Touchdown · Space to brake · Shift for power, S to take off', 4500);
    if (mode === 'race') enforceRaceRules(flight, course);
    if (flight.stallWarning && flight.elapsed - lastStallAlert > (flight.stalled ? 1.2 : 2.4)) { audio.alert(); lastStallAlert = flight.elapsed; }
    if(!flight.crashed) {
      const obstacle=landmarkField.collision(flight.previous,flight.position,flight.elapsed);
      if(obstacle){flight.crashed=true;flight.crashReason='obstacle';flight.obstacle=obstacle.label;}

    }
    if (flight.crashed) { endFlight(true); accumulator = 0; break; }
    if (mode === 'race') {
      sampleTimer += FIXED_DT;
      if (sampleTimer >= 0.05 || !samples.length) { sampleTimer %= 0.05; samples.push(ghostSample()); }
      if (stepRace(race, flight.previous, flight.position, flight.elapsed)) {
        if (race.finished) { endFlight(false); accumulator = 0; break; }
        audio.chime();
        if (course.mission) notice(raceTarget(race).instruction||'Escape complete · Reach the finish ring.',4000);
      }
    }
    accumulator -= FIXED_DT;
  }
}

function render(dt) {
  if (!flight) return;
  const menu = state === 'menu', crashed = state === 'crashed' && flight.crashReason !== 'ceiling';
  const interpolate = state === 'flying' || state === 'paused' && pausedFrom === 'flying';
  const pose = flightPose.sample(flight, interpolate ? accumulator / FIXED_DT : 1);
  const position = pose.position;
  setCockpitAirframe(aircraftModel,!menu&&cameraMode===1);
  if (position.distanceTo(origin) > 7000) {
    const old = origin.clone(); origin.set(Math.round(position.x / 1000) * 1000, Math.round(position.y / 1000) * 1000, Math.round(position.z / 1000) * 1000);
    const shift = origin.clone().sub(old); camera.position.sub(shift); cameraTarget.sub(shift); terrain.setOrigin(origin);
  }
  viewPosition.copy(position).sub(origin);
  aircraftModel.position.copy(viewPosition);
  if (menu) {
    aircraftModel.position.y += Math.sin(elapsed * 0.8) * 0.22;
    aircraftModel.rotation.set(-0.045 + Math.sin(elapsed * 0.55) * 0.01, course.spawn.heading - .28 + Math.sin(elapsed * 0.18) * 0.12, -0.11 + Math.sin(elapsed * 0.45) * 0.025);
    const narrow = innerWidth < 900;
    const orbit = Math.sin(elapsed * 0.07) * 2;
    desiredCamera.copy(viewPosition).add(new THREE.Vector3(narrow ? 28 : 24 + orbit, 12, 26).applyAxisAngle(THREE.Object3D.DEFAULT_UP, course.spawn.heading));
    // Look to the left of the aircraft so it sits in the open right-hand half of the screen.
    desiredTarget.copy(viewPosition).add(new THREE.Vector3(narrow ? -4 : -9, 0, narrow ? -2 : 5).applyAxisAngle(THREE.Object3D.DEFAULT_UP, course.spawn.heading));
    camera.fov = 42; aircraftModel.visible = true;
  } else if (crashed) {
    aircraftModel.visible = false;
    forward.set(-pose.travelDirection.x, 0, -pose.travelDirection.z);
    if (forward.lengthSq() < .00001) forward.set(0, 0, 1);
    desiredCamera.copy(viewPosition).addScaledVector(forward.normalize(), 60).add(new THREE.Vector3(0, 36, 0));
    desiredCamera.y = Math.max(desiredCamera.y, world.height(desiredCamera.x + origin.x, desiredCamera.z + origin.z) + 20 - origin.y);
    desiredTarget.copy(viewPosition).add(new THREE.Vector3(0, 6, 0)); camera.fov = 56;
  } else {
    aircraftModel.quaternion.copy(pose.quaternion); aircraftModel.visible = cameraMode === 0 || !!aircraftModel.userData.propeller;
    forward.set(0, 0, -1).applyQuaternion(pose.quaternion); up.set(0, 1, 0).applyQuaternion(pose.quaternion);
    if (cameraMode === 0) {
      desiredCamera.copy(viewPosition).addScaledVector(pose.travelDirection, -43 - pose.burner * 7).add(new THREE.Vector3(0, 12, 0));
      desiredTarget.copy(viewPosition).addScaledVector(pose.travelDirection, 80).addScaledVector(up, 2);
      camera.fov = 52 + pose.speed / selected.maxSpeed * 9 + pose.burner * 6;
    } else {
      desiredCamera.copy(viewPosition).addScaledVector(forward, selected.type === 'jet' ? 1.8 : 1.1).addScaledVector(up, 1.4);
      desiredTarget.copy(desiredCamera).addScaledVector(forward, 150); camera.fov = 68;
    }
  }
  const smooth = 1 - Math.exp(-dt * (menu ? 2 : cameraMode ? 30 : 8));
  camera.position.lerp(desiredCamera, smooth); cameraTarget.lerp(desiredTarget, smooth);
  camera.up.lerp(cameraMode && !menu ? up : new THREE.Vector3(0, 1, 0), smooth).normalize();
  camera.near=!menu&&cameraMode===1?.05:1;
  camera.lookAt(cameraTarget); camera.updateProjectionMatrix();
  const worldTime = menu ? elapsed : pose.elapsed;
  atmosphere.update(camera,position,origin,worldTime);
  landmarkRenderer.update(position,origin,worldTime,settings.quality);
  crashEffect.update(dt, origin);
  const activeCeiling=raceCeiling(course,position);
  ceilingGrid.update(position, origin, activeCeiling, mode === 'race' && ['flying', 'paused'].includes(state), pose.velocity.y,course.mission&&activeCeiling===course.mission.trenchCeiling?80:220);
  const animationDt = menu || state === 'flying' ? dt : 0;
  animateAircraft(aircraftModel, selected, pose.throttle, worldTime, animationDt, menu ? 0 : pose.burner, pose.speed, menu ? {} : { ...flight.controls, gear: pose.gear });
  terrain.update(position); gates.update(origin, !menu && mode === 'race');
  clouds.position.copy(origin).negate();
  clouds.children.forEach(cloud => {
    const home = cloud.userData.home;
    cloud.position.x = home.x + Math.round((position.x - home.x) / 11000) * 11000;
    cloud.position.z = home.z + Math.round((position.z - home.z) / 11000) * 11000;
  });
  airfield.position.copy(airfield.userData.world).sub(origin);
  updateSunShadow(sunlight, position, origin);
  ghostModel.visible = false;
  if (mode === 'race' && !menu && settings.ghost && record?.samples && ['flying', 'paused'].includes(state)) {
    const sample = sampleGhost(record.samples, pose.elapsed);
    if (sample) {
      ghostModel.position.fromArray(sample.position).sub(origin);
      // Overlapping ghost surfaces flicker and can fill the cockpit camera.
      ghostModel.visible = ghostModel.position.distanceTo(viewPosition) > 28;
      ghostA.fromArray(sample.a); ghostB.fromArray(sample.b); ghostModel.quaternion.copy(ghostA).slerp(ghostB, sample.t);
      animateAircraft(ghostModel, selected, sample.throttle, worldTime, animationDt, sample.burner, sample.speed ?? selected.cruise, sample.controls);
    }
  }
  const target = mode === 'race' && !race.finished ? raceTarget(race) : null;
  Object.assign(displayFlight, flight, { position, quaternion: pose.quaternion, travelDirection: pose.travelDirection, velocity: pose.velocity, speed: pose.speed, throttle: pose.throttle, elapsed: pose.elapsed, burner: pose.burner });
  cockpit.update(displayFlight,animationDt,{visible:!menu&&!flight.crashed&&cameraMode===1,aspect:camera.aspect,units:settings.units});
  updateGateGuide(); audio.update(displayFlight, state === 'flying',{cockpit:cameraMode===1,mode:state});
  renderer.render(scene, camera);
  if(activeModal==='customize')customizer?.render(dt);
  flightDisplay.update(displayFlight, camera, world, origin, {
    visible: !menu && !crashed, cockpit: cameraMode === 1, enabled: settings.instruments, units: settings.units,
    ceilingWarning: mode === 'race' && !!flight.ceilingWarning,
    target: target ? projected.set(target.x, target.y, target.z) : null
  });
}
function frame(milliseconds) {
  requestAnimationFrame(frame);
  const now = milliseconds / 1000, dt = Math.min(lastTime ? now - lastTime : 1 / 60, 0.075); lastTime = now; elapsed += dt;
  input.enabled = ['flying', 'countdown'].includes(state);
  simulate(dt); render(dt);
  if (now - lastHud > 0.08 && state !== 'menu') { updateHud(); lastHud = now; }
  if (!ready && terrain.ready) {
    ready = true; $('loading').classList.add('loaded'); setTimeout(() => { $('loading').hidden = true; }, 550);
    if (shared) toast('Shared map ready.');
  }
}

async function init() {
  if (!setupScene()) return;
  connectUI();
  try { const response = await fetch('/api/daily', { signal: AbortSignal.timeout(4000) }); if (response.ok) daily = await response.json(); } catch { /* UTC derivation matches the server when offline. */ }
  const params = new URLSearchParams(location.search);
  if (params.has('seed')) shared = { seed: normalizeSeed(params.get('seed')), mode: params.get('mode') === 'free' ? 'free' : 'race' };
  selected = getAircraft(params.get('aircraft') || settings.aircraft);
  setWorld(shared?.seed || daily.seed); setAircraft(selected); updateDailyCard();
  camera.position.copy(flight.position).add(new THREE.Vector3(28, 15, 32)); cameraTarget.copy(flight.position).add(new THREE.Vector3(-12, 0, 5));
  camera.lookAt(cameraTarget); requestAnimationFrame(frame);
  // Refresh the menu's daily challenge after a UTC rollover without interrupting a flight.
  setInterval(async () => {
    const next = dailyChallenge();
    if (next.date !== daily.date && state === 'menu' && !activeModal && !shared) { daily = next; setWorld(daily.seed); updateDailyCard(); toast('New daily course.'); }
    else if (state === 'menu' && !activeModal) leaderboard.refresh();
  }, 30000);
}

init().catch(error => {
  console.error(error); $('loading').hidden = true; $('unsupported').hidden = false;
  $('unsupported-message').textContent = 'Couldn’t load the game. Check your connection and reload.';
});

// Read-only telemetry for browser QA and performance profiling. No game-state mutations.
export function diagnostics() {
  return {
    state, seed, mode, aircraft: selected.id, elapsed: flight?.elapsed, speed: flight?.speed,
    stalled: flight?.stalled, stallAmount: flight?.stallAmount, stallWarning: flight?.stallWarning, stallSpeed: flight?.stallSpeed, angleOfAttack: flight?.angleOfAttack, loadFactor: flight?.loadFactor,
    explosion: crashEffect ? { active: crashEffect.active, age: crashEffect.age, particles: crashEffect.particles.filter(particle => particle.mesh.visible).length } : null,
    throttle: flight?.throttle, controls: { ...flight?.controls },
    landing: flight ? { enabled:flight.landingEnabled, gear:flight.gear, down:flight.gearDown, grounded:flight.grounded, touchdowns:flight.touchdowns, maxSpeed:landingProfile(selected).maxSpeed, visible:aircraftModel?.userData.landingGear?.visible, extension:aircraftModel?.userData.landingGear?.userData.extension } : null,
    controlSurfaces: aircraftModel?.userData.controlSurfaces.map(({role,side,deflection})=>({role,side,deflection})),
    afterburner: flight?.afterburner, burner: flight?.burner, drifting: flight?.drifting, slipAngle: flight?.slipAngle, velocity: flight?.velocity.toArray(),
    exhaustVisible: aircraftModel?.userData.exhaust?.visible || false,
    propeller: aircraftModel?.userData.propellerParts ? {
      bladesVisible: aircraftModel.userData.propellerParts.bladeGroups.some(blade => blade.visible),
      visible: aircraftModel.visible && aircraftModel.userData.propeller.visible,
      blurVisible: aircraftModel.userData.propellerBlur.visible, blurOpacity: aircraftModel.userData.propellerBlur.material.opacity
    } : null,
    presentation: { position: flightPose.position.toArray(), quaternion: flightPose.quaternion.toArray(), elapsed: flightPose.elapsed, cameraPosition: camera?.position.toArray() },
    position: flight?.position.toArray(), quaternion: flight?.quaternion.toArray(),
    target: race?raceTarget(race):course?.finish, finish:course?.finish, bounds: course?.bounds, ceiling: course?.ceiling, activeCeiling:course&&flight?raceCeiling(course,flight.position):null,camera: cameraMode,
    mission:course?.mission?{index:race.objectiveIndex,total:course.mission.objectives.length,label:raceTarget(race).label||'Finish'}:null,
    customization:customizationFor(settings,selected),stickers:aircraftModel?.userData.stickers?.children.map(sticker=>({slot:sticker.name,design:sticker.userData.design})),
    cockpit:{visible:cockpit?.group.visible,aircraft:cockpit?.data?.id,layout:cockpit?.spec?.layout,hanging:cockpit?.appearance?.hanging,dashboard:cockpit?.appearance?.dashboard,sway:cockpit?.hanging?.rotation.toArray()},
    ceilingGrid: { visible: ceilingGrid?.mesh.visible, opacity: ceilingGrid?.material.uniforms.opacity.value, position: ceilingGrid?.mesh.position.toArray() },
    terrain: { chunks: terrain?.chunks.size, pending: terrain?.pending.size, radius: terrain?.radius, origin: origin.toArray(), style: world?.style.id, layout: world?.region.layout.id, layoutName: world?.region.layout.name, landforms: [...new Set(world?.region.mountains.map(peak => peak.form))] },
    rendering: renderer ? { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, calls: renderer.info.render.calls, logarithmicDepth: renderer.capabilities.logarithmicDepthBuffer } : null,
    audio:audio.diagnostics(),
    ghostVisible: ghostModel?.visible, ghostSamples: record?.samples?.length || 0,
    scenery:{objects:landmarkRenderer?.objects.size,cache:landmarkField?.cache.size,obstacles:landmarkField?.nearby(flight.position).map(item=>({...item}))},

    crashReason:flight?.crashReason,obstacle:flight?.obstacle
  };
}
