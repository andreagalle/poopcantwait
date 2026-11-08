import {
    AppBase,
    AppOptions,
    CameraComponentSystem,
    FILLMODE_FILL_WINDOW,
    LightComponentSystem,
    RESOLUTION_AUTO,
    RenderComponentSystem,
    createGraphicsDevice
} from 'playcanvas';

import { CAMERA } from './config/tuning';
import { generateCity } from './core/city/generate';
import { parseLaunchParams } from './core/params';
import { mountCityDebugMap } from './debug/city-map';
import { addBennyStandIn } from './game/greybox';
import { createGameCamera, placeCamera } from './render/camera';
import { buildCityView } from './render/city-view';
import { addSunlight } from './render/lighting';

import './ui/style.css';

const canvas = document.getElementById('application-canvas') as HTMLCanvasElement;

const device = await createGraphicsDevice(canvas);
device.maxPixelRatio = Math.min(window.devicePixelRatio, 2);

// Only the systems and handlers the game uses (AGENTS.md, PlayCanvas engine conventions)
const createOptions = new AppOptions();
createOptions.graphicsDevice = device;
createOptions.componentSystems = [RenderComponentSystem, CameraComponentSystem, LightComponentSystem];
createOptions.resourceHandlers = [];

const app = new AppBase(canvas);
app.init(createOptions);
// One directional sun lights the city, so the clustered light path only costs time: about 4x slower frames in
// software rendering (the e2e tests) and on weak GPUs. Beacons and glows use emissive materials, not lights.
app.scene.clusteredLightingEnabled = false;
app.start();

// Fill the window and keep the resolution in step with the canvas size
app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
app.setCanvasResolution(RESOLUTION_AUTO);
const resize = () => app.resizeCanvas();
window.addEventListener('resize', resize);
app.on('destroy', () => {
    window.removeEventListener('resize', resize);
});

// The run: a seeded city (?seed=<n> fixes it), Benny at the spawn point, the camera at the design angle
const params = parseLaunchParams(window.location.search);
const seed = params.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
const city = generateCity(seed);

addSunlight(app);
buildCityView(app, city);
const benny = addBennyStandIn(app);
benny.setPosition(city.spawn.x, 0, city.spawn.z);
const camera = createGameCamera(app);
placeCamera(camera, benny.getPosition(), CAMERA.distance.slimMetres);

if (params.debug) {
    mountCityDebugMap(document.body, city);
}
