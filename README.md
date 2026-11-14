# 3D platformer outline

A small, dependency-free browser platformer with two sample levels, simple
WebGL box graphics, and a following camera.

## Run

From the project directory, start a static server, for example:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000> in a WebGL-capable browser. No build or package
installation is needed. Use WASD or the arrow keys to move, Space to jump, and
R to restart the current level. Reach the gold marker to advance; falling off
the level respawns the player. After the last level, R starts over.

## Levels and physics

Levels are defined in `src/levels.js` as an ordered array. Each level has a
name, a spawn position, box-shaped platforms, and a goal. Coordinates are in
world units: Y is vertical, and positive Z is forward. Platform positions are
their centers, while spawn Y is the player's feet and goal Y is the platform's
top surface. Place the spawn and goal above supported platforms and keep gaps
small enough to jump.

`src/physics.js` handles movement, gravity, jumping, box collisions, falling,
and goal detection. `src/renderer.js` draws the platforms, player, and marker;
`src/main.js` handles input, the fixed-step game loop, and level progression.

## Tests

With Node.js installed, run:

```sh
npm test
```