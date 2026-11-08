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

import { SIMULATION } from './config/tuning';
import { BuildingIndex } from './core/camera';
import { generateCity } from './core/city/generate';
import { Game } from './core/game';
import { parseLaunchParams } from './core/params';
import { FixedStepper } from './core/sim/fixed-step';
import { mountCityDebugMap } from './debug/city-map';
import { PlayerDebug } from './debug/player-debug';
import { BennyView } from './game/benny-view';
import { addBennyStandIn } from './game/greybox';
import { KioskView } from './game/kiosk-view';
import { PopupView } from './game/popup-view';
import { KeyboardInput } from './input/keyboard';
import { createGameCamera } from './render/camera';
import { CameraRig } from './render/camera-rig';
import { CityView } from './render/city-view';
import { addSunlight } from './render/lighting';
import { showGameOver } from './ui/game-over';
import { Hud } from './ui/hud';
import { showRelief } from './ui/relief-pop';
import { WaitRing } from './ui/wait-ring';

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

// The run: a seeded city (?seed=<n> fixes it), Benny at the spawn point (?weight=<0..1> sets his starting weight)
const params = parseLaunchParams(window.location.search);
const seed = params.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
const city = generateCity(seed);
const game = new Game(city, {
    weight: params.weight ?? 0,
    countdownSeconds: params.countdownSeconds ?? undefined
});

addSunlight(app);
const cityView = new CityView(app, city);
const bennyView = new BennyView(addBennyStandIn(app));
const kioskView = new KioskView(app, city);
const popupView = new PopupView(app);
const camera = createGameCamera(app);
const cameraRig = new CameraRig(camera, cityView, new BuildingIndex(city.buildings));

const hud = new Hud(document.body);
const waitRing = new WaitRing(document.body);
const playerDebug = params.debug ? new PlayerDebug(mountCityDebugMap(document.body, city), game) : null;

// Fixed-step simulation; rendering interpolates between the last two steps
const input = new KeyboardInput(window);
const stepper = new FixedStepper(game.stepSeconds, SIMULATION.maxStepsPerFrame);
const onUpdate = (dt: number) => {
    const steps = stepper.advance(dt);
    for (let i = 0; i < steps; i++) {
        game.step(input.direction());
    }
    for (const event of game.drainEvents()) {
        if (event === 'reliefStart') {
            showRelief(document.body);
        }
        if (event === 'gameOver') {
            // A new run: the same city with ?seed, a new one otherwise
            showGameOver(document.body, () => window.location.reload());
        }
    }
    bennyView.update(game, stepper.alpha);
    const position = bennyView.entity.getPosition();
    cameraRig.update(game, { x: position.x, z: position.z }, dt);
    kioskView.update(game);
    popupView.update(game);
    hud.update(game);
    waitRing.update(game, camera.camera!);
    playerDebug?.update(game);
};
app.on('update', onUpdate);
onUpdate(0);
app.on('destroy', () => input.dispose());
