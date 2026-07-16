// HEGEMON iconography (M2.f.3).
//
// Three symbol sets, one stable id namespace: callers reference #i-unit-infantry
// etc. and never care which theme is active — injectIcons() swaps the <defs>.
// Inside a symbol: `currentColor` is the tint (faction color for units, set
// via style="color:..." on the <use>), `var(--ink)` draws details. Everything
// is authored on a 24x24 viewBox and must survive at 14px — silhouettes, not
// illustrations.
//
// Sets: core (abstract chart — the M1 geometry, now as symbols),
// asoiaf (shields, knights, longships, towers), modern2026 (NATO APP-6
// inspired frames — the one icon language actually engineered for tiny sizes).

const ORD_SHARED = `
<symbol id="i-ord-march" viewBox="0 0 24 24"><path d="M4 12 H15 M11 6 L18 12 L11 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-ord-defend" viewBox="0 0 24 24"><path d="M12 3 L20 6 V12 C20 17 12 21 12 21 C12 21 4 17 4 12 V6 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></symbol>
<symbol id="i-ord-support" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 6.5 V17.5 M6.5 12 H17.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></symbol>
<symbol id="i-ord-raid" viewBox="0 0 24 24"><path d="M5.5 5.5 L18.5 18.5 M18.5 5.5 L5.5 18.5" stroke="currentColor" stroke-width="2.7" stroke-linecap="round"/></symbol>
<symbol id="i-ord-rally" viewBox="0 0 24 24"><path d="M8 4 H18.5 L15.5 8.5 L18.5 13 H8 Z" fill="currentColor"/><path d="M8 4 V20.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></symbol>
<symbol id="i-ord-back" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.5 3"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/></symbol>`;

export const ICON_SETS = {
  core: {
    token: 'circle',
    defs: `${ORD_SHARED}
<symbol id="i-unit-infantry" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5" fill="currentColor" stroke="var(--ink)" stroke-width="1.2"/></symbol>
<symbol id="i-unit-cavalry" viewBox="0 0 24 24"><polygon points="12,4.5 20,19 4,19" fill="currentColor" stroke="var(--ink)" stroke-width="1.2" stroke-linejoin="round"/></symbol>
<symbol id="i-unit-warship" viewBox="0 0 24 24"><rect x="3" y="8.5" width="18" height="7" rx="3.5" fill="currentColor" stroke="var(--ink)" stroke-width="1.2"/></symbol>
<symbol id="i-unit-siege_engine" viewBox="0 0 24 24"><rect x="6.8" y="6.8" width="10.4" height="10.4" transform="rotate(45 12 12)" fill="currentColor" stroke="var(--ink)" stroke-width="1.2"/></symbol>
<symbol id="i-fort-castle" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.3"/></symbol>
<symbol id="i-fort-citadel" viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.3"/><rect x="9.5" y="9.5" width="5" height="5" fill="currentColor"/></symbol>
<symbol id="i-port" viewBox="0 0 24 24"><rect x="7.2" y="7.2" width="9.6" height="9.6" transform="rotate(45 12 12)" fill="none" stroke="currentColor" stroke-width="2"/></symbol>
<symbol id="i-supply" viewBox="0 0 24 24"><rect x="7" y="5" width="10" height="14" rx="3" fill="currentColor" stroke="var(--ink)" stroke-width="1.1"/><path d="M7 9.5 H17 M7 14.5 H17" stroke="var(--ink)" stroke-width="1.3"/></symbol>
<symbol id="i-coin" viewBox="0 0 24 24"><path d="M4 19.5 C4 13 6.5 9.8 10.5 9.8 C12.6 9.8 14.1 11 14.8 12.8 L14.8 8.2 C14.8 6 16 4.6 17.6 4.6 C19.3 4.6 20.5 5.9 20.5 7.6 L20.5 19.5 Z" fill="currentColor" stroke="var(--ink)" stroke-width="1.1" stroke-linejoin="round"/></symbol>`,
  },

  asoiaf: {
    token: 'circle',
    defs: `${ORD_SHARED}
<symbol id="i-unit-infantry" viewBox="0 0 24 24"><path d="M12 3 C15 4.6 17.8 5 19 5.5 V12 C19 17 12 21 12 21 C12 21 5 17 5 12 V5.5 C6.2 5 9 4.6 12 3 Z" fill="currentColor" stroke="var(--ink)" stroke-width="1.1" stroke-linejoin="round"/><path d="M12 5.5 V18" stroke="var(--ink)" stroke-width="1.3"/></symbol>
<symbol id="i-unit-cavalry" viewBox="0 0 24 24"><path d="M6 20 H18 C18 14.5 19 11 16 8 C14 5.6 10.6 4.2 9.1 5.6 C8.3 6.4 9.1 7.5 8.3 8.3 C6.9 9.6 5.2 10.1 5.2 12 C5.2 13.6 6.9 13.9 8.1 13.1 C9 12.5 9.7 12.6 9.7 13.5 C9.7 15.5 6 15.9 6 20 Z" fill="currentColor" stroke="var(--ink)" stroke-width="1" stroke-linejoin="round"/><circle cx="12.6" cy="8.1" r="0.95" fill="var(--ink)"/></symbol>
<symbol id="i-unit-warship" viewBox="0 0 24 24"><path d="M2.5 14.5 Q12 18.5 21.5 14.5 L19.6 18.2 Q12 21 4.4 18.2 Z" fill="currentColor" stroke="var(--ink)" stroke-width="1"/><path d="M10.8 3 V14.8" stroke="currentColor" stroke-width="1.7"/><path d="M11.6 3.6 C17 4.8 19.6 8.6 19 12.8 L11.6 12.8 Z" fill="currentColor" stroke="var(--ink)" stroke-width="0.9"/></symbol>
<symbol id="i-unit-siege_engine" viewBox="0 0 24 24"><path d="M5.5 20 L10.5 9 L15.5 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M7.5 12.5 L20 5.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="19.6" cy="5.6" r="2.4" fill="currentColor" stroke="var(--ink)" stroke-width="0.9"/><path d="M4 20 H17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></symbol>
<symbol id="i-fort-castle" viewBox="0 0 24 24"><path d="M8 21 V9 H9.6 V6.8 H11.1 V9 H12.9 V6.8 H14.4 V9 H16 V21 Z" fill="currentColor" stroke="var(--ink)" stroke-width="0.9" stroke-linejoin="round"/><rect x="10.9" y="15.4" width="2.2" height="5.6" fill="var(--ink)"/></symbol>
<symbol id="i-fort-citadel" viewBox="0 0 24 24"><path d="M3.5 21 V9.5 H4.9 V7.5 H6.3 V9.5 H7.7 V7.5 H9.1 V9.5 V13 H14.9 V9.5 H16.3 V7.5 H17.7 V9.5 H19.1 V7.5 H20.5 V21 Z M9.1 13 V21 M14.9 13 V21" fill="currentColor" stroke="var(--ink)" stroke-width="0.9" stroke-linejoin="round"/><rect x="10.9" y="16" width="2.2" height="5" fill="var(--ink)"/></symbol>
<symbol id="i-port" viewBox="0 0 24 24"><path d="M12 8.2 V19 M7.4 11.2 H16.6 M5.4 14.6 C7 18.4 17 18.4 18.6 14.6 M5.4 14.6 L3.8 13.1 M5.4 14.6 L7.5 14 M18.6 14.6 L20.2 13.1 M18.6 14.6 L16.5 14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="5.6" r="2.2" fill="none" stroke="currentColor" stroke-width="1.9"/></symbol>
<symbol id="i-supply" viewBox="0 0 24 24"><rect x="7" y="4.8" width="10" height="14.4" rx="3.4" fill="currentColor" stroke="var(--ink)" stroke-width="1.1"/><path d="M7 9.3 H17 M7 14.7 H17" stroke="var(--ink)" stroke-width="1.3"/></symbol>
<symbol id="i-coin" viewBox="0 0 24 24"><path d="M4 19.5 C4 13 6.5 9.8 10.5 9.8 C12.6 9.8 14.1 11 14.8 12.8 L14.8 8.2 C14.8 6 16 4.6 17.6 4.6 C19.3 4.6 20.5 5.9 20.5 7.6 L20.5 19.5 Z" fill="currentColor" stroke="var(--ink)" stroke-width="1.1" stroke-linejoin="round"/></symbol>`,
  },

  modern2026: {
    token: 'square',
    defs: `${ORD_SHARED}
<symbol id="i-unit-infantry" viewBox="0 0 24 24"><rect x="4" y="6.5" width="16" height="11" rx="1" fill="currentColor" stroke="var(--ink)" stroke-width="1.1"/><path d="M4.9 7.4 L19.1 16.6 M19.1 7.4 L4.9 16.6" stroke="var(--ink)" stroke-width="1.7"/></symbol>
<symbol id="i-unit-cavalry" viewBox="0 0 24 24"><rect x="4" y="6.5" width="16" height="11" rx="1" fill="currentColor" stroke="var(--ink)" stroke-width="1.1"/><ellipse cx="12" cy="12" rx="5.4" ry="3.3" fill="none" stroke="var(--ink)" stroke-width="1.7"/></symbol>
<symbol id="i-unit-warship" viewBox="0 0 24 24"><path d="M2.5 12.5 H16.5 L21.5 10 L19.8 14.6 C15.5 16.8 7.5 16.8 4.2 14.6 Z" fill="currentColor" stroke="var(--ink)" stroke-width="1"/><rect x="8" y="8.6" width="5.4" height="3.9" fill="currentColor" stroke="var(--ink)" stroke-width="1"/></symbol>
<symbol id="i-unit-siege_engine" viewBox="0 0 24 24"><rect x="4" y="6.5" width="16" height="11" rx="1" fill="currentColor" stroke="var(--ink)" stroke-width="1.1"/><circle cx="12" cy="12" r="2.9" fill="var(--ink)"/></symbol>
<symbol id="i-fort-castle" viewBox="0 0 24 24"><polygon points="12,4 20.5,10.2 17.2,20 6.8,20 3.5,10.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></symbol>
<symbol id="i-fort-citadel" viewBox="0 0 24 24"><polygon points="12,3.5 21,10 17.5,20.5 6.5,20.5 3,10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><polygon points="12,9 15.6,11.6 14.2,15.8 9.8,15.8 8.4,11.6" fill="currentColor"/></symbol>
<symbol id="i-port" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 9 V17.4 M8.6 11.3 H15.4 M7.3 14.4 C8.6 17.2 15.4 17.2 16.7 14.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="7" r="1.7" fill="none" stroke="currentColor" stroke-width="1.7"/></symbol>
<symbol id="i-supply" viewBox="0 0 24 24"><rect x="5.8" y="6.8" width="12.4" height="12.4" rx="1.4" fill="currentColor" stroke="var(--ink)" stroke-width="1.1"/><path d="M8 6.8 V4.4 H13.4" fill="none" stroke="var(--ink)" stroke-width="1.6"/><path d="M6.4 18.4 L17.6 7.6" stroke="var(--ink)" stroke-width="1.4"/></symbol>
<symbol id="i-coin" viewBox="0 0 24 24"><path d="M4 19.5 C4 13 6.5 9.8 10.5 9.8 C12.6 9.8 14.1 11 14.8 12.8 L14.8 8.2 C14.8 6 16 4.6 17.6 4.6 C19.3 4.6 20.5 5.9 20.5 7.6 L20.5 19.5 Z" fill="currentColor" stroke="var(--ink)" stroke-width="1.1" stroke-linejoin="round"/></symbol>`,
  },
};

export const REQUIRED_ICONS = [
  'i-unit-infantry', 'i-unit-cavalry', 'i-unit-warship', 'i-unit-siege_engine',
  'i-fort-castle', 'i-fort-citadel', 'i-port', 'i-supply', 'i-coin',
  'i-ord-march', 'i-ord-defend', 'i-ord-support', 'i-ord-raid', 'i-ord-rally', 'i-ord-back',
];

/** Swap the active set's <defs> into an svg. Stable ids: callers never care. */
export function injectIcons(svg, setId) {
  const set = ICON_SETS[setId] || ICON_SETS.core;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = set.defs;
  svg.appendChild(defs);
  return set;
}
