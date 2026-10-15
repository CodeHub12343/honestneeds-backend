/**
 * Pure scoring + pair-sort invariant for BattleBuddyMatchService.
 */

const BattleBuddyMatchService = require('../../src/services/veterans/BattleBuddyMatchService');
const BattleBuddyMatch = require('../../src/models/BattleBuddyMatch');

function user(overrides = {}) {
  return {
    _id: overrides._id || 'u',
    veteran_profile: {
      is_veteran: true,
      consent_to_match: true,
      branch: null,
      interests: [],
      looking_for: [],
      location: { geo: { type: 'Point', coordinates: undefined } },
      ...overrides.veteran_profile,
    },
  };
}

describe('scoreCandidate', () => {
  test('same branch awards 20 branch points', () => {
    const a = user({ veteran_profile: { branch: 'army' } });
    const b = user({ veteran_profile: { branch: 'army' } });
    const { score, breakdown } = BattleBuddyMatchService.scoreCandidate(a, b);
    expect(breakdown.branch).toBe(20);
    expect(score).toBeGreaterThanOrEqual(20);
  });

  test('same-family branch awards 10 branch points', () => {
    const a = user({ veteran_profile: { branch: 'navy' } });
    const b = user({ veteran_profile: { branch: 'marines' } });
    expect(BattleBuddyMatchService.scoreCandidate(a, b).breakdown.branch).toBe(10);
  });

  test('different branch families → 0 branch points', () => {
    const a = user({ veteran_profile: { branch: 'army' } });
    const b = user({ veteran_profile: { branch: 'air_force' } });
    expect(BattleBuddyMatchService.scoreCandidate(a, b).breakdown.branch).toBe(0);
  });

  test('shared interests award 3 points each, capped at 30', () => {
    const a = user({ veteran_profile: { interests: ['hiking', 'coffee', 'fishing', 'coding', 'photo', 'books', 'music', 'yoga', 'gaming', 'cars', 'cooking'] } });
    const b = user({ veteran_profile: { interests: ['hiking', 'coffee', 'fishing', 'coding', 'photo', 'books', 'music', 'yoga', 'gaming', 'cars', 'cooking'] } });
    expect(BattleBuddyMatchService.scoreCandidate(a, b).breakdown.interests).toBe(30);
  });

  test('no geo on either side → neutral 10 distance points', () => {
    const a = user();
    const b = user();
    expect(BattleBuddyMatchService.scoreCandidate(a, b).breakdown.distance).toBe(10);
  });

  test('very close coordinates → 40 distance points', () => {
    const a = user({ veteran_profile: { location: { geo: { type: 'Point', coordinates: [-73.9857, 40.7484] } } } });
    const b = user({ veteran_profile: { location: { geo: { type: 'Point', coordinates: [-73.9857, 40.7484] } } } });
    expect(BattleBuddyMatchService.scoreCandidate(a, b).breakdown.distance).toBe(40);
  });

  test('>200 km → 0 distance points', () => {
    const a = user({ veteran_profile: { location: { geo: { type: 'Point', coordinates: [-73.9857, 40.7484] } } } });
    const b = user({ veteran_profile: { location: { geo: { type: 'Point', coordinates: [-118.2437, 34.0522] } } } });
    expect(BattleBuddyMatchService.scoreCandidate(a, b).breakdown.distance).toBe(0);
  });

  test('score is 0..100', () => {
    const a = user({ veteran_profile: { branch: 'army', interests: ['x', 'y', 'z'], looking_for: ['friendship'] } });
    const b = user({ veteran_profile: { branch: 'army', interests: ['x', 'y', 'z'], looking_for: ['friendship'] } });
    const { score } = BattleBuddyMatchService.scoreCandidate(a, b);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('BattleBuddyMatch.orderPair sort invariant', () => {
  test('ordering is independent of argument order (property)', () => {
    const vals = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439099', 'aaaaaaaaaaaaaaaaaaaaaaaa'];
    for (let i = 0; i < vals.length; i++) {
      for (let j = i + 1; j < vals.length; j++) {
        const p1 = BattleBuddyMatch.orderPair(vals[i], vals[j]);
        const p2 = BattleBuddyMatch.orderPair(vals[j], vals[i]);
        expect(String(p1.user_a)).toBe(String(p2.user_a));
        expect(String(p1.user_b)).toBe(String(p2.user_b));
        expect(String(p1.user_a) < String(p1.user_b)).toBe(true);
      }
    }
  });
});
