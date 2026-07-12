// Minimal golden-test runner. Usage: npm test  (or: node tests/run.js)
import { tests as setupTests } from './setup.test.js';
import { tests as planningTests } from './planning.test.js';
import { tests as actionTests } from './action.test.js';
import { tests as combatTests } from './combat.test.js';
import { tests as cardsTests } from './cards.test.js';
import { tests as abilityTests } from './abilities.test.js';
import { tests as faqTests } from './faq.test.js';

const suites = [['setup', setupTests], ['planning', planningTests], ['action', actionTests], ['combat', combatTests], ['cards', cardsTests], ['abilities', abilityTests], ['faq', faqTests]];
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
