---
name: retro-arcade-platform
description: System for building a retro neon 2D arcade platform with multiple mini-games (Donkey Kong style platformers, Pong, etc). Generates games, shared engine systems, UI, and arcade navigation.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Retro Neon Arcade Game Platform

This skill builds and maintains a **browser-based 2D arcade platform** that contains multiple classic-style mini games.

The goal is to create a **cohesive retro arcade experience** where players can browse and play games inspired by classic arcade titles such as:

- Donkey Kong
- Pong
- Breakout
- Space Invaders
- Galaga
- Frogger

The platform should feel like a **1980s arcade cabinet UI**, with a **neon aesthetic and smooth animations**.

---

# Core Platform Vision

The system should function as a **multi-game arcade environment**, not just individual games.

Architecture includes:

Arcade Platform

- Game selection lobby
- Shared UI framework
- Shared rendering engine
- Shared input system
- Shared audio system
- Shared score tracking

Mini Games

Each game runs as a **module** inside the arcade.

Examples:

Game Type | Inspiration
Platformer | Donkey Kong
Paddle Game | Pong
Brick Breaker | Breakout
Shooter | Space Invaders
Dodge / Survival | Asteroids
Endless Runner | Frogger style

Each game must be able to **plug into the arcade system easily**.

---

# Target Platform

Primary target:

Web Browser (Desktop first)

Technology stack should prioritize:

- HTML5 Canvas
- WebGL (optional)
- JavaScript / TypeScript
- Vite build system
- Modular game engine architecture

Recommended frameworks:

- Phaser.js (preferred)
- PixiJS
- Three.js (if 3D elements needed)

Default choice: Phaser 3

---

# Visual Style

The platform must maintain a **consistent retro neon aesthetic**.

Design rules:

Color Palette

- Neon cyan
- Electric magenta
- Deep purple
- Black backgrounds
- Glowing highlights

Visual Effects

Preferred effects:

- CRT screen glow
- Scanline overlays
- Pixel art sprites
- Neon UI outlines
- Particle effects
- Smooth sprite animations

Fonts

Use retro arcade fonts such as:

- Press Start 2P
- Arcade Classic
- Pixel Operator

---

# Arcade Platform Architecture

The arcade platform contains:

Arcade Lobby
│
├── Game Loader
│
├── UI System
│
├── Score System
│
├── Audio System
│
└── Game Modules
        ├── pong
        ├── donkey-kong-style
        ├── breakout
        ├── space-invaders

---

# Arcade Lobby

The first screen is the **arcade hub**.

Features:

- animated neon logo
- game cabinet selection
- keyboard navigation
- smooth transitions between games
- high score board

Example layout:

--------------------------
|     NEON ARCADE        |
|                        |
|   ► Pong               |
|     Donkey Tower       |
|     Brick Breaker      |
|     Space Defense      |
|                        |
|  High Scores           |
--------------------------

Selecting a game loads its module.

---

# Game Module Architecture

Every game must follow the same structure.

Example:

games/
   pong/
      pongScene.js
      paddle.js
      ball.js
      scoreSystem.js

Each game includes:

- game scene
- entity objects
- scoring system
- win/lose condition
- restart logic

---

# Core Game Loop

Every game follows the standard structure:

INPUT  
UPDATE  
RENDER

Example:

readInput()  
updateGameState()  
renderFrame()

Phaser handles rendering automatically but game logic should follow this pattern.

---

# Shared Systems

All games should reuse the following systems.

### Input System

Input actions should be abstracted.

Example:

move_left  
move_right  
jump  
fire  
pause  

Controls supported:

- keyboard
- controller (future)
- mouse (for menu)

---

### Score System

Arcade scoring should be unified.

Features:

- session score
- high score persistence
- score multipliers
- combo bonuses

---

### Audio System

Arcade sound design should include:

- retro sound effects
- synth style music
- power-up sounds
- game over sounds

Use WebAudio or Phaser audio engine.

---

# Example Games

### Pong

Core mechanics:

- two paddles
- bouncing ball
- score on miss
- increasing speed

Entities:

paddle  
ball  
score  

---

### Donkey Kong Style Platformer

Features:

- ladder climbing
- platform jumping
- falling barrels
- level progression

Entities:

player  
enemy  
platform  
ladder  
collectible  

---

### Breakout

Core mechanics:

- paddle
- ball
- destructible bricks

---

### Space Shooter

Core mechanics:

- player ship
- enemy waves
- projectile system
- explosion particles

---

# Performance Goals

Target:

60 FPS

Guidelines:

- object pooling for bullets
- sprite batching
- avoid excessive physics calculations
- reuse assets

---

# Code Generation Rules

When generating games:

Claude should:

1. Create modular folder structure
2. Use reusable components
3. Follow Phaser scene structure
4. Implement arcade physics
5. Add retro visual polish

Avoid:

- monolithic game files
- duplicated systems
- inconsistent input handling

---

# Expansion Strategy

The arcade should easily support **new games**.

Adding a new game should require only:

1 new game module  
1 entry in game loader  
1 icon in arcade menu  

---

# Key Goal

The final platform should feel like a **cohesive neon retro arcade**, not a collection of random games.

Focus on:

- smooth UI
- fast loading
- nostalgic gameplay
- modular architecture
- visual consistency