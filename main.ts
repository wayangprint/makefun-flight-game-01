// Merpati Valley Run — hand-in driver.
//
// The program takes this repository's playable game and its screenshots
// and stages them for the grader: game/ and screenshots/ are mirrored
// into the output directory, and dossier.json — the summary the judge
// reads — is produced there with the vendored make.fun library.
//
// It runs on Node 22 with the standard library only, and needs no
// network and no build step:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Without MAKEFUN_OUTPUT_DIR it writes to /output, the grader's folder.
// The game itself stays plain static files: a desktop browser opens
// game/index.html offline, no library, no request leaving the machine.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Where this file lives, and where the staged entry must land.
const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own ceilings, passed straight through to the dossier
// builder: only the text cap shapes bytes; the rest refuse an entry
// the scorer would refuse — more than four screenshots or one over
// 256 KiB, more than 993 files under game/ or 48 MiB of game files
// in total, or any path under game/ longer than 1000 bytes.
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// The grader refuses any output path that is not a plain relative
// name: a dotfile mirrored into the output (screenshots/.gitkeep, left
// over from creating the folder on GitHub) fails its run_completes
// check outright. Keep every staged copy free of dotfiles and dot
// folders, so a placeholder the repository happens to carry can never
// reach the output again.
function keepVisibleEntry(sourcePath) {
  return !basename(sourcePath).startsWith('.');
}

function mirrorIfPresent(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true });
  if (existsSync(sourceDir)) {
    cpSync(sourceDir, targetDir, { recursive: true, filter: keepVisibleEntry });
  }
}

function stageEntry() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  cpSync(join(REPO_ROOT, 'game'), join(OUTPUT_DIR, 'game'), { recursive: true, filter: keepVisibleEntry });
  mirrorIfPresent(join(REPO_ROOT, 'screenshots'), join(OUTPUT_DIR, 'screenshots'));
  writeFileSync(
    join(OUTPUT_DIR, 'dossier.json'),
    buildDossier(OUTPUT_DIR, DOSSIER_LIMITS),
  );
}

stageEntry();
