import { readFile } from 'node:fs/promises';
import path from 'node:path';

const profilePath = process.argv[2];

if (!profilePath) {
  console.error('Usage: node scripts/summarizeCpuProfile.mjs <cpuprofile-path>');
  process.exit(1);
}

const profileContent = await readFile(profilePath, 'utf8');
const profile = JSON.parse(profileContent);

const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
const parentByNodeId = new Map();
const selfTimeByNodeId = new Map();
const inclusiveTimeByNodeId = new Map();

profile.nodes.forEach((node) => {
  (node.children || []).forEach((childId) => {
    parentByNodeId.set(childId, node.id);
  });
});

(profile.samples || []).forEach((sampleNodeId, index) => {
  const delta = profile.timeDeltas?.[index] || 0;
  selfTimeByNodeId.set(sampleNodeId, (selfTimeByNodeId.get(sampleNodeId) || 0) + delta);

  let currentNodeId = sampleNodeId;
  while (currentNodeId !== undefined) {
    inclusiveTimeByNodeId.set(currentNodeId, (inclusiveTimeByNodeId.get(currentNodeId) || 0) + delta);
    currentNodeId = parentByNodeId.get(currentNodeId);
  }
});

const toSummary = (entries, fieldName) => {
  return Array.from(entries)
    .map(([nodeId, timeMicroseconds]) => {
      const node = nodesById.get(nodeId);
      const callFrame = node?.callFrame || {};
      return {
        functionName: callFrame.functionName || '(anonymous)',
        lineNumber: callFrame.lineNumber || 0,
        [fieldName]: timeMicroseconds / 1000,
        url: callFrame.url || '',
      };
    })
    .sort((left, right) => right[fieldName] - left[fieldName]);
};

const summarizedNodes = toSummary(selfTimeByNodeId.entries(), 'selfTimeMs');
const inclusiveNodes = toSummary(inclusiveTimeByNodeId.entries(), 'inclusiveTimeMs');

const projectNodes = summarizedNodes.filter((node) => {
  return node.url.includes(`${path.sep}src${path.sep}`) || node.url.includes('/src/');
});
const projectInclusiveNodes = inclusiveNodes.filter((node) => {
  return node.url.includes(`${path.sep}src${path.sep}`) || node.url.includes('/src/');
});

const printNodes = (title, nodes, timeFieldName) => {
  console.log(title);
  nodes.slice(0, 20).forEach((node) => {
    console.log(`${node[timeFieldName].toFixed(2).padStart(8)} ms  ${node.functionName}  ${node.url}:${node.lineNumber + 1}`);
  });
  console.log('');
};

printNodes('Top 20 self-time frames', summarizedNodes, 'selfTimeMs');
printNodes('Top 20 inclusive-time frames', inclusiveNodes, 'inclusiveTimeMs');
printNodes('Top 20 project self-time frames', projectNodes, 'selfTimeMs');
printNodes('Top 20 project inclusive-time frames', projectInclusiveNodes, 'inclusiveTimeMs');
