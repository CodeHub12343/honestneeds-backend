/**
 * TASK-7.8 — 100 concurrent RSVPs against capacity 10 must leave exactly
 * 10 confirmed and 90 waitlisted. The invariant is enforced by the atomic
 * `$lt` + `$inc` pattern inside the service.
 */

const path = require('path');
const mongoose = require('mongoose');

let describeFn = describe;
let MongoMemoryServer;
try {
  MongoMemoryServer = require('mongodb-memory-server').MongoMemoryServer;
} catch {
  describeFn = describe.skip;
}

describeFn('VeteranActivityService — capacity invariant', () => {
  let mongod;
  let User;
  let VeteranActivity;
  let VeteranActivityRSVP;
  let VeteranActivityService;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), {});
    User = require(path.resolve(__dirname, '../../src/models/User'));
    const VA = require(path.resolve(__dirname, '../../src/models/VeteranActivity'));
    VeteranActivity = VA.VeteranActivity;
    VeteranActivityRSVP = VA.VeteranActivityRSVP;
    VeteranActivityService = require(path.resolve(
      __dirname,
      '../../src/services/veterans/VeteranActivityService'
    ));
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  test('100 RSVPs with capacity 10 → 10 confirmed, 90 waitlisted', async () => {
    const host = await User.create({
      email: 'host@x.com',
      password_hash: 'password123',
      display_name: 'Host Vet',
      veteran_profile: { is_veteran: true },
    });
    const activity = await VeteranActivity.create({
      host_id: host._id,
      title: 'Coffee + muster',
      starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      capacity: 10,
    });

    const users = await User.insertMany(
      Array.from({ length: 100 }, (_, i) => ({
        email: `u${i}@x.com`,
        password_hash: 'password123',
        display_name: `User ${String(i).padStart(3, '0')}`,
        veteran_profile: { is_veteran: true },
      }))
    );

    const results = await Promise.all(
      users.map((u) =>
        VeteranActivityService.rsvp({ userId: u._id, activityId: activity._id }).catch((e) => e)
      )
    );

    const confirmed = results.filter((r) => r && r.status === 'confirmed').length;
    const waitlisted = results.filter((r) => r && r.status === 'waitlisted').length;

    expect(confirmed).toBe(10);
    expect(waitlisted).toBe(90);

    const after = await VeteranActivity.findById(activity._id);
    expect(after.confirmed_count).toBe(10);
    expect(after.confirmed_count).toBeLessThanOrEqual(after.capacity);

    const dbCounts = {
      confirmed: await VeteranActivityRSVP.countDocuments({ activity_id: activity._id, status: 'confirmed' }),
      waitlisted: await VeteranActivityRSVP.countDocuments({ activity_id: activity._id, status: 'waitlisted' }),
    };
    expect(dbCounts.confirmed).toBe(10);
    expect(dbCounts.waitlisted).toBe(90);
  });
});
