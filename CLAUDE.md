# ARCADE — Developer Reference

Retro browser-based arcade with 6 games built on plain HTML5 Canvas (no frameworks).

---

## Architecture

### Logical coordinate system
All games use a fixed logical canvas of **LW=900 × LH=600**. The canvas is scaled to fill the window with `ctx.scale(scaleX(), scaleY())` where `scaleX = CW/LW`, `scaleY = CH/LH`. Mouse positions are converted between raw (screen) and logical coords.

### Game loop pattern
```js
function loop() {
  ctx.clearRect(0, 0, CW, CH);
  ctx.save(); ctx.scale(scaleX(), scaleY());
  if (gstate === 'PLAY') { updateGame(); drawPlay(); }
  // ...other states...
  ctx.restore();
  drawCursor(rawMX, rawMY);  // draws in raw pixel space, AFTER restore
  requestAnimationFrame(loop);
}

function updateGame() {
  frameCount++;  // increment here, NOT in loop()
  // ...
}
```
`frameCount` increments in `updateGame()` only — NOT in `loop()`. This way it only advances during PLAY state. All non-PLAY state animations (menu, gameover, win screens) must use `Date.now()` for timing, not `frameCount`. The bug pattern is incrementing in BOTH places, which advances game time at 2× speed.

### Game state machine
`gstate = 'MENU' | 'PLAY' | 'WIN' | 'GAMEOVER'`

### Color palette (CLR object)
```
bg:     #000814  (near-black navy)
player: #00f5ff  (cyan) / game-specific
enemy:  #ff2d78  (hot pink)
ui:     #ffe600  (yellow)
green:  #39ff14
orange: #ff8800
purple: #bf00ff
dim:    #1e3a5f  (muted blue)
cursor: #39ff14
```

---

## Performance Rules — What to NEVER do

These caused real lag. Avoid them in all new code.

### 1. shadowBlur toggling inside loops
**WRONG:**
```js
objs.forEach(obj => {
  ctx.shadowBlur = 8;     // expensive — re-enables GPU blur
  ctx.fillRect(...);
  ctx.shadowBlur = 0;     // resets blur
  ctx.fillRect(...);      // no blur
  ctx.shadowBlur = 8;     // re-enables again for next obj
});
```
**RIGHT:** Set shadowBlur ONCE before the loop, do all blurred draws, set to 0 once, do all non-blurred draws:
```js
ctx.shadowBlur = 8;
objs.forEach(obj => ctx.fillRect(...));   // all bodies
ctx.shadowBlur = 0;
objs.forEach(obj => ctx.fillRect(...));   // all details
```

### 2. Double frameCount increment
**WRONG:** `frameCount++` in BOTH `loop()` AND `updateGame()`. This runs at 2× speed on everything timed by `frameCount`.
**RIGHT:** Increment only in `updateGame()` (game files), never in both. Non-PLAY states use `Date.now()` for timing.

### 3. Per-frame `createRadialGradient` / `createLinearGradient`
Creating gradient objects every frame is expensive. Cache them, or only create in menu/setup contexts (not inside `drawPlay()`).

### 4. Per-frame scanline loops inside clip regions
**WRONG:**
```js
ctx.clip();  // roundRect clip — expensive
for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);  // hundreds of fills inside clip
```
**RIGHT:** Pre-render scanlines + vignette to an offscreen canvas ONCE at init, use `ctx.drawImage(overlay, x, y)` per frame.

### 5. Hundreds of separate `ctx.stroke()` / `ctx.fill()` calls for uniform shapes
**WRONG:**
```js
lines.forEach(l => {
  ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
});
```
**RIGHT:** Batch same-style paths into a single `beginPath()/stroke()`:
```js
ctx.beginPath();
lines.forEach(l => { ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); });
ctx.stroke();
```

### 6. Per-frame cursor drawing with shadowBlur
The pixel-art cursor shape has ~46 `fillRect` calls with `shadowBlur=10` active. That's ~46 GPU blur operations per frame.
**RIGHT:** Pre-render the cursor shape to an offscreen canvas once at init, then use a single `ctx.drawImage(_cursorCanvas, cx-18, cy-26)` per frame.

### 7. `ctx.clip()` in hot render paths
`clip()` with a `roundRect` path is expensive. If you need rounded corners on a frequently-rendered element (6 TV screens × 60fps), move as much content OUTSIDE the clip as possible. Pre-render the overlay so only `drawImage` calls happen inside the clip.

### 8. Offscreen canvas clone on every call
**WRONG:** `getFloors()` using `Object.assign` to clone every floor object on every call (called 8+ times per frame).
**RIGHT:** Cache the result in `_cachedFloors`, invalidate cache with `_cachedLevel = -1` when level changes, return the same array every call during gameplay.

### 9. `Math.hypot` / `Math.sqrt` as constants recalculated per-object per-frame
Pre-compute as module-level constants (e.g., `const STAR_MAX_DIST = Math.hypot(LW/2, LH/2)`).

### 10. Per-star `ctx.save()/ctx.restore()/ctx.stroke()` in starfield
**WRONG:** 80–120 individual save/stroke/restore calls per frame for star streaks.
**RIGHT:** One `beginPath()` that adds all line segments, then one `ctx.stroke()`.

---

## Game-Specific Notes

### index.html (Lobby)
- **TV layout**: `getTVRect(i)` — 3-column grid, `gapY=48` (not 18) so bottom-row monitors don't cover game titles.
- **TV overlay**: `tvOverlay` offscreen canvas (220×165) is pre-rendered at init with scanlines + vignette. In `drawTV()`, `ctx.drawImage(tvOverlay, -tw/2, -th/2)` replaces the per-frame loop.
- **Cursor**: Uses a *separate* `cursorCanvas` element layered above the main canvas. `drawCursor` uses `cctx.drawImage(_cursorCanvas, ...)`.
- **Grid lines**: All batched into a single `beginPath()/stroke()` call.

### apeclimb.html (Ape Climb)
- **Floor geometry**: `floorYAt(fl, x)` interpolates y across floor width using `fl.tiltY`. Both player landing and barrel landing use this.
- **Floor direction**: `getFloorDir(fi, floors)` returns -1 or +1 based on `(floors.length-1-fi) % 2 === 0`.
- **Barrel states**: ROLL (moves along floor) → FALL (drops to next floor, eases x toward `targetX`). Barrel always falls at edge (`atLeftEnd || atRightEnd`), sets `b.dir = getFloorDir(...)` on landing. Also randomly falls at ladders.
- **Ladder climbing**: `tryLadder()` sets `player.onLadder=true`, nudges `player.y -= 10` on UP entry to prevent immediate exit-check re-trigger. Exit: `player.y <= topFloor.y + 4` (top) or `player.y >= botFloor.y + 8` (bottom).
- **Win condition**: Player must reach gorilla position (`topFloor.x2-36, topFloor.y-28`), not just the top floor.
- **`loseLife()`** must set `player.onLadder = false` to prevent stuck-on-ladder respawn.
- **Floor/ladder cache**: `_buildCache()` runs once per level (keyed by `_cachedLevel`), `getFloors()`/`getLadders()` return cached arrays.

### frogger.html (Road Hopper)
- **No lives system**: `die()` immediately sets `gstate = 'GAMEOVER'` — no respawn.
- **Train rows**: `type:'TRAIN'` — timer counts down, `trainWarning` true in final 90 frames (blinking red signal), train spawns at edge when timer=0, moves at speed 14.
- **Standing on tracks** with no active train = safe (player can wait for it).

### invaders.html (Space Raiders)
- **Ship** is fixed at screen center (LW/2, LH/2), rotates with A/D, shoots forward with Space.
- **Asteroids** fly straight toward center — angle = `Math.atan2(LH/2 - spawnY, LW/2 - spawnX)`, no random spread.
- **Splitting**: large→2 medium→2 small. Small asteroids are destroyed.
- **Starfield**: All star streaks in one `beginPath()/stroke()`. `STAR_MAX_DIST` pre-computed as constant.

### breakout.html (Breakout)
- **Brick cache**: `brickCache` offscreen canvas, `brickDirty` flag. Bricks only re-rendered to offscreen when a brick is hit (`brickDirty=true` set on `b.hp--` and `setupLevel()`).
- Ball shadowBlur=14, paddle shadowBlur=12. Particles have shadowBlur=0.

### pong.html / snake.html
- Standard cursor pre-rendering applied.

---

## Common Utilities (copy-paste patterns)

### Scanline overlay (pre-rendered, used by all games)
```js
let _sl = null;
function drawScanlines() {
  if (!_sl) {
    _sl = document.createElement('canvas'); _sl.width = LW; _sl.height = LH;
    const sc = _sl.getContext('2d');
    sc.fillStyle = 'rgba(0,0,0,0.05)';
    for (let y = 0; y < LH; y += 3) sc.fillRect(0, y, LW, 1);
  }
  ctx.drawImage(_sl, 0, 0);
}
```

### Cursor (pre-rendered, used by all games)
```js
let _cursorCanvas = null;
function drawCursor(cx, cy) {
  if (!_cursorCanvas) {
    _cursorCanvas = document.createElement('canvas');
    _cursorCanvas.width = 50; _cursorCanvas.height = 60;
    const cc = _cursorCanvas.getContext('2d'), p = 2, fg = CLR.cursor, dk = CLR.bg, OX = 18, OY = 26;
    cc.shadowBlur = 10; cc.shadowColor = fg;
    const dot = (c, r, col) => { cc.fillStyle = col||fg; cc.fillRect(OX+c*p, OY+r*p, p, p); };
    // ... dot calls ...
  }
  ctx.drawImage(_cursorCanvas, Math.round(cx) - 18, Math.round(cy) - 26);
}
```

### Particle burst
```js
function burst(x, y, color, count, minSpd=1, maxSpd=5) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = minSpd + Math.random() * (maxSpd - minSpd);
    particles.push({ x, y, dx: Math.cos(a)*spd, dy: Math.sin(a)*spd, life: 1, color });
  }
}
function tickParticles() {
  particles = particles.filter(p => {
    p.x += p.dx; p.y += p.dy; p.dy += 0.1; p.life -= 0.03 + Math.random()*0.04;
    return p.life > 0;
  });
}
```

---

## Adding a New Game

1. Copy a similar game file as a template.
2. Use the pre-rendered cursor pattern (do NOT draw cursor inline with shadowBlur active per frame).
3. Use the pre-rendered scanline pattern for `drawScanlines()`.
4. Keep `frameCount++` only in `updateGame()`, never in `loop()` as well.
5. Never toggle `shadowBlur` inside a `forEach` loop — batch by drawing all glowing items first, then all non-glowing items.
6. Cache any per-frame gradient or geometry computation that doesn't change frame-to-frame.
7. Test at 60fps — open DevTools Performance panel, confirm main thread stays under 16ms/frame.
