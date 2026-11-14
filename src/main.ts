import {
    AnimComponentSystem,
    AppBase,
    AppOptions,
    CameraComponentSystem,
    ContainerHandler,
    FILLMODE_FILL_WINDOW,
    LightComponentSystem,
    RESOLUTION_AUTO,
    RenderComponentSystem,
    TextureHandler,
    createGraphicsDevice
} from 'playcanvas';

import { loadModels } from './assets/load';
import { GameAudio } from './audio/game-audio';
import { COLLISIONS, FOOD, SIMULATION } from './config/tuning';
import { cueFor, initialRumble, musicTempo, tickRumble } from './core/audio/director';
import { BuildingIndex } from './core/camera';
import { generateCity } from './core/city/generate';
import type { Screen } from './core/flow';
import { isSimulating, nextScreen, tapAction } from './core/flow';
import { Game } from './core/game';
import { parseLaunchParams } from './core/params';
import { FixedStepper } from './core/sim/fixed-step';
import { mountCityDebugMap } from './debug/city-map';
import { PlayerDebug } from './debug/player-debug';
import { BennyView } from './game/benny-view';
import { FOOD_MODELS, FoodView } from './game/food-view';
import { addBenny } from './game/greybox';
import { Juice } from './game/juice';
import { KioskView } from './game/kiosk-view';
import { PopupView } from './game/popup-view';
import { VEHICLE_MODELS, VehicleView } from './game/vehicle-view';
import type { MenuAction } from './input/keyboard';
import { KeyboardInput, MenuKeys } from './input/keyboard';
import { combineDirections, TouchInput } from './input/touch';
import { createGameCamera } from './render/camera';
import { CameraRig } from './render/camera-rig';
import { CityView } from './render/city-view';
import { addSunlight } from './render/lighting';
import { touchDevice, touchOnlyDevice } from './ui/device';
import { floatText } from './ui/float-text';
import { showGameOver } from './ui/game-over';
import { recordHighScore } from './ui/high-score-store';
import { Hud } from './ui/hud';
import { showRelief } from './ui/relief-pop';
import { loadMuted, saveMuted, Screens } from './ui/screens';
import { ToiletIndicators } from './ui/toilet-indicators';
import { TouchControls } from './ui/touch-controls';
import { WaitRing } from './ui/wait-ring';

import './ui/style.css';

const canvas = document.getElementById('application-canvas') as HTMLCanvasElement;

const device = await createGraphicsDevice(canvas);
device.maxPixelRatio = Math.min(window.devicePixelRatio, 2);

// Only the systems and handlers the game uses (AGENTS.md, PlayCanvas engine conventions)
const createOptions = new AppOptions();
createOptions.graphicsDevice = device;
createOptions.componentSystems = [
    RenderComponentSystem,
    CameraComponentSystem,
    LightComponentSystem,
    AnimComponentSystem
];
// GLB models (container assets) and their textures, from the art pass
createOptions.resourceHandlers = [ContainerHandler, TextureHandler];

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

// The models of the art pass so far; anything without one keeps its greybox stand-in
const models = await loadModels(app, [
    'char.benny',
    'toilet.cabin',
    ...VEHICLE_MODELS.car,
    ...VEHICLE_MODELS.bus,
    ...Object.values(FOOD_MODELS)
]);

addSunlight(app);
const cityView = new CityView(app, city);
const bennyView = new BennyView(addBenny(app, models.get('char.benny')));
const kioskView = new KioskView(app, city, models.get('toilet.cabin'));
const popupView = new PopupView(app, models.get('toilet.cabin'));
const foodView = new FoodView(app, models);
const vehicleView = new VehicleView(app, models);
const juice = new Juice(app);
const camera = createGameCamera(app);
const cameraRig = new CameraRig(camera, cityView, new BuildingIndex(city.buildings));

const hud = new Hud(document.body);
const waitRing = new WaitRing(document.body);
const indicators = new ToiletIndicators(document.body);
const playerDebug = params.debug ? new PlayerDebug(mountCityDebugMap(document.body, city), game) : null;

// Screens: the title before the run, pause, game over. The simulation only runs while the run is on screen. On a phone
// or a tablet they speak of taps instead of keys.
const touchOnly = touchOnlyDevice();
const screens = new Screens(document.body, touchOnly);
let screen: Screen = 'title';
let muted = loadMuted();
screens.show(screen);
screens.showMuted(muted);
// Sound starts with the first key press or tap (browser autoplay rules); M or the mute button mutes it
const audio = new GameAudio(window, muted);
let rumble = initialRumble();
const goTo = (next: Screen | 'restart') => {
    if (next === 'restart') {
        // A new run: the same city with ?seed, a new one otherwise
        window.location.reload();
        return;
    }
    screen = next;
    screens.show(screen);
    // The music stops or starts with the screen at once, not at the next frame (frames can be slow)
    audio.setMusic(isSimulating(screen) && game.phase !== 'over', musicTempo(game.urgency));
};
let touchControls: TouchControls | null = null;
const onMenuAction = (action: MenuAction) => {
    if (action === 'mute') {
        muted = !muted;
        saveMuted(muted);
        screens.showMuted(muted);
        touchControls?.showMuted(muted);
        audio.setMuted(muted);
    } else {
        goTo(nextScreen(screen, action));
    }
};
const menuKeys = new MenuKeys(window, onMenuAction);
// A touchscreen gets the pause and mute buttons; a finger steers during the run and taps through the other screens
if (touchDevice()) {
    touchControls = new TouchControls(document.body, onMenuAction);
    touchControls.showMuted(muted);
}
const touch = new TouchInput(
    window,
    () => isSimulating(screen),
    () => {
        const action = tapAction(screen);
        if (action) {
            onMenuAction(action);
        }
    }
);
// Leaving the page (alt-tab, another tab) pauses the run
const onAway = () => goTo(nextScreen(screen, 'away'));
const onVisibility = () => {
    if (document.hidden) {
        onAway();
    }
};
window.addEventListener('blur', onAway);
document.addEventListener('visibilitychange', onVisibility);

// Fixed-step simulation; rendering interpolates between the last two steps
const input = new KeyboardInput(window);
const stepper = new FixedStepper(game.stepSeconds, SIMULATION.maxStepsPerFrame);
const onUpdate = (dt: number) => {
    const steps = isSimulating(screen) ? stepper.advance(dt) : 0;
    for (let i = 0; i < steps; i++) {
        game.step(combineDirections(input.direction(), touch.direction()));
    }
    if (steps > 0) {
        const tummy = tickRumble(rumble, game.urgency, game.phase === 'playing', steps * game.stepSeconds);
        rumble = tummy.state;
        if (tummy.rumble) {
            audio.play('rumble');
        }
    }
    for (const honk of game.drainHonks()) {
        floatText(document.body, camera.camera!, honk.x, honk.z, 'Honk!', 'bad');
    }
    for (const gain of game.drainGains()) {
        floatText(document.body, camera.camera!, gain.x, gain.z, `+${gain.points}`, 'good');
    }
    for (const bite of game.drainEaten()) {
        juice.onBite(bite);
        bennyView.bite();
        if (bite.kind.category === 'vegetable') {
            const seconds = FOOD.vegetables[bite.kind.id].countdownPenaltySeconds;
            floatText(document.body, camera.camera!, bite.x, bite.z, `-${seconds} s`, 'bad');
        }
    }
    for (const event of game.drainEvents()) {
        const cue = cueFor(event);
        if (cue) {
            audio.play(cue);
        }
        juice.onEvent(event, game);
        if (event === 'knocked') {
            const shock = COLLISIONS.shockCountdownPenaltySeconds;
            floatText(document.body, camera.camera!, game.player.x, game.player.z, `-${shock} s`, 'bad');
        }
        if (event === 'reliefStart') {
            showRelief(document.body);
        }
        if (event === 'gameOver') {
            goTo('over');
            const record = recordHighScore(game.score.points);
            showGameOver(document.body, { score: game.score.points, ...record }, touchOnly);
        }
    }
    audio.setMusic(isSimulating(screen) && game.phase !== 'over', musicTempo(game.urgency));
    juice.update(game);
    bennyView.update(game, stepper.alpha);
    const position = bennyView.entity.getPosition();
    cameraRig.update(game, { x: position.x, z: position.z }, dt, juice.shake(game));
    kioskView.update(game);
    popupView.update(game);
    foodView.update(game);
    vehicleView.update(game);
    hud.update(game);
    waitRing.update(game, camera.camera!);
    indicators.update(game, camera.camera!);
    touchControls?.update(touch.stick(), screen);
    playerDebug?.update(game);
};
app.on('update', onUpdate);
onUpdate(0);
app.on('destroy', () => {
    input.dispose();
    touch.dispose();
    menuKeys.dispose();
    audio.dispose();
    window.removeEventListener('blur', onAway);
    document.removeEventListener('visibilitychange', onVisibility);
});
