/**
 * Health HUD — three hearts (top centre) plus a pip per movement technique the level
 * allows: dash (lights up while it's available), glide (lights up while gliding),
 * double (while the double jump is available).
 *
 *   const hud = createHealthHud(session.maxHealth);
 *   hud.update(session);              // every frame (only touches the DOM on change)
 *   hud.flash();                      // red screen flash when hurt
 */
const HEART = `<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 21.5 2.3 11.8A6.2 6.2 0 0 1 11.1 3l.9.9.9-.9a6.2 6.2 0 0 1 8.8 8.8Z"/></svg>`;

export function createHealthHud(maxHealth = 3, parent = document.querySelector('main') || document.body) {

  const root = document.createElement('div');
  root.className = 'health-hud';
  root.setAttribute('role', 'status');
  root.innerHTML = `
    <div class="hearts">${Array.from({ length: maxHealth }, () => `<span class="heart full">${HEART}</span>`).join('')}</div>
    <span class="dash-pip" data-ability="dash" title="Air dash (Shift / J)">dash</span>
    <span class="dash-pip" data-ability="glide" title="Glide: hold Space while falling">glide</span>
    <span class="dash-pip" data-ability="double" title="Double jump: Space again in mid-air">double</span>`;
  // The full-screen flash only exists while it plays (an idle full-screen layer
  // still costs compositing time on software-rendered machines).
  const flash = document.createElement('div');
  flash.className = 'hurt-flash';
  flash.addEventListener('animationend', () => flash.remove());
  parent.append(root);
  const hearts = [...root.querySelectorAll('.heart')];
  const pips = Object.fromEntries([...root.querySelectorAll('.dash-pip')].map(el => [el.dataset.ability, el]));
  const pip = pips.dash;
  let shown = maxHealth, dashShown = null, abilitiesShown = null;

  return {
    update(session) {
      const hp = session.health;
      if (hp !== shown) {
        hearts.forEach((h, i) => {
          h.classList.toggle('full', i < hp);
          h.classList.toggle('empty', i >= hp);
          if (i === hp && hp < shown) { h.classList.remove('lost'); void h.offsetWidth; h.classList.add('lost'); }
        });
        root.setAttribute('aria-label', `Health ${hp} of ${session.maxHealth}`);
        shown = hp;
      }
      const p = session.player;
      const abilities = (session.level.abilities || ['dash']).join();
      if (abilities !== abilitiesShown) {
        for (const [name, el] of Object.entries(pips)) el.hidden = !abilities.split(',').includes(name);
        abilitiesShown = abilities;
      }
      const ready = p.grounded || p.canDash;
      if (ready !== dashShown) { pip.classList.toggle('used', !ready); dashShown = ready; }
      pips.double.classList.toggle('used', !(p.grounded || p.canDouble));
      pips.glide.classList.toggle('used', !p.gliding);
      root.classList.toggle('invulnerable', session.invulnerable > 0);
    },
    flash() {
      flash.classList.remove('on');
      parent.append(flash);
      void flash.offsetWidth;
      flash.classList.add('on');
    },
  };
}
