// Minimal golden-test runner. Usage: npm test  (or: node tests/run.js)
import { tests as setupTests } from './setup.test.js';
import { tests as planningTests } from './planning.test.js';
import { tests as actionTests } from './action.test.js';
import { tests as combatTests } from './combat.test.js';
import { tests as cardsTests } from './cards.test.js';
import { tests as abilityTests } from './abilities.test.js';
import { tests as faqTests } from './faq.test.js';
import { tests as eventTests } from './events.test.js';
import { tests as musterTests } from './muster.test.js';
import { tests as themeTests } from './themes.test.js';
import { tests as biddingTests } from './bidding.test.js';
import { tests as invaderTests } from './invaders.test.js';
import { tests as victoryTests } from './victory.test.js';
import { tests as uiSmokeTests } from './ui-smoke.test.js';
import { tests as agentTests } from './agents.test.js';

const suites = [['setup', setupTests], ['planning', planningTests], ['action', actionTests], ['combat', combatTests], ['cards', cardsTests], ['abilities', abilityTests], ['faq', faqTests], ['events', eventTests], ['muster', musterTests], ['themes', themeTests], ['bidding', biddingTests], ['invaders', invaderTests], ['victory', victoryTests], ['ui-smoke', uiSmokeTests], ['agents', agentTests]];
let pass = 0, fail = 0;
for (const [suite, tests] of suites) {
  for (const t of tests) {
    try {
      await t.fn();
      pass++;
      console.log(`  ✓ [${suite}] ${t.name}`);
    } catch (e) {
      fail++;
      console.error(`  ✗ [${suite}] ${t.name}\n      ${e.message}`);
    }
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
