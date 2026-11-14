/**
 * Audio Manager
 * Handles background music, sound effects, and volume control
 */

export class AudioManager {
  constructor() {
    this.sounds = new Map();
    this.musicVolume = 0.5;
    this.sfxVolume = 0.7;
    this.enabled = true;
  }

  loadSound(name, source) {
    try {
      const audio = new Audio(source);
      this.sounds.set(name, audio);
      return audio;
    } catch (error) {
      console.warn(`Failed to load sound: ${name}`, error);
      return null;
    }
  }

  play(name, options = {}) {
    if (!this.enabled) return;
    const audio = this.sounds.get(name);
    if (!audio) {
      console.warn(`Sound not found: ${name}`);
      return;
    }
    const volume = options.music ? this.musicVolume : this.sfxVolume;
    const clone = audio.cloneNode();
    clone.volume = Math.min(1, options.volume !== undefined ? options.volume : volume);
    clone.play().catch(err => console.warn(`Failed to play sound: ${name}`, err));
  }

  setMusicVolume(volume) {
    this.musicVolume = Math.max(0, Math.min(1, volume));
  }

  setSfxVolume(volume) {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  toggle() {
    this.enabled = !this.enabled;
  }
}

export const audioManager = new AudioManager();
