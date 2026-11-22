// SOLMAR BAY — dossier builder entrypoint. Run: node main.ts
// Writes dossier.json (makefun/dossier/v1) for the entry directory.
import { writeFileSync } from 'node:fs';
import { buildDossier } from './vendor/makefun-game.ts';

const dir = process.argv[2] ?? '.';
const dossier = buildDossier(dir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(dir + '/dossier.json', dossier);
console.log('dossier.json written (' + dossier.length + ' bytes)');
