import { parentPort } from 'node:worker_threads';
import { verifyRace } from './verify-race.js';

parentPort.once('message', run => {
  try { parentPort.postMessage({ result: verifyRace(run) }); }
  catch (error) { parentPort.postMessage({ error: error.message }); }
});
