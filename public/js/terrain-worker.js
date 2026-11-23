import { generateChunk } from './core/world.js';
self.onmessage = ({ data }) => {
  const chunk = generateChunk(data.seed, data.cx, data.cz, data.segments);
  self.postMessage({ ...chunk, generation: data.generation }, [chunk.positions.buffer, chunk.colors.buffer, chunk.indices.buffer, chunk.trees.buffer, chunk.rocks.buffer,chunk.broadleaf.buffer,chunk.shrubs.buffer]);
};
