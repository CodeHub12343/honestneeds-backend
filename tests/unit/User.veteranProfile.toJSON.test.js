/**
 * User.toJSON must strip discharge_type, mos, and DD-214 asset refs. The
 * self-only read is served via toSelfJSON which keeps mos + discharge_type
 * but still drops the raw DD-214 URL (that goes through a signed-URL path).
 */

const User = require('../../src/models/User');

describe('User.toJSON — veteran privacy', () => {
  function build() {
    return new User({
      email: 'v@example.com',
      password_hash: 'x',
      display_name: 'Vet',
      veteran_profile: {
        is_veteran: true,
        branch: 'army',
        mos: '11B',
        discharge_type: 'honorable',
        interests: ['hiking'],
        verified_via: 'idme',
        dd214_url: 'https://cloudinary/dd214.jpg',
        dd214_public_id: 'veterans/dd214/abc',
        consent_to_match: true,
      },
    });
  }

  test('public toJSON strips mos, discharge_type, dd214_*', () => {
    const u = build();
    const json = u.toJSON();
    const vp = json.veteran_profile;
    expect(vp.branch).toBe('army');
    expect(vp.is_veteran).toBe(true);
    expect(vp.interests).toEqual(['hiking']);
    expect(vp.mos).toBeUndefined();
    expect(vp.discharge_type).toBeUndefined();
    expect(vp.dd214_url).toBeUndefined();
    expect(vp.dd214_public_id).toBeUndefined();
    expect(json.password_hash).toBeUndefined();
  });

  test('serialising JSON.stringify also strips the private fields', () => {
    const dump = JSON.stringify(build());
    expect(dump).not.toContain('11B');
    expect(dump).not.toContain('honorable');
    expect(dump).not.toContain('dd214.jpg');
    expect(dump).not.toContain('veterans/dd214/abc');
  });

  test('toSelfJSON reveals mos + discharge_type to the owner', () => {
    const u = build();
    const self = u.toSelfJSON();
    expect(self.veteran_profile.mos).toBe('11B');
    expect(self.veteran_profile.discharge_type).toBe('honorable');
    // Even self-view does not include the raw asset URL — those are
    // re-signed on demand.
    expect(self.veteran_profile.dd214_url).toBeUndefined();
    expect(self.veteran_profile.dd214_public_id).toBeUndefined();
  });
});
