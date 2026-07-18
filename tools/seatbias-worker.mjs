// Worker for tools/seatbias.mjs — one fully-seeded symmetric game per message.
import { parentPort } from 'node:worker_threads';
import { playSymmetricGame } from './seatbias.mjs';

parentPort.on('message', seed => {
  try { parentPort.postMessage({ result: playSymmetricGame(seed), seed }); }
  catch (e) { parentPort.postMessage({ error: e.message, seed }); }
});
