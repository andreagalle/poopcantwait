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
import { addBennyStandIn, addGround } from './game/greybox';
import { createGameCamera, placeCamera } from './render/camera';
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
app.start();

// Fill the window and keep the resolution in step with the canvas size
app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
app.setCanvasResolution(RESOLUTION_AUTO);
const resize = () => app.resizeCanvas();
window.addEventListener('resize', resize);
app.on('destroy', () => {
    window.removeEventListener('resize', resize);
});

// Greybox scene for milestone M0: the ground, Benny's stand-in, the sun and the camera at the design angle
addSunlight(app);
addGround(app);
const benny = addBennyStandIn(app);
const camera = createGameCamera(app);
placeCamera(camera, benny.getPosition(), CAMERA.distance.slimMetres);
