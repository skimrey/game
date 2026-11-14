/**
 * Game State Manager
 * Tracks player stats, level progress, and game settings
 */

export class GameState {
  constructor() {
    this.stats = {
      totalTime: 0,
      levelTimes: {},
      deathCount: 0,
      bestTimes: {},
      completedLevels: new Set(),
    };
    this.settings = {
      difficulty: 'normal',
      graphicsQuality: 'high',
      audioEnabled: true,
      controlScheme: 'wasd', // 'wasd', 'arrows', or 'gamepad'
    };
    this.saveToLocalStorage();
  }

  updateLevelTime(levelName, time) {
    if (!this.stats.levelTimes[levelName]) {
      this.stats.levelTimes[levelName] = 0;
    }
    this.stats.levelTimes[levelName] += time;

    if (!this.stats.bestTimes[levelName] || time < this.stats.bestTimes[levelName]) {
      this.stats.bestTimes[levelName] = time;
    }
  }

  recordDeath() {
    this.stats.deathCount++;
  }

  markLevelComplete(levelName) {
    this.stats.completedLevels.add(levelName);
  }

  isLevelComplete(levelName) {
    return this.stats.completedLevels.has(levelName);
  }

  getStat(key) {
    return this.stats[key];
  }

  setSetting(key, value) {
    if (this.settings.hasOwnProperty(key)) {
      this.settings[key] = value;
      this.saveToLocalStorage();
    }
  }

  getSetting(key) {
    return this.settings[key];
  }

  saveToLocalStorage() {
    try {
      localStorage.setItem('gameState', JSON.stringify({
        stats: {
          ...this.stats,
          completedLevels: Array.from(this.stats.completedLevels),
        },
        settings: this.settings,
      }));
    } catch (error) {
      console.warn('Failed to save game state:', error);
    }
  }

  loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem('gameState');
      if (saved) {
        const data = JSON.parse(saved);
        this.stats = {
          ...this.stats,
          ...data.stats,
          completedLevels: new Set(data.stats.completedLevels || []),
        };
        this.settings = { ...this.settings, ...data.settings };
      }
    } catch (error) {
      console.warn('Failed to load game state:', error);
    }
  }

  reset() {
    this.stats = {
      totalTime: 0,
      levelTimes: {},
      deathCount: 0,
      bestTimes: {},
      completedLevels: new Set(),
    };
    this.saveToLocalStorage();
  }
}

export const gameState = new GameState();
gameState.loadFromLocalStorage();
