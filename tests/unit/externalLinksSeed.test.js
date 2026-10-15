/**
 * TASK-8.2 — the Justice Lifts (and Battle Buddies) program entries defined
 * by scripts/migrations/2026-10-seed-external-links.js must stay stable:
 * labels, URLs and `kind` are referenced by the public footer and by the
 * TASK-8.1 DNS redirect. A snapshot catches an accidental copy change.
 */

const path = require('path');

// Load the module without running main() — the require only reads the
// top-level `DESIRED_PROGRAMS` constant, and main() is only invoked when
// the file is executed as a script (`require.main === module` is false
// under jest).
const SCRIPT_PATH = path.resolve(
  __dirname,
  '../../scripts/migrations/2026-10-seed-external-links.js'
);

// Pull DESIRED_PROGRAMS back out by reading the source — the script doesn't
// export anything, which keeps the seed single-purpose. Parsing the array
// literal with a scoped eval is the simplest stable way to assert the
// snapshot without introducing an export the production code doesn't need.
const fs = require('fs');
function readPrograms() {
  const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const match = src.match(/const DESIRED_PROGRAMS = (\[[\s\S]*?\]);/);
  if (!match) throw new Error('DESIRED_PROGRAMS literal not found');
  // eslint-disable-next-line no-new-func
  return new Function(`return ${match[1]}`)();
}

describe('external_links seed — program entries', () => {
  const programs = readPrograms();

  test('Justice Lifts entry is present with the correct shape', () => {
    const jl = programs.find((p) => p.kind === 'justice_lifts');
    expect(jl).toBeDefined();
    expect(jl.label).toBe('Justice Lifts');
    expect(jl.url).toBe('https://justicelifts.com');
  });

  test('Battle Buddies entry points at the apex that TASK-8.1 redirects', () => {
    const bb = programs.find((p) => p.kind === 'battle_buddies');
    expect(bb).toBeDefined();
    expect(bb.label).toBe('Battle Buddies for Vets');
    expect(bb.url).toBe('https://battlebuddiesforvets.com');
  });

  test('snapshot — shape frozen for the footer renderer', () => {
    expect(programs).toMatchSnapshot();
  });
});
