# The Tuxedo Man

**A first-person 80s slasher you play with your hands.** It's Halloween night, 1986. You're walking home through the woods on Hollow Road, toward a rundown house at the end of the trail. Something in a tuxedo is following you.

The Tuxedo Man is a physical-to-web horror piece. An Arduino with real sensors drives a three.js scene in the browser: your **light sensor is the moon**, your **hand near the distance sensor is your hand reaching into the dark**, and **one button** is how you look behind you, kill your flashlight, call out, or hide. He never moves while you're watching him. Every time you look away, he's somewhere new, and a little closer.

> No Arduino? The whole game plays in the browser with the keyboard.

---

## Demo

> 🎬 **Demo video coming soon.**
>
> <!-- Replace with the video embed / link once recorded, e.g.:
> [![Watch the demo](docs/demo-thumbnail.png)](https://youtu.be/XXXXXXXX)
> -->

Suggested shots:
1. The title screen: the b-roll reel, him skipping closer in the crimson fog.
2. Hardware and screen side by side as the walk starts.
3. Cover the light sensor: the eyelids close, footsteps circle you, you open your eyes and he's *right there*.
4. Turning around in Act II: the pumpkins behind you are all facing you.
5. A jumpscare, then the ending at the house.

---

## How to play

You walk the trail toward the house. Four acts, each one a checkpoint:

| Act | | What changes |
|---|---|---|
| **I.** | The Shortcut | Nothing behind you. Yet. |
| **II.** | Something in the Trees | Pumpkins start facing you when you turn around. He's out there. |
| **III.** | Don't Look Back | He gets closer every time. The flashlight starts failing. |
| **IV.** | The House | Every pumpkin is watching. The window goes dark. The door opens. |

### Controls

| Keyboard (sim) | Arduino | Does |
|---|---|---|
| **W / S** | *(walks automatically)* | Walk on / back away |
| **Shift** | | Run. He hears it. |
| **A / D** | | Look around |
| **Space** ×1 | Button ×1 | Look behind you |
| **Space** ×2 | Button ×2 | Flashlight off / on |
| **Space** ×3 | Button ×3 | Call out "Hello?" |
| **Alt** / **C** (hold) | Button (hold) | Hide and hold your breath |
| **E** (hold) | Cover the light sensor | Close your eyes |
| Mouse up / down | Light sensor | Moonlight |
| Scroll | Distance sensor | Your hand reaching toward him |
| **H** | | Toggle the sensor panel |

### What he does

- **He only moves when you're not looking.** The moonlight dipping, the flashlight sputtering, a blink: that's when he relocates.
- **Looking back is a ladder.** Every turn-around plays the next beat if you've walked far enough: pumpkins already facing you, then *all* of them, him half behind a trunk, him on the trail behind you, and then a jumpscare. Refuse to look and a twig snaps behind you, and your head turns anyway.
- **Your hand is a risk.** Reach toward the sensor and his head tilts, he looms, he reaches back. Hold it there too long and he lunges.
- **Hiding works, if you're patient.** Hold the button and he walks right past you on the trail. Stand up too soon and he stops, and turns.
- **Closing your eyes** stops you walking. You hear him circling. Wherever the footsteps stop, that's where he is when you open them.

Progress saves to `localStorage` each time an act card appears. **LOAD GAME** on the title screen puts you back at the start of your last act, and finishing the night clears the save.

---

## How it works

### 1. Firmware (Arduino)
`firmware/firmware.ino` samples the sensors every 33 ms (~30 Hz) and prints one line per snapshot. There's no `delay()`; timing uses `millis()`. Incoming bytes go into a fixed `char` buffer, not `String`, to spare the Uno's 2 KB of RAM. On boot the LED flashes red → green → blue, then the board prints `READY`.

### 2. Serial protocol
Plain text, one message per line, 115200 baud:

| Direction | Message | Meaning |
|---|---|---|
| Board → Browser | `READY` | Boot finished (the Uno resets when the port opens) |
| Board → Browser | `L:<0-1023>,B:<0\|1>,D:<cm>` | Light, button, distance (`D:0` = nothing in range) |
| Browser → Board | `S:<0-180>` | Servo angle *(not used by the game yet)* |
| Browser → Board | `C:<r>,<g>,<b>` | LED colour *(not used by the game yet)* |

### 3. Web Serial bridge
`controller/src/serial.js` opens the port with the browser's **Web Serial API**. It splits the stream on `\n`, holding the incomplete tail of each chunk for the next one, and rejects corrupted lines with a regex.

### 4. Sensors → game (`tuxedo/main.js`)
- **Light** auto-calibrates to the room (running min/max), then sets the moonlight, fog and flashlight strength. Covering it fully (< 5%) for a quarter second counts as closing your eyes.
- **Distance** maps 10–50 cm to "presence" 0–1, smoothed. It drives his poses, the pumpkins turning, and the hand-lunge scare.
- **Button** goes through `gestures.js`, which works on press/release *edges*. It counts presses after a 350 ms gap and fires *hold* while the button is still down, so one button gives four inputs.

### 5. The 3D pipeline (Blender → glTF → three.js)
- The character was re-rigged in Blender into a clean **29-bone deform skeleton**, with five actions: Idle, Stand, Tilt, Reach and Loom. It's exported as `public/models/tuxedo_man.glb` (1.4 MB).
- In three.js, Idle loops and the other poses are layered on top as **additive clips**, with weights driven by threat and your hand.
- The jumpscare face is painted on a canvas and wrapped onto a height field sampled from the skinned head, so it hugs his actual face.

### 6. Scene systems (`controller/src/tuxedo/`)

| File | What it does |
|---|---|
| `main.js` | Story and acts, checkpoints, input, camera, lighting, the scare controller, the ending, and the title-screen b-roll |
| `world.js` | Trail, terrain, the watching pumpkins, graveyard, house, scarecrow |
| `trees.js` | Procedural gnarled trees (curved tube limbs, root flares, bark maps) |
| `decor.js` | Litter, the spilled candy pail, TP'd trees, sheet ghosts, signs, webs, bats |
| `tuxedo.js` | His rules: relocating, peeking, passing by, circling, doorway, scare staging |
| `scareface.js` | The face you see up close |
| `lookback.js` | The turn-around suspense ladder |
| `gestures.js` | One button → click / double / triple / hold |
| `film.js` | 2.39:1 letterbox, VHS tape damage tied to his distance, title cards |
| `audio.js` | All sound, synthesized in Web Audio: wind, heartbeat, static, scream, snarl, the music box |
| `menu.js` | The title screen, LOAD GAME, the controls note |
| `sky.js` · `noise.js` | Night sky and moon · seeded noise helpers |

There are no audio or texture files to download. Everything except the character model is generated in code.

---

## Hardware

### Components
| Part | Used for |
|---|---|
| Elegoo Uno R3 (Arduino Uno compatible) | Microcontroller |
| Half-size breadboard + jumper wires | Wiring |
| Photoresistor (LDR) + 10 kΩ resistor | Moonlight / eyes (voltage divider) |
| Tactile pushbutton | Look back, flashlight, call out, hide |
| Sharp GP2Y0A21YK0F IR distance sensor | Your hand, 10–80 cm |
| Micro servo (SG90) + WS2812B NeoPixel | Wired but not yet used by the game |

### Wiring
| Part | Connection |
|---|---|
| Power rails | Uno **5V → + rail**, Uno **GND → − rail** |
| Photoresistor | + rail → LDR → **A0** junction → 10 kΩ → − rail |
| Button | Straddles the centre gap; one leg → **D2**, diagonal leg → − rail |
| IR sensor | Red → + rail, black → − rail, yellow → **A1** |
| Servo | Brown/black → − rail, red → + rail, signal → **D9** |
| NeoPixel | +5V → + rail, GND → − rail, **DIN** → (330 Ω) → **D6** |

---

## Getting started

### 1. Flash the firmware
1. Install the [Arduino IDE](https://www.arduino.cc/en/software), and install **Adafruit NeoPixel** from the Library Manager.
2. Open `firmware/firmware.ino`, choose **Arduino Uno** and its port, then **Upload**.
3. Optional check: open the Serial Monitor at **115200** baud. You should see `READY` and then `L:…,B:…,D:…` streaming.

### 2. Run it
```bash
cd controller
npm install
npm run dev
```
Open the `localhost` URL in **Chrome or Edge**; Web Serial isn't available in Safari or Firefox. Use headphones.

### 3. Connect
Close the Arduino Serial Monitor (only one program can hold the port), then choose **CONNECT ARDUINO** on the title screen and pick the Uno.

### URL parameters
- `?go`: skip the title screen
- `?at=0.5`: start partway down the trail (0–1; acts begin at 0, 0.22, 0.5 and 0.86)
- `?light=0.8` · `?near=1`: pin the moonlight or the hand distance
- `?auto`: hands-free walking in the sim

### Dev hook
In `npm run dev`, `window.tux` exposes the story, the input state, him (`tux.man`), `startScare()`, `lookBack`, `sound`, the renderer and more. It's stripped from production builds.

---

## Deploying

It's a static site. On **Vercel** or **Netlify**, import the repo with **Root Directory** `controller`, **Build** `npm run build` and **Output** `dist`. The HTTPS these hosts provide is what Web Serial requires, so the Arduino works on the hosted version in Chrome and Edge.

Browsers block audio until the first click. For an unattended demo machine, launch Chrome with `--autoplay-policy=no-user-gesture-required`.

---

## File structure
```
firmware/firmware.ino        Arduino: sensors → serial, servo + LED commands
blender/tuxedo_man.blend     Rig + pose library (renders in blender/renders/)
controller/
  index.html
  public/models/tuxedo_man.glb
  src/serial.js              Web Serial transport
  src/style.css              HUD, title screen, act cards
  src/tuxedo/                The game (see table above)
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Failed to open serial port` | Close the Arduino Serial Monitor and any other tab running the game; replug the USB. |
| No sound | Click or press a key once; browsers keep audio suspended until you interact. |
| Board resets when the servo moves | Use a micro servo, or give the servo its own 5 V supply with a shared ground. |
| Button stuck at `B:1` | Something else shares the button's breadboard row, or the button is rotated. |
| `D:` always 0 | The IR sensor isn't powered, or nothing is within ~80 cm. Closer than 10 cm reads as far away. |
| Choppy frame rate | The scene is heavy (several million triangles a frame). Use a smaller window or a machine with a dedicated GPU. |

---

## Future work
- **Servo and LED in the story**: a pumpkin LED that flickers when he's near, a servo-driven "something moved" prop.
- **Performance pass**: tree LODs, merged draw calls, fewer shadow casters.
- **Pressure input**: an HX711 load cell for a "grab" interaction.

## Related
The first piece built on this same hardware, **Shy Garden**, a toon koi pond that blooms in your light, now lives in its own repository: [`gelogonza/shy-garden`](https://github.com/gelogonza/shy-garden).

## Credits
Built by Angelo with Claude (Anthropic). Base character mesh from Repromancer's game-res model, re-rigged and re-textured as The Tuxedo Man. Uses [three.js](https://threejs.org/), [Vite](https://vitejs.dev/), [Adafruit NeoPixel](https://github.com/adafruit/Adafruit_NeoPixel) and [Blender](https://www.blender.org/). Fonts: IM Fell (Igino Marini), Special Elite and Reenie Beanie, via Google Fonts.
