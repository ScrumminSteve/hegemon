// ---------------------------------------------------------------------------
// THE SHADOW CROWN (m3e55) — the possessed Nemesis. OWNER RULING, Aug 25 2026:
// both models ruled in — the Nemesis (one strong hidden opponent over five
// equals) and its possessed form: "like a good horror possessor, it can
// shift to another house — the one in the strongest position to win —
// without the player understanding what happened."
//
// Mechanics: one CROWN BRAIN (the shipped champion, V5+) inhabits whichever
// bot seat the evaluator ranks strongest; the other bot seats wear personas
// (calibrated costumes from the opponent pool). The possession re-evaluates
// each round, hops only after a cooldown (the player's blows must MEAN
// something before the ghost escapes), and never announces its host.
// It is NOT rubber-banding: intelligence follows strength earned on the
// board — the demon makes the strongest house smart, never a weak house
// strong. tableLeader()/rankFactions() (Package C) is its sense of where
// to live; the fixed Nemesis is this controller with hopping disabled
// (cooldown: Infinity).
// ---------------------------------------------------------------------------

import { rankFactions } from './evaluate.js';
import { createHeuristicAgent } from './heuristic.js';
import { PROFILES, profileAgentOpts } from './profiles.js';

export const DEFAULT_CAST = ['blitz', 'crescendo', 'denial', 'prey'];

export function createShadowCrown({ seed = 1, cooldown = 2, cast = DEFAULT_CAST } = {}) {
  const crown = createHeuristicAgent({ jitterSeed: (seed * 977) | 0 });
  const personaBySeat = new Map();
  const st = { host: null, lastHop: -Infinity, hops: [] };

  function personaFor(fid, idx) {
    if (!personaBySeat.has(fid)) {
      const name = cast[idx % cast.length];
      if (!PROFILES[name]) throw new Error(`shadow crown: unknown persona '${name}'`);
      personaBySeat.set(fid, createHeuristicAgent({ ...profileAgentOpts(name), jitterSeed: (seed * 131 + idx) | 0 }));
    }
    return personaBySeat.get(fid);
  }

  return {
    /** Re-evaluate the possession. Call whenever convenient (cheap after the
        first call each round); hops occur only when the cooldown allows and
        the strongest bot seat has changed. Returns { host, hopped }. */
    consult(state, botSeats) {
      if (!botSeats?.length) return { host: st.host, hopped: false };
      if (st.host === null) {
        st.host = rankFactions(state).find(r => botSeats.includes(r.fid))?.fid ?? botSeats[0];
        st.lastHop = state.round ?? 1;
        return { host: st.host, hopped: false }; // birth, not a hop — no omen
      }
      if (!botSeats.includes(st.host)) {
        // the host seat became human (takeover) — the demon flees immediately
        st.host = rankFactions(state).find(r => botSeats.includes(r.fid))?.fid ?? botSeats[0];
        st.lastHop = state.round ?? 1;
        st.hops.push({ round: state.round, to: st.host, fled: true });
        return { host: st.host, hopped: true };
      }
      if ((state.round ?? 1) - st.lastHop < cooldown) return { host: st.host, hopped: false };
      const strongest = rankFactions(state).find(r => botSeats.includes(r.fid))?.fid;
      if (strongest && strongest !== st.host) {
        st.host = strongest;
        st.lastHop = state.round ?? 1;
        st.hops.push({ round: state.round, to: strongest });
        return { host: st.host, hopped: true };
      }
      return { host: st.host, hopped: false };
    },
    /** The brain for a seat, under the current possession. */
    agentFor(fid, idx = 0) {
      return fid === st.host ? crown : personaFor(fid, idx);
    },
    host: () => st.host,
    hops: () => st.hops.slice(),
    _crown: crown, // exposed for goldens: identity check, never for play
  };
}
