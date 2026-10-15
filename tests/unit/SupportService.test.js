/**
 * SupportService — status machine, one-open-per-user, PII heuristic.
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

describeFn('SupportService', () => {
  let mongod;
  let User;
  let SupportService;
  let SupportTicket;
  let SupportMessage;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), {});
    User = require(path.resolve(__dirname, '../../src/models/User'));
    SupportService = require(path.resolve(__dirname, '../../src/services/SupportService'));
    const S = require(path.resolve(__dirname, '../../src/models/SupportTicket'));
    SupportTicket = S.SupportTicket;
    SupportMessage = S.SupportMessage;
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    // Partial unique indexes aren't rebuilt automatically after
    // dropDatabase — force them so the one-open-per-user constraint fires.
    await SupportTicket.syncIndexes();
    await SupportMessage.syncIndexes();
  });

  async function makeUser(email = 'u@x.com') {
    return User.create({
      email,
      password_hash: 'password123',
      display_name: 'Test User',
    });
  }

  async function makeStaff() {
    return User.create({
      email: 'staff@x.com',
      password_hash: 'password123',
      display_name: 'Staff Admin',
      role: 'admin',
      admin_roles: ['support'],
    });
  }

  test('createTicket + addMessage transitions open ↔ pending', async () => {
    const user = await makeUser();
    const staff = await makeStaff();

    const { ticket } = await SupportService.createTicket({
      userId: user._id,
      subject: 'Login issue',
      body: 'Cannot log in with my phone.',
      category: 'account',
    });
    expect(ticket.status).toBe('open');

    const r1 = await SupportService.addMessage({
      ticketId: ticket._id,
      authorId: staff._id,
      authorRole: 'staff',
      body: 'Have you tried the password reset flow?',
    });
    expect(r1.ticket.status).toBe('pending');
    expect(r1.ticket.first_response_at).toBeTruthy();

    const r2 = await SupportService.addMessage({
      ticketId: ticket._id,
      authorId: user._id,
      authorRole: 'user',
      body: 'Yes but the email never arrived.',
    });
    expect(r2.ticket.status).toBe('open');
  });

  test('one-open-per-user enforced by partial unique index', async () => {
    const user = await makeUser();
    await SupportService.createTicket({
      userId: user._id,
      subject: 'A',
      body: 'first',
    });
    await expect(
      SupportService.createTicket({
        userId: user._id,
        subject: 'B',
        body: 'second',
      })
    ).rejects.toMatchObject({ code: 'OPEN_TICKET_EXISTS' });
  });

  test('closed ticket cannot be replied to', async () => {
    const user = await makeUser();
    const { ticket } = await SupportService.createTicket({
      userId: user._id,
      subject: 'A',
      body: 'hi',
    });
    await SupportService.close({ ticketId: ticket._id, actorId: user._id });
    await expect(
      SupportService.addMessage({
        ticketId: ticket._id,
        authorId: user._id,
        authorRole: 'user',
        body: 'reopen pls',
      })
    ).rejects.toMatchObject({ code: 'TICKET_CLOSED' });
  });

  test('resolved → user reply within 7 days reopens', async () => {
    const user = await makeUser();
    const staff = await makeStaff();
    const { ticket } = await SupportService.createTicket({
      userId: user._id,
      subject: 'A',
      body: 'hi',
    });
    await SupportService.resolve({ ticketId: ticket._id, actorId: staff._id });

    const r = await SupportService.addMessage({
      ticketId: ticket._id,
      authorId: user._id,
      authorRole: 'user',
      body: 'actually still broken',
    });
    expect(r.ticket.status).toBe('open');
  });

  test('user cannot post to someone else\'s ticket', async () => {
    const u1 = await makeUser('a@x.com');
    const u2 = await makeUser('b@x.com');
    const { ticket } = await SupportService.createTicket({
      userId: u1._id,
      subject: 'A',
      body: 'hi',
    });
    await expect(
      SupportService.addMessage({
        ticketId: ticket._id,
        authorId: u2._id,
        authorRole: 'user',
        body: 'sneaky',
      })
    ).rejects.toMatchObject({ code: 'NOT_OWNER' });
  });

  test('PII heuristic flags SSN pattern without blocking', async () => {
    const user = await makeUser();
    const { ticket, pii_warn } = await SupportService.createTicket({
      userId: user._id,
      subject: 'Account',
      body: 'My SSN is 123-45-6789',
    });
    expect(pii_warn).toBe(true);
    expect(ticket.status).toBe('open'); // not blocked
  });

  test('internal staff message does not change user-facing status', async () => {
    const user = await makeUser();
    const staff = await makeStaff();
    const { ticket } = await SupportService.createTicket({
      userId: user._id,
      subject: 'A',
      body: 'hi',
    });
    const r = await SupportService.addMessage({
      ticketId: ticket._id,
      authorId: staff._id,
      authorRole: 'staff',
      body: 'internal note',
      internal: true,
    });
    expect(r.message.internal).toBe(true);
    const fresh = await SupportTicket.findById(ticket._id);
    expect(fresh.status).toBe('open'); // unchanged
  });
});
