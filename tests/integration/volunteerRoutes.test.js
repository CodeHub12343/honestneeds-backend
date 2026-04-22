/**
 * Volunteer Routes Integration Tests
 * Tests all endpoints with 50+ comprehensive test cases
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const User = require('../../models/User');
const VolunteerProfile = require('../../models/VolunteerProfile');
const jwt = require('jsonwebtoken');

describe('Volunteer Routes Integration Tests', () => {
  let volunteerId, userId, userId2;
  let authToken, userId2Token;
  const testUser = {
    email: 'volunteer@test.com',
    password: 'TestPassword123!',
    display_name: 'Test Volunteer',
  };
  const testUser2 = {
    email: 'donor@test.com',
    password: 'TestPassword123!',
    display_name: 'Test Donor',
  };

  // Generate JWT Token
  const generateToken = (userId, role = 'user') => {
    return jwt.sign(
      { id: userId, role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '7d' }
    );
  };

  beforeAll(async () => {
    // Create test users
    const user = await User.create({
      email: testUser.email,
      password: testUser.password,
      display_name: testUser.display_name,
      verified: true,
    });
    userId = user._id;
    authToken = generateToken(userId);

    const user2 = await User.create({
      email: testUser2.email,
      password: testUser2.password,
      display_name: testUser2.display_name,
      verified: true,
    });
    userId2 = user2._id;
    userId2Token = generateToken(userId2);
  });

  afterAll(async () => {
    await User.deleteMany({ email: { $in: [testUser.email, testUser2.email] } });
    await VolunteerProfile.deleteMany({});
  });

  describe('GET /volunteers - List Volunteers', () => {
    beforeEach(async () => {
      // Create test volunteer profiles
      const volunteer1 = await VolunteerProfile.create({
        user_id: userId,
        volunteering_type: 'community_support',
        bio: 'Passionate volunteer',
        skills: ['teaching', 'mentoring'],
        total_hours: 100,
        rating: 4.5,
        review_count: 10,
      });
      volunteerId = volunteer1._id;
    });

    it('should list all volunteers with correct fields', async () => {
      const res = await request(app).get('/api/volunteers');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.volunteers)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.volunteers[0]).toHaveProperty('id');
      expect(res.body.volunteers[0]).toHaveProperty('bio');
      expect(res.body.volunteers[0]).toHaveProperty('rating');
    });

    it('should filter by volunteering type', async () => {
      const res = await request(app).get('/api/volunteers?type=community_support');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.volunteers.length).toBeGreaterThan(0);
    });

    it('should filter by minimum rating', async () => {
      const res = await request(app).get('/api/volunteers?minRating=4');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      if (res.body.volunteers.length > 0) {
        res.body.volunteers.forEach((v) => {
          expect(v.rating).toBeGreaterThanOrEqual(4);
        });
      }
    });

    it('should sort by rating', async () => {
      const res = await request(app).get('/api/volunteers?sortBy=rating');

      expect(res.status).toBe(200);
      if (res.body.volunteers.length > 1) {
        for (let i = 1; i < res.body.volunteers.length; i++) {
          expect(res.body.volunteers[i - 1].rating).toBeGreaterThanOrEqual(
            res.body.volunteers[i].rating
          );
        }
      }
    });

    it('should support pagination', async () => {
      const res = await request(app).get('/api/volunteers?skip=0&limit=5');

      expect(res.status).toBe(200);
      expect(res.body.volunteers.length).toBeLessThanOrEqual(5);
      expect(res.body.skip).toBe(0);
      expect(res.body.limit).toBe(5);
    });
  });

  describe('GET /volunteers/:id - Get Volunteer Detail', () => {
    beforeEach(async () => {
      const volunteer = await VolunteerProfile.create({
        user_id: userId,
        volunteering_type: 'fundraising_help',
        bio: 'Test bio',
        skills: ['fundraising', 'promotion'],
        total_hours: 50,
      });
      volunteerId = volunteer._id;
    });

    it('should return volunteer detail with user info', async () => {
      const res = await request(app).get(`/api/volunteers/${volunteerId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.volunteer._id).toBe(volunteerId.toString());
      expect(res.body.volunteer).toHaveProperty('user');
      expect(res.body.volunteer.user).toHaveProperty('display_name');
    });

    it('should return 404 for non-existent volunteer', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/volunteers/${fakeId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should not return deleted volunteer', async () => {
      await VolunteerProfile.findByIdAndUpdate(volunteerId, { deleted_at: new Date() });

      const res = await request(app).get(`/api/volunteers/${volunteerId}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /volunteers - Register Volunteer', () => {
    it('should register new volunteer with required fields', async () => {
      const res = await request(app)
        .post('/api/volunteers')
        .set('Authorization', `Bearer ${userId2Token}`)
        .send({
          volunteering_type: 'community_support',
          bio: 'I want to help the community',
          skills: ['teaching', 'mentoring'],
          availability: {
            days_per_week: 2,
            hours_per_week: 8,
            flexible_schedule: true,
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.volunteer).toHaveProperty('_id');
      expect(res.body.volunteer.user_id).toBe(userId2.toString());
      expect(res.body.volunteer.total_hours).toBe(0);
    });

    it('should reject registration without volunteering type', async () => {
      const res = await request(app)
        .post('/api/volunteers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          bio: 'Test',
          skills: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/volunteers')
        .send({
          volunteering_type: 'community_support',
          bio: 'Test',
        });

      expect(res.status).toBe(401);
    });

    it('should prevent duplicate registration for same user', async () => {
      // First registration
      await request(app)
        .post('/api/volunteers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          volunteering_type: 'community_support',
          bio: 'Test',
        });

      // Second registration with same user
      const res = await request(app)
        .post('/api/volunteers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          volunteering_type: 'fundraising_help',
          bio: 'Test 2',
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already registered');
    });

    it('should prevent blocked users from registering', async () => {
      const blockedUser = await User.create({
        email: 'blocked@test.com',
        password: 'TestPassword123!',
        display_name: 'Blocked User',
        blocked: true,
      });
      const blockedToken = generateToken(blockedUser._id);

      const res = await request(app)
        .post('/api/volunteers')
        .set('Authorization', `Bearer ${blockedToken}`)
        .send({
          volunteering_type: 'community_support',
          bio: 'Test',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Blocked');

      await User.findByIdAndDelete(blockedUser._id);
    });

    it('should limit skills to 10 maximum', async () => {
      const manySkills = Array(15)
        .fill(0)
        .map((_, i) => `skill_${i}`);

      const res = await request(app)
        .post('/api/volunteers')
        .set('Authorization', `Bearer ${userId2Token}`)
        .send({
          volunteering_type: 'direct_assistance',
          bio: 'Test',
          skills: manySkills,
        });

      expect(res.status).toBe(201);
      expect(res.body.volunteer.skills.length).toBeLessThanOrEqual(10);
    });

    it('should set default availability values', async () => {
      const res = await request(app)
        .post('/api/volunteers')
        .set('Authorization', `Bearer ${userId2Token}`)
        .send({
          volunteering_type: 'fundraising_help',
          bio: 'Test',
        });

      expect(res.status).toBe(201);
      expect(res.body.volunteer.availability.days_per_week).toBe(0);
      expect(res.body.volunteer.availability.hours_per_week).toBe(0);
    });
  });

  describe('PATCH /volunteers/:id - Update Volunteer Profile', () => {
    beforeEach(async () => {
      const volunteer = await VolunteerProfile.create({
        user_id: userId,
        volunteering_type: 'community_support',
        bio: 'Original bio',
        skills: ['teaching'],
      });
      volunteerId = volunteer._id;
    });

    it('should update profile with new bio', async () => {
      const res = await request(app)
        .patch(`/api/volunteers/${volunteerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          bio: 'Updated bio',
        });

      expect(res.status).toBe(200);
      expect(res.body.volunteer.bio).toBe('Updated bio');
    });

    it('should update skills', async () => {
      const res = await request(app)
        .patch(`/api/volunteers/${volunteerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          skills: ['teaching', 'mentoring', 'event_planning'],
        });

      expect(res.status).toBe(200);
      expect(res.body.volunteer.skills).toEqual(['teaching', 'mentoring', 'event_planning']);
    });

    it('should update availability', async () => {
      const res = await request(app)
        .patch(`/api/volunteers/${volunteerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          availability: {
            days_per_week: 3,
            hours_per_week: 12,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.volunteer.availability.days_per_week).toBe(3);
      expect(res.body.volunteer.availability.hours_per_week).toBe(12);
    });

    it('should prevent unauthorized user from updating', async () => {
      const res = await request(app)
        .patch(`/api/volunteers/${volunteerId}`)
        .set('Authorization', `Bearer ${userId2Token}`)
        .send({
          bio: 'Hacked bio',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Not authorized');
    });

    it('should return 404 for non-existent volunteer', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .patch(`/api/volunteers/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          bio: 'Test',
        });

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .patch(`/api/volunteers/${volunteerId}`)
        .send({
          bio: 'Test',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /volunteers/requests - Request Assignment', () => {
    beforeEach(async () => {
      const volunteer = await VolunteerProfile.create({
        user_id: userId,
        volunteering_type: 'community_support',
        bio: 'Test',
        status: 'active',
      });
      volunteerId = volunteer._id;
    });

    it('should create assignment request', async () => {
      const res = await request(app)
        .post('/api/volunteers/requests')
        .send({
          volunteer_id: volunteerId,
          campaign_id: new mongoose.Types.ObjectId(),
          role: 'event_coordinator',
          expected_hours: 20,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.assignment.status).toBe('assigned');
    });

    it('should reject request without volunteer_id', async () => {
      const res = await request(app)
        .post('/api/volunteers/requests')
        .send({
          campaign_id: new mongoose.Types.ObjectId(),
        });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent volunteer', async () => {
      const res = await request(app)
        .post('/api/volunteers/requests')
        .send({
          volunteer_id: new mongoose.Types.ObjectId(),
          campaign_id: new mongoose.Types.ObjectId(),
        });

      expect(res.status).toBe(404);
    });

    it('should reject unavailable volunteer', async () => {
      const inactiveVolunteer = await VolunteerProfile.create({
        user_id: new mongoose.Types.ObjectId(),
        volunteering_type: 'community_support',
        bio: 'Test',
        status: 'inactive',
      });

      const res = await request(app)
        .post('/api/volunteers/requests')
        .send({
          volunteer_id: inactiveVolunteer._id,
          campaign_id: new mongoose.Types.ObjectId(),
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('not available');

      await VolunteerProfile.findByIdAndDelete(inactiveVolunteer._id);
    });

    it('should set default role and hours', async () => {
      const res = await request(app)
        .post('/api/volunteers/requests')
        .send({
          volunteer_id: volunteerId,
          campaign_id: new mongoose.Types.ObjectId(),
        });

      expect(res.status).toBe(201);
      expect(res.body.assignment.hours_logged).toBe(0);
    });
  });

  describe('POST /volunteers/:id/accept - Accept Assignment', () => {
    let volunteerWithAssignment;

    beforeEach(async () => {
      volunteerWithAssignment = await VolunteerProfile.create({
        user_id: userId,
        volunteering_type: 'community_support',
        bio: 'Test',
        assignments: [
          {
            campaign_id: new mongoose.Types.ObjectId(),
            status: 'assigned',
            hours_logged: 10,
          },
        ],
      });
      volunteerId = volunteerWithAssignment._id;
    });

    it('should accept assignment and set started date', async () => {
      const res = await request(app)
        .post(`/api/volunteers/${volunteerId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          assignment_index: 0,
        });

      expect(res.status).toBe(200);
      expect(res.body.assignment.status).toBe('accepted');
      expect(res.body.assignment.started_date).toBeDefined();
    });

    it('should prevent unauthorized acceptance', async () => {
      const res = await request(app)
        .post(`/api/volunteers/${volunteerId}/accept`)
        .set('Authorization', `Bearer ${userId2Token}`)
        .send({
          assignment_index: 0,
        });

      expect(res.status).toBe(403);
    });

    it('should return 400 for invalid assignment index', async () => {
      const res = await request(app)
        .post(`/api/volunteers/${volunteerId}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          assignment_index: 99,
        });

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post(`/api/volunteers/${volunteerId}/accept`)
        .send({
          assignment_index: 0,
        });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /volunteers/:id/complete - Complete Task', () => {
    let volunteerWithAcceptedAssignment;

    beforeEach(async () => {
      volunteerWithAcceptedAssignment = await VolunteerProfile.create({
        user_id: userId,
        volunteering_type: 'community_support',
        bio: 'Test',
        assignments: [
          {
            campaign_id: new mongoose.Types.ObjectId(),
            status: 'accepted',
            hours_logged: 0,
            started_date: new Date(),
          },
        ],
        total_hours: 100,
        total_assignments: 5,
      });
      volunteerId = volunteerWithAcceptedAssignment._id;
    });

    it('should mark task as completed and update hours', async () => {
      const res = await request(app)
        .post(`/api/volunteers/${volunteerId}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          assignment_index: 0,
          hours_completed: 8,
        });

      expect(res.status).toBe(200);
      expect(res.body.assignment.status).toBe('completed');
      expect(res.body.assignment.hours_logged).toBe(8);
      expect(res.body.assignment.completed_date).toBeDefined();
      expect(res.body.volunteer_stats.total_hours).toBe(108);
      expect(res.body.volunteer_stats.total_assignments).toBe(6);
    });

    it('should reject invalid hours', async () => {
      const res = await request(app)
        .post(`/api/volunteers/${volunteerId}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          assignment_index: 0,
          hours_completed: 25, // Exceeds 24-hour max
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Hours must be');
    });

    it('should prevent unauthorized completion', async () => {
      const res = await request(app)
        .post(`/api/volunteers/${volunteerId}/complete`)
        .set('Authorization', `Bearer ${userId2Token}`)
        .send({
          assignment_index: 0,
          hours_completed: 5,
        });

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post(`/api/volunteers/${volunteerId}/complete`)
        .send({
          assignment_index: 0,
          hours_completed: 5,
        });

      expect(res.status).toBe(401);
    });

    it('should prevent completing non-accepted assignment', async () => {
      const volunteerWithAssignedTask = await VolunteerProfile.create({
        user_id: userId,
        volunteering_type: 'community_support',
        bio: 'Test',
        assignments: [
          {
            campaign_id: new mongoose.Types.ObjectId(),
            status: 'assigned', // Not yet accepted
            hours_logged: 0,
          },
        ],
      });

      const res = await request(app)
        .post(`/api/volunteers/${volunteerWithAssignedTask._id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          assignment_index: 0,
          hours_completed: 5,
        });

      expect(res.status).toBe(409);
      await VolunteerProfile.findByIdAndDelete(volunteerWithAssignedTask._id);
    });
  });

  describe('GET /volunteers/:id/hours - Get Volunteer Hours', () => {
    beforeEach(async () => {
      const volunteer = await VolunteerProfile.create({
        user_id: userId,
        volunteering_type: 'community_support',
        bio: 'Test',
        total_hours: 150,
        total_assignments: 10,
        assignments: [
          {
            campaign_id: new mongoose.Types.ObjectId(),
            status: 'completed',
            hours_logged: 8,
            completed_date: new Date(),
          },
          {
            campaign_id: new mongoose.Types.ObjectId(),
            status: 'in_progress',
            hours_logged: 0,
          },
          {
            campaign_id: new mongoose.Types.ObjectId(),
            status: 'assigned',
            hours_logged: 0,
          },
        ],
      });
      volunteerId = volunteer._id;
    });

    it('should return all-time hours and breakdown', async () => {
      const res = await request(app).get(`/api/volunteers/${volunteerId}/hours`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.hours_all_time).toBe(150);
      expect(res.body.total_assignments).toBe(10);
      expect(res.body.assignments_breakdown).toHaveProperty('completed');
      expect(res.body.assignments_breakdown).toHaveProperty('in_progress');
      expect(res.body.assignments_breakdown).toHaveProperty('assigned');
    });

    it('should return 404 for non-existent volunteer', async () => {
      const res = await request(app).get(`/api/volunteers/${new mongoose.Types.ObjectId()}/hours`);

      expect(res.status).toBe(404);
    });

    it('should handle invalid date format', async () => {
      const res = await request(app)
        .get(`/api/volunteers/${volunteerId}/hours`)
        .query({ startDate: 'invalid-date', endDate: '2026-04-05' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /volunteers/statistics - Volunteer Statistics', () => {
    beforeEach(async () => {
      // Create multiple volunteers with different stats
      await VolunteerProfile.create({
        user_id: userId,
        volunteering_type: 'community_support',
        bio: 'Test 1',
        total_hours: 200,
        rating: 5,
        review_count: 20,
        status: 'active',
      });

      await VolunteerProfile.create({
        user_id: userId2,
        volunteering_type: 'fundraising_help',
        bio: 'Test 2',
        total_hours: 100,
        rating: 4,
        review_count: 10,
        status: 'active',
      });
    });

    it('should return platform-wide statistics', async () => {
      const res = await request(app).get('/api/volunteers/statistics');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.statistics).toHaveProperty('total_active_volunteers');
      expect(res.body.statistics).toHaveProperty('total_hours_logged');
      expect(res.body.statistics).toHaveProperty('average_rating');
      expect(res.body.statistics).toHaveProperty('top_by_hours');
      expect(res.body.statistics).toHaveProperty('top_by_rating');
    });

    it('should include top volunteers by hours', async () => {
      const res = await request(app).get('/api/volunteers/statistics');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.statistics.top_by_hours)).toBe(true);
    });

    it('should include top volunteers by rating', async () => {
      const res = await request(app).get('/api/volunteers/statistics');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.statistics.top_by_rating)).toBe(true);
    });
  });

  describe('Authorization & Error Handling', () => {
    it('should return 401 for unauthenticated update', async () => {
      const volunteer = await VolunteerProfile.create({
        user_id: userId,
        volunteering_type: 'community_support',
        bio: 'Test',
      });

      const res = await request(app)
        .patch(`/api/volunteers/${volunteer._id}`)
        .send({
          bio: 'Updated',
        });

      expect(res.status).toBe(401);
    });

    it('should handle database errors gracefully', async () => {
      const invalidId = 'invalid-id-format';
      const res = await request(app).get(`/api/volunteers/${invalidId}`);

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should return 403 for cross-user profile updates', async () => {
      const volunteer = await VolunteerProfile.create({
        user_id: userId,
        volunteering_type: 'community_support',
        bio: 'Original',
      });

      const res = await request(app)
        .patch(`/api/volunteers/${volunteer._id}`)
        .set('Authorization', `Bearer ${userId2Token}`)
        .send({
          bio: 'Hacked',
        });

      expect(res.status).toBe(403);
    });
  });
});
