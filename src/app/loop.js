/**
 * The frame loop: fixed 120 Hz steps of whatever is going on (a level, the town, the showroom),
 * then one render — the renderer, the FPS meter and the adaptive quality live here.
 *
 * Part of the app (src/app/); see STRUCTURE.md.
 */
import { avatar, benchSeconds, blinkTrail, campaign, canvas, controls, G, hubFirst, menuFirst, npcPrompt, params, screen, showAvatar, springBounces, status, trail } from './boot.js';
import { openCharacterScreen, show, showPlayer, SHOWROOM, SHOWROOM_VIEW, showroomCamera, updateShowroom } from './hero.js';
import { activeLevel, collectGem, onEvents, runBattle, runCheckpoint, say, setUpArcade, showHint, updateStatus } from './level.js';
import { endRift, setUpNpc, talkCamera, trinketBoxes } from './quests.js';
import { enterTown, nearBoard, renderTown, stepTown } from './town.js';
import { sound } from '../audio/music.js';
import { computeShadow, emitAvatarEffects } from '../characters/avatar.js';
import { hexToRgb } from '../characters/character.js';
import { petParts } from '../characters/pets.js';
import { Config } from '../engine/config.js';
import { createFpsMeter } from '../engine/fpsMeter.js';
import { particleSystem } from '../engine/particles.js';
import { performanceMonitor } from '../engine/performance.js';
import { resolveQuality, sceneryForQuality } from '../engine/quality.js';
import { createRenderer } from '../engine/renderer.js';
import { decodeInput } from '../levels/audit.js';
import { arcadeBoxes, touchesArcade } from '../world/arcade.js';
import { BIOMES } from '../world/biomes.js';
import { enemyParts } from '../world/enemies.js';
import { environmentFor } from '../world/environment.js';
import { buildScenery } from '../world/scenery.js';
import { gliderBoxes, springBoxes } from '../world/terrainParts.js';
import { ZONES } from '../world/zones.js';
/** Start rendering (called once, at the end of app/boot.js). */
export function startGame(startQuality) {
  try {
    const quality = resolveQuality(params);
    const render = createRenderer(canvas, quality);
    G.renderer = render;
    const meter = createFpsMeter(quality, { canvas, renderer: render });
    // ?warmup=S: seconds before measuring (e.g. to let adaptive quality settle)
    if (benchSeconds) meter.startBench(benchSeconds, Number(params.get('warmup')) || undefined).then(r => { status.textContent = `Bench: ${r.fps.toFixed(1)} fps avg · ${r.lowFps.toFixed(1)} low`; });
    // paint every tier's textures (and, in the test preset, bake every tier's sky) up
    // front so entering a new tier never hitches
    render.warmUp(G.runZones.flatMap(id => [BIOMES[ZONES[id].biome].material, BIOMES[ZONES[id].biome].ground?.material].filter(Boolean)), G.runZones.map(id => BIOMES[ZONES[id].biome]));
    if (menuFirst) openCharacterScreen();
    else if (hubFirst) enterTown('start');
    else { setUpArcade(); setUpNpc(); updateStatus(); showHint(campaign[G.levelIndex]); }

    const step = 1 / 120;

    function renderShowroom(time) {
      let steps = 0;
      while (G.accumulator >= step && steps++ < 24) { updateShowroom(step); particleSystem.update(step); G.accumulator -= step; }
      if (controls.read().jump) screen.play();   // gamepad A starts too
      show.scenery ||= buildScenery(SHOWROOM, BIOMES.meadow, null);
      render(SHOWROOM_VIEW, showPlayer, particleSystem.getActiveParticles(), {
        avatar: [...showAvatar.getParts(showPlayer), ...(G.pet ? petParts(G.pet, { x: 0.72, y: 0.5, z: 0.38, yaw: 0.5, sit: true, look: Math.sin(show.time * 0.6), blink: Math.sin(show.time * 2.1) > 0.97 }, show.time) : [])],
        shadow: computeShadow(SHOWROOM, showPlayer),
        camera: showroomCamera(),
        biome: BIOMES.meadow,
        scenery: sceneryForQuality(show.scenery, render.quality),
      });
      meter.frame(time);
      requestAnimationFrame(frame);
    }

    function frame(time) {
      performanceMonitor.beginFrame();
      performanceMonitor.beginUpdate();

      const frameDt = G.lastTime !== undefined ? Math.min((time - G.lastTime) / 1000, Config.MAX_DELTA_TIME) : 0;
      G.accumulator += frameDt;
      G.lastTime = time;

      if (screen.isOpen) { renderShowroom(time); return; }
      if (G.phase === 'battle' || G.phase === 'stage' || G.phase === 'home' || G.phase === 'inn' || G.phase === 'ranch' || G.phase === 'cards' || G.phase === 'resuming') { G.accumulator = 0; requestAnimationFrame(frame); return; }   // 2D screens draw themselves
      if (G.phase === 'gem') {
        G.gemTimer -= frameDt;
        if (G.gemTimer <= 0) runBattle();
      }

      while (G.accumulator >= step) {
        if (G.phase === 'hub') stepTown(step);
        if (!G.finished && G.phase === 'play') {
          let input = controls.read();
          if (benchSeconds) {
            // Bench: replay the audit bot's verified solution (restart when it ends)
            const inputs = environmentFor(campaign[G.levelIndex]).audit.solution.inputs;
            if (G.benchTick >= inputs.length) { G.session.reset(); G.benchTick = 0; }
            input = decodeInput(inputs[G.benchTick++]);
          }

          const before = G.session.player;
          const { result, events } = G.session.step(input, step);
          onEvents(events);
          if (G.session.player !== before) avatar.reset(G.session.player);
          const pl = G.session.player;
          if (pl.sprung) sound.fx('spring');
          if (pl.doubled) sound.fx('jump2');
          if (pl.sprung) {                       // a bounce pad: squash it, sparkle
            springBounces.set(pl.sprung, performance.now() / 1000);
            particleSystem.emit(pl.x, pl.y + 0.1, pl.z, { count: 10, speed: 4, color: [1, 0.55, 0.8], lifetime: 0.6 });
          }
          if (pl.doubled) particleSystem.emit(pl.x, pl.y, pl.z, { count: 12, speed: 3, color: [0.5, 0.85, 1], lifetime: 0.5 });

          if (G.rift) {
            for (const t of G.rift.trinkets) if (!t.got && Math.hypot(pl.x - t.x, pl.z - t.z) < 0.8 && Math.abs(pl.y + 0.6 - t.y) < 1.1) {
              t.got = true;
              particleSystem.emit(t.x, t.y, t.z, { count: 18, speed: 4, color: [1, 0.85, 0.3], lifetime: 0.8 });
              const left = G.rift.trinkets.filter(x => !x.got).length;
              sound.fx('trinket');
              say(left ? `Found a trinket! ${left} to go.` : 'All three trinkets! Now grab the gem.', 2.5);
            }
            if (G.rift.timeLeft !== null) {
              G.rift.timeLeft -= step;
              if (G.rift.timeLeft <= 0) { endRift(false, 'The rift closed before you reached the gem!'); break; }
            }
          }
          if (result === 'goal' && benchSeconds) {
            G.session.reset();
            G.benchTick = 0;
          } else if (result === 'goal') {
            collectGem();
            if (G.phase !== 'play') break;
          } else if (!G.rift && G.arcade?.state === 'ready' && touchesArcade(G.session.player, G.arcade.spot)) {
            runCheckpoint();
            break;
          }
        }
        if (G.npcActor && !G.rift && !G.inTown) G.npcActor.update(step, G.session.player);
        if (G.inTown) for (const v of G.villagers) v.update(step, G.session.player);

        const moves = avatar.update(G.session.player, step);
        emitAvatarEffects(moves, particleSystem);
        for (const m of moves) {
          if (m.type === 'jump' && !G.session.player.doubled) sound.fx('jump');
          else if (m.type === 'land') sound.fx('land', { strength: m.impact / 10 });
        }
        if (G.petFollower) {
          G.petFollower.update(G.session.player, step);
          if (G.petFollower.takePoof()) { const q = G.petFollower.state; particleSystem.emit(q.x, q.y + 0.3, q.z, { count: 12, speed: 2.5, color: [1, 1, 1], lifetime: 0.5 }); }
        }
        if (!blinkTrail()) trail.update(G.currentDesign.trail, G.session.player, step, particleSystem, G.currentDesign.trailColors);
        particleSystem.update(step);
        G.accumulator -= step;
      }
      if (G.message && performance.now() > G.message.until) { G.message = null; updateStatus(); }
      if (G.rift?.timeLeft !== null && G.rift && !G.message) status.textContent = `${G.rift.level.name} · the rift closes in ${Math.ceil(G.rift.timeLeft)} s`;
      const canTalk = G.phase === 'play' && !G.rift && G.npcActor?.near(G.session.player) ? G.npcActor.npc.first
        : G.phase === 'hub' ? (G.villagers.find(v => v.near(G.session.player))?.npc.first || (nearBoard(G.session.player) ? 'the notice board' : null)) : null;
      if (!!canTalk === npcPrompt.hidden || (canTalk && !npcPrompt.textContent.includes(canTalk))) {
        npcPrompt.hidden = !canTalk;
        if (canTalk) npcPrompt.innerHTML = `<kbd>E</kbd> ${canTalk === 'the notice board' ? 'Read' : 'Talk to'} ${canTalk}`;
      }

      performanceMonitor.endUpdate();
      performanceMonitor.beginRender();

      if (G.inTown && G.phase !== 'home' && G.phase !== 'inn' && G.phase !== 'ranch') { renderTown(render, time, frameDt); G.hud.update(G.session); performanceMonitor.endRender(); performanceMonitor.endFrame(); meter.frame(time); requestAnimationFrame(frame); return; }
      const level = activeLevel();
      const environment = environmentFor(level);
      const blink = G.session.invulnerable > 0 && Math.floor(G.session.time * 14) % 2 === 1;
      const npcHere = G.npcActor && !G.rift ? G.npcActor : null;
      render(level, G.session.player, particleSystem.getActiveParticles(), {
        camera: talkCamera(frameDt),
        avatar: [...(blink ? [] : avatar.getParts(G.session.player)), ...(npcHere ? npcHere.parts(time / 1000) : []), ...(G.petFollower ? G.petFollower.parts(time / 1000) : [])],
        shadow: [computeShadow(level, G.session.player), ...(npcHere ? [computeShadow(level, npcHere.spot)] : []), ...(G.petFollower ? [computeShadow(level, G.petFollower.state, 0.3)] : [])].filter(Boolean),
        hideGoal: G.phase === 'gem' || !!G.rift?.trinkets.some(t => !t.got),   // collected: it burst into sparkles; a rift's gem waits for the trinkets
        boxes: [
          ...G.session.enemyBoxes(enemyParts),
          ...(G.rift ? trinketBoxes(G.rift.trinkets, time / 1000) : []),
          ...(G.arcade && !G.rift ? arcadeBoxes(G.arcade.spot, time / 1000, G.arcade.state) : []),
          ...springBoxes(level, time / 1000, springBounces),
          ...(G.session.player.gliding ? gliderBoxes(G.session.player, hexToRgb(G.currentDesign.colors.hat)) : []),
        ],
        biome: environment.biome,
        scenery: sceneryForQuality(environment.scenery, render.quality),
        platformTint: G.rift ? [0.92, 0.8, 1.2] : environment.platformTint,   // a rift is tinged violet
      });
      if (G.rift && Math.random() < 0.3) {                                     // … and sparkles drift up through it
        const p = G.session.player;
        particleSystem.emit(p.x + (Math.random() - 0.5) * 14, p.y - 2 + Math.random() * 4, p.z + Math.random() * 12, { count: 1, speed: 0.6, color: Math.random() < 0.5 ? [0.75, 0.45, 1] : [0.4, 0.9, 1], lifetime: 1.6 });
      }
      G.hud.update(G.session);

      performanceMonitor.endRender();
      performanceMonitor.endFrame();
      meter.frame(time);

      if (Config.SHOW_PERFORMANCE_STATS) {
        console.log(performanceMonitor.toString());
      }

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  } catch (error) {
    status.textContent = `Unable to start: ${error.message}`;
    console.error(error);
  }
}
