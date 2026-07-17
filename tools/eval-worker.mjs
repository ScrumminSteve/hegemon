// Worker for tools/eval.mjs — plays one fully-seeded game per message.
import { parentPort } from 'node:worker_threads';
import { playEvalGame } from './eval.mjs';

parentPort.on('message', spec => {
  try {
    parentPort.postMessage({ result: playEvalGame(spec) });
  } catch (e) {
    parentPort.postMessage({ error: e.message });
  }
});
