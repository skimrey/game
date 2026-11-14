# Assets Directory Structure

This directory should contain all game assets such as:

## Directories:

- **audio/**: Sound effects and background music
  - `music/`: Background music tracks
  - `sfx/`: Sound effects (jump, land, goal, etc.)
  
- **textures/**: Texture files (if expanding beyond procedural generation)
  - `platforms/`
  - `player/`
  - `environment/`

- **models/**: 3D model files (if migrating from box-based rendering)
  - `gltf/`: GLTF format models
  - `obj/`: OBJ format models

- **shaders/**: GLSL shader files (if extracting from main renderer)
  - `vertex/`
  - `fragment/`

## Usage Notes:

### Audio Files

Place audio files in `assets/audio/` and load in `src/main.js`:

```javascript
import { audioManager } from './audio.js';

audioManager.loadSound('jump', './assets/audio/sfx/jump.mp3');
audioManager.loadSound('goal', './assets/audio/sfx/goal.mp3');
audioManager.loadSound('bgm', './assets/audio/music/level_bgm.mp3');
```

### Textures and Models

To add textures or 3D models:
1. Place files in respective subdirectories
2. Update renderer.js to load and use them
3. Ensure files are added to `.gitignore` if they are large

### Recommendations:

- Keep audio files under 500KB each
- Use MP3 for broad browser compatibility
- Compress textures with appropriate tools
- Reference assets with relative paths from index.html
