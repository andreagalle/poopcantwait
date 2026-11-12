# Gotta Go! — Game Design

Source of truth for gameplay. Numbers marked _initial_ are starting points for `src/config/tuning.ts`; tune them by
playtesting and keep this document in sync.

## Pitch

Benny, a plush toy man with a very urgent problem, races through a toy-like city to reach a free public toilet before
the countdown runs out. Junk food scattered on the streets is irresistible: it scores points but makes him fatter,
slower and wider, until alleys, then whole streets, are too narrow for him. Vegetables are the enemy: they shorten the
countdown. Cars and buses speed through the streets; at first they send Benny flying, but once he is big enough they
crumple against his belly. Five pairs of underpants are his five lives.

The tone is slapstick cartoon and family-friendly: the "accident" is never shown, only implied with a stink cloud, a
shiver and a stained icon in the HUD.

## Core loop

1. Read the city: which toilets are free (green beacon) and which ones Benny can still reach at his current size.
2. Run there with the arrow keys, grabbing junk food on the way and dodging vegetables and traffic.
3. Reach a free toilet: relief, bonus points, countdown reset.
4. Bigger Benny means more points and crushed cars, but slower runs and fewer usable streets. Pop-up toilets appear
   more often as he grows, which keeps the game winnable and the routes changing.

The run ends when all five pairs of underpants are soiled. The score is the total points.

## The protagonist: Benny

An original character. Do not base him on, or let him resemble, any existing character.

- A life-size plush toy man about 1.6 m tall, pear-shaped, with a soft round belly and no visible neck.
- Warm peach felt "skin" with visible stitched seams; short, stubby arms and legs.
- Large round cartoon eyes with felt pupils, a small round nose, a wide worried grin.
- A messy tuft of orange yarn hair on top of his head.
- Sky-blue tank top, mint-green boxer shorts with a small yellow banana print, mismatched sneakers (one red, one
  purple). The boxer shorts are also the life icon in the HUD.
- Personality in motion: frantic waddling run, nervous jiggle when idle, knees together and shivering when the
  countdown is low.

Animations: idle, run, low-urgency run (clenched waddle), eat (quick chomp), enter toilet, relief exit, knocked over,
belly bounce (crushing a vehicle), accident (freeze and shiver). A procedural squash-and-stretch layer on top of the
clips gives the plush feel and can stand in for any clip that is not available.

## Controls

- On a computer, gameplay uses **only the arrow keys**. Up moves up the screen, and so on; two keys together move
  diagonally (eight directions). The camera never rotates, so the mapping is always screen-relative.
- Movement has acceleration and deceleration that worsen with weight (a heavy Benny takes time to start and stop).
  Benny turns to face his direction of travel. _Initial_: 30 m/s² acceleration and 40 m/s² braking when slim (scaled
  by `1 - 0.6 * w`, see below), turning at 720° per second.
- Collision is a circle of Benny's girth against the buildings, kiosks, fountain, trees and the city edge; he slides
  along walls. A street narrower than his diameter simply does not let him in.
- Menus only: Enter or Space to start and confirm, Escape or P to pause, M to mute.
- The page must not scroll when arrow keys are pressed.
- On a touchscreen, a finger anywhere on the screen is a floating stick: the drag from where it landed picks the
  nearest of the same eight directions, so Benny moves exactly as with the keys. Only the first finger steers; lifting
  it stops him. A circle and a knob show the stick under the finger. _Initial_: a 14 px dead zone, so a resting thumb
  does not walk him, and a 56 px stick radius, beyond which the stick's centre follows the finger (turning back is
  quick).
- On a touchscreen a tap starts the run, goes on from pause and plays again after a game over, like Enter; the finger
  that was steering when a run ends does not count as a tap. Two round buttons in the bottom right corner mute (always)
  and pause (during the run). Mouse clicks do nothing, so a computer plays with the keys as before.
- On a touch-only device (only coarse pointers: a phone, or a tablet without a mouse) the screens speak of dragging and
  tapping instead of keys. A keyboard plugged into it still works.

## Camera

- Perspective camera above and behind Benny, looking down at about 55 degrees, 45-degree vertical field of view.
- It follows Benny with damping and a small look-ahead in his direction of travel.
- It pulls back as Benny grows: _initial_ 18 m away when slim, 40 m when at maximum weight, so the player always sees
  enough of the streets around him.
- Buildings between the camera and Benny fade to about 25% opacity so he is never hidden.
- _Initial_ rig values: the camera closes the gap to its target at a rate of 5 per second (exponential smoothing), aims
  0.4 s ahead of Benny's velocity but no more than 3 m ahead, and moves to a new distance at a rate of 1.5 per second;
  the distance grows linearly with weight between the two values above. A building fades when a line of sight from the
  camera to Benny's middle, top or sides passes within 0.5 m of it.

## The city

Procedurally generated from a seed for each run (`?seed=<n>` fixes it). _Initial_ size 320 m by 320 m, surrounded by a
park and river edge that blocks the way out.

### Street classes

Width is the walkable width between building fronts, sidewalks included.

| Class     | Width (initial) | Traffic        | Layout                                                   |
| --------- | --------------- | -------------- | -------------------------------------------------------- |
| Alley     | 2 m             | none           | Cuts through about half the blocks, connects two streets |
| Street    | 6 m             | cars           | Grid roughly every 40 m                                  |
| Avenue    | 12 m            | cars and buses | Roughly every 80 m                                       |
| Boulevard | 20 m            | cars and buses | One or two across the city in each direction             |

Generation rules:

- Avenues and boulevards form a connected network that reaches every part of the city, so a Benny at maximum size can
  always move around.
- Every street connects to the avenue network at both ends; alleys connect streets.
- Blocks hold buildings of varied heights and colors, with a few landmarks for orientation (a central plaza with a
  fountain, a park, a tall clock tower).
- The navigation grid (for reachability and path distances) is computed per street class, so "can Benny reach this
  point at his current girth?" is a fast lookup.

How the generator meets them (`src/core/city/`):

- A perimeter ring avenue runs just inside the park and river edge. Avenues and boulevards run from edge to edge, so
  they always form one network.
- Streets run in spans from one avenue or boulevard to the next, so both of their ends meet the network. A few spans
  are left out, which merges two blocks into a bigger one.
- An alley crosses its block straight from one road to the opposite one. Buildings fill the rest of each block without
  gaps, so roads, alleys, the plaza and the park are the only ways through.
- The plaza is the block nearest the centre, with the fountain in its middle; Benny starts in the plaza, south of the
  fountain. The clock tower is the building nearest the plaza. The park is one of the larger blocks far from the plaza,
  planted with trees.
- Every edge lies on whole metres, and the navigation grid has 1 m cells, so the clearance (distance to the nearest
  wall) is exact: Benny of diameter `d` fits wherever the clearance is greater than `d / 2`.

_Initial_ generation parameters:

| Parameter                         | Value                                     |
| --------------------------------- | ----------------------------------------- |
| Avenue and boulevard jitter       | up to 8 m from even spacing               |
| Street jitter                     | up to 4 m from even spacing               |
| Street spans kept                 | 85%                                       |
| Narrowest block side              | 16 m                                      |
| Alley distance from block corners | at least 6 m                              |
| Lot width along the street        | 8 to 16 m                                 |
| Blocks with two rows of buildings | at least 24 m deep                        |
| Building height                   | 4 to 12 m; the clock tower 24 m           |
| Fountain radius                   | 3 m                                       |
| Park trees                        | every 9 m, trunk radius 0.8 m, 3 m margin |
| River sides                       | 1 or 2 (the others are parkland)          |

## Weight, girth and speed

Weight `w` goes from 0 (slim) to 1 (maximum). Junk food adds weight; nothing removes it during a run.

_Initial_ formulas, all in `tuning.ts`:

- Diameter of Benny's collision circle: `d(w) = 0.9 + 6.6 * w^1.3` metres (0.9 m slim, 7.5 m at maximum).
- Top speed: `v(w) = 7.0 * (1 - 0.7 * w^0.8)` m/s (7 m/s slim, 2.1 m/s at maximum).
- Acceleration and deceleration scale with `1 - 0.6 * w`.
- Visual size: the model widens in X and Z with the diameter ratio and grows in height up to two times, so a heavy
  Benny becomes a towering ball rather than a pancake.

If Benny grows too wide for where he stands (an alley, a narrow street), he is squeezed out along the passage to the
nearest spot where he fits. Benny fits a street when `d(w)` is smaller than its width. With the initial numbers that gives these tiers, shown in
the HUD:

| Tier    | Weight      | Fits through                 | Traffic                               |
| ------- | ----------- | ---------------------------- | ------------------------------------- |
| Slim    | 0 to 0.25   | everything                   | cars and buses knock him over         |
| Chubby  | 0.25 to 0.5 | streets, avenues, boulevards | cars and buses knock him over, less   |
| Round   | 0.5 to 0.82 | streets, avenues, boulevards | cars crumple, buses push him          |
| Massive | 0.82 to 1   | avenues and boulevards only  | cars crumple, buses crumple from 0.85 |

## Urgency countdown and underpants

- The countdown starts at _initial_ 40 seconds and resets to that value after every relief and every accident.
- Vegetables subtract seconds (see _Food_). A vehicle knocking Benny over subtracts 3 seconds (the shock).
- Under 10 seconds: the HUD gauge turns red and shakes, Benny switches to the clenched waddle, his tummy rumbles.
- At 0: an **accident**. Benny freezes for 1.5 seconds with a shiver, a cartoon stink cloud puffs up, the camera shakes,
  and one pair of underpants in the HUD turns into a stained one. Then the countdown resets and the run continues.
- Benny starts with **5 pairs of underpants**. When the fifth is soiled, the run is over.

## Toilets

### Public toilet kiosks

- _Initial_ 8 kiosks placed on sidewalks of streets and avenues, spread across the city, each with its door facing
  the street. A kiosk has a 2 m square footprint and stands in a notch of its building, flush with the facades, so it
  never narrows the street; its door zone is the 1.5 m of sidewalk in front of the door.
- Each kiosk cycles between **free** (green beacon and an upward light beam) and **occupied** (red beacon, rattling
  door). _Initial_ free time: 6 to 14 s; occupied time: 5 to 15 s; both random per cycle.
- Benny uses a free toilet by standing in its door zone for 0.5 s. He enters (he squeezes through comically at any
  size), relief plays for 1.5 s during which he cannot be hurt, then he comes out with a fresh countdown. The kiosk
  turns occupied for 5 to 10 s.
- At an occupied kiosk, Benny can wait at the door: a ring shows how long until it frees up. Waiting is a gamble.
- Benny is at a door when his circle comes within _initial_ 0.3 m of its door zone, so he can use a kiosk at any size
  as long as he fits the road in front of it. A new run starts each kiosk at a random point of its cycle, free in
  proportion to the average free and occupied times.

### Pop-up toilets

- Portable toilets that pop out of the ground with a puff. They exist to keep a heavy Benny in the game.
- Spawn interval shrinks with weight: _initial_ every 25 s at `w = 0` down to every 6 s at `w = 1`. Lifetime 20 s.
  At most 4 at a time.
- They spawn only where Benny can go at his current girth, at a path distance of 25 to 80 m from him.
- **Mercy rule:** if no free toilet is reachable within 80% of the remaining time at Benny's current speed, one pop-up
  toilet spawns within reach immediately. At most once per countdown cycle.
- _Initial_ details: a mercy pop-up appears at a path distance between 30% and 60% of the distance Benny can still
  cover (at least 5 m), replacing the oldest pop-up if four are already out. Pop-ups are 1.4 m cabins, always free and
  not solid: Benny steps into one and stays half a second to use it, and it is gone once used.
- Path distances from Benny at his current girth are recomputed every 0.5 s of game time, up to 200 m along the paths;
  toilets farther than that count as out of reach.

### Finding them

- Off-screen indicators at the screen edges point to the three nearest free toilets **by path distance at Benny's
  current girth**, with the distance in metres. The nearest one is highlighted.
- Toilets Benny cannot reach at his current size show a grey indicator, so the player understands why.
  When fewer than three free toilets are within reach, the nearest unreachable ones fill in, greyed and marked "too
  wide". A toilet in view gets its label over it; one out of view gets an arrow at the screen edge.

## Food

Food items are oversized (about 1 m across) so they read clearly from above. They bob and spin slowly; junk food has a
warm golden glow, vegetables a sickly green one. Benny eats an item by touching it.

### Junk food (points and weight)

| Item              | Points (initial) | Weight (initial) |
| ----------------- | ---------------- | ---------------- |
| Burger            | 100              | +0.035           |
| Fried chicken leg | 90               | +0.035           |
| Pizza slice       | 80               | +0.030           |
| Hot dog           | 70               | +0.030           |
| Donut             | 60               | +0.025           |
| Fries             | 50               | +0.020           |
| Ice cream cone    | 40               | +0.015           |

With these values Benny reaches maximum weight after roughly 35 to 45 items.

### Vegetables (countdown penalty, no points)

| Item             | Countdown (initial) |
| ---------------- | ------------------- |
| Beans            | -10 s               |
| Cabbage          | -8 s                |
| Brussels sprouts | -7 s                |
| Broccoli         | -6 s                |
| Cauliflower      | -5 s                |
| Carrot           | -4 s                |

### Spawning

- Items appear at random walkable points, including alleys, which tempt a slim Benny into routes he will lose later.
- _Initial_: one spawn every 1.2 s, at most 25 items in the city, each lasting 30 s before it fades out.
- Items appear on walkable ground 6 to 40 m from Benny in a straight line (_initial_), so some are always on screen;
  spread over the whole city, 25 items would hardly ever be in view. Junk food kinds are equally likely, and so are
  vegetable kinds.
- Vegetables are 20% of spawns at the start, rising to 40% over eight minutes.

## Traffic

- Cars drive on streets, avenues and boulevards; buses only on avenues and boulevards. Nothing drives in alleys.
- Vehicles follow lanes and pick a random direction at each intersection. They do not brake for Benny and they honk
  when he is close ahead.
- _Initial_ details: one lane each way, a quarter of the road width from its centre line (right-hand traffic); a
  vehicle turns back only where there is no other way; new vehicles join at least 45 m from Benny; a vehicle honks
  when he is within 12 m ahead of it in its lane, at most every 2.5 s. Cars are 4.2 by 1.9 m, buses 11 by 2.6 m.
- _Initial_ speeds: cars 9 to 14 m/s, buses 7 to 9 m/s. _Initial_ density: 12 cars and 3 buses, growing 15% per minute
  up to three times that.

### Collisions

- **Benny gets hit** while his weight is below the vehicle's crumple threshold (cars 0.5, buses 0.85): he is knocked
  back along the vehicle's direction and stunned, and loses 3 s of countdown. Knock-back distance (_initial_ up to 8 m)
  and stun time (_initial_ up to 1.2 s, at least 0.3 s) scale with `1 - w / threshold`, so a fatter Benny is shaken
  less.
- **The vehicle crumples** when his weight is at or above the threshold: it squashes to 40% of its length with a puff
  of smoke and stops, Benny does a belly bounce and is slowed for 0.3 s, and the player scores the bonus. Crumpled
  vehicles disappear after 3 s; other vehicles drive around them.
- _Initial_ details: the knock-back is a push along the vehicle's way that Benny's ordinary braking soaks up over the
  knock-back distance, so walls stop him the usual way; the arrow keys do nothing while he is stunned, and vehicles
  cannot hit him again until 0.5 s after the stun. While slowed after a belly bounce, his top speed is halved.

## Scoring

- Junk food: the item's points, times the combo multiplier.
- Combo: eating again within 3 s of the previous item raises the multiplier by 0.5, up to 3x. It resets after 3 s.
- Relief: 250 points plus 20 points per second left on the countdown (the "clutch bonus").
- Crumpling a car: 300 points; a bus: 800 points.
- Accidents cost no points, only underpants.
- High scores: the best five, kept in `localStorage` (wrapped in try/catch; the game works without it).

## Difficulty over time

- Vehicle density grows as above.
- The vegetable share grows from 20% to 40% over eight minutes.
- Kiosk occupied times grow 10% per minute, up to two times.
- The countdown length does not change: difficulty comes from distance, size and the city, not from a shorter fuse.

## HUD and screens

The HUD is an HTML and CSS overlay above the canvas.

- Top left: the urgency gauge (a tummy icon, the seconds left, a bar from green through yellow to red).
- Top centre: the score and the current combo multiplier.
- Top right: five boxer-short icons, clean or stained.
- Bottom left: the weight bar with the girth tier, and markers showing where alleys and streets stop fitting (above
  the bar, struck through once Benny is too wide) and where cars and buses start crumpling (below it, lit once he is
  heavy enough). The fit markers follow from the street widths and the diameter formula, the crush markers from the
  crumple thresholds.
- Changes draw the eye: the score bumps when it grows, the combo pops when it rises, a pair of underpants wobbles as it
  stains, and the tier name pops when it changes (no animation when the system asks for reduced motion).
- Screen edges: the toilet indicators.
- Screens: title (with controls), pause, game over (score, best scores, "press Enter to play again").
  Nothing moves on the title or pause screens, and leaving the page (another tab or window) pauses a run.

## Audio

Royalty-free (CC0) sound effects: chomp, "ew" for vegetables, tummy rumble, flush, car crunch, horn, accident sting, a
light comedic music loop. Audio starts after the first key press (browser autoplay rules). M mutes, and the choice is
remembered.

- Version 1 synthesizes every sound in code with the Web Audio API (oscillators and filtered noise), so the game ships
  no audio files; CC0 samples can replace any cue later. A "bonk" plays when a vehicle knocks Benny over.
- The music plays only during a run (not on the title, pause or game-over screens). It is an original four-bar loop,
  _initial_ 128 beats per minute, 1.25 times faster while the countdown is low.
- While the countdown is low, the tummy rumbles at once, then every 2.6 s, the interval shrinking to 1.1 s at 0
  (_initial_); never inside a toilet or during an accident.
- Volumes (_initial_): master 0.8, effects 0.9, music 0.4. The same effect does not restart within 0.08 s, so a burst
  of honks plays once.

## Game feel

Effects show what happened; they never change the run, and they freeze with the pause.

- **Squash and stretch.** Benny hops once per footstep (_initial_ a step every 0.75 m when slim, 1.1 m at maximum
  weight): stretched 9% at the top of the hop, squashed 9% as he lands, 0.12 m off the ground, waddling 7 degrees side
  to side, all at full speed and scaled down as he slows. Standing still he breathes (2.5% at 1.6 Hz); on a low
  countdown he jiggles nervously (3.5% at 9 Hz). Each bite stretches him 16% for 0.25 s. He keeps his volume (width
  scale is the inverse square root of the height scale), and never goes below 70% or above 135% of his height.
- **Camera shake.** Hits add "trauma" (knocked over 0.75, crumpling a vehicle 0.6, an accident 0.4, capped at 1) that
  drains at 1.8 per second; the camera moves by up to 0.7 m times trauma squared, at about 17 Hz. No shake when the
  system asks for reduced motion.
- **Puffs.** Gold crumbs burst out of junk food and green leaves out of vegetables (8 each, 0.4 m); light grey smoke
  billows from the top of a crumpled vehicle (10 puffs, 1.8 m); dust rises where a vehicle knocks Benny over; during an
  accident a stink cloud rises around him (a puff every 0.07 s) and a thinner trail follows him for 4 s after. At most
  40 puffs at once.

## Art direction

A toy-town diorama: chunky rounded shapes, soft pastel buildings with saturated accents, warm afternoon light, soft
shadows. Readability from a high camera beats detail: strong silhouettes, clear colors per role (food gold, vegetables
green, toilets green or red, vehicles bright solid colors). No real brands, logos or car models anywhere.

## Out of scope for version 1

Gamepad controls, online leaderboards, multiplayer, accounts, any runtime network call. Touch controls came after the
first version, as milestone M9 (see _Controls_).
