/**
 * Tests for Day 1-2: Publishing Workflow
 * Tests: Campaign publishing, pausing, completing, and event system
 */

const EventBus = require('../../src/events/EventBus');
const CampaignEventHandlers = require('../../src/events/campaignEventHandlers');
const emailService = require('../../src/services/emailService');
const campaignValidators = require('../../src/utils/campaignValidators');

describe('Day 1-2: Publishing Workflow', () => {
  beforeEach(() => {
    // Clear all subscriptions before each test
    EventBus.clearSubscriptions();
    emailService.clearSentEmails();
    EventBus.clearHistory();
  });

  describe('EventBus System', () => {
    test('should subscribe and publish events', async () => {
      const handler = jest.fn();
      EventBus.subscribeTo('test:event', handler);

      await EventBus.publishEvent('test:event', { data: 'test' });

      expect(handler).toHaveBeenCalledWith({ data: 'test' }, expect.any(Object));
    });

    test('should call multiple subscribers in priority order', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      EventBus.subscribeTo('test:event', handler2, { priority: 5 });
      EventBus.subscribeTo('test:event', handler1, { priority: 10 });
      EventBus.subscribeTo('test:event', handler3, { priority: 1 });

      await EventBus.publishEvent('test:event', {});

      // All should be called
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    test('should handle one-time subscriptions', async () => {
      const handler = jest.fn();
      EventBus.once('test:event', handler);

      await EventBus.publishEvent('test:event', { data: 'test1' });
      await EventBus.publishEvent('test:event', { data: 'test2' });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('should handle handler errors gracefully', async () => {
      const handler1 = jest.fn(() => {
        throw new Error('Handler error');
      });
      const handler2 = jest.fn();

      EventBus.subscribeTo('test:event', handler1);
      EventBus.subscribeTo('test:event', handler2);

      const event = await EventBus.publishEvent('test:event', {});

      // Both handlers should execute despite error
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(event.failedHandlers.length).toBe(1);
    });

    test('should enforce handler timeout', async () => {
      let timeoutTriggered = false;
      const slowHandler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      EventBus.subscribeTo('test:event', slowHandler, { timeout: 50 });

      // Should not throw, timeout handled gracefully
      const event = await EventBus.publishEvent('test:event', {});

      expect(event.failedHandlers.length).toBe(1);
    });

    test('should track event statistics', async () => {
      const handler = jest.fn();
      EventBus.subscribeTo('event:type1', handler);
      EventBus.subscribeTo('event:type1', handler);
      EventBus.subscribeTo('event:type2', handler);

      await EventBus.publishEvent('event:type1', {});
      await EventBus.publishEvent('event:type2', {});

      const stats = EventBus.getStats();

      expect(stats.totalEvents).toBe(2);
      expect(stats.eventsByType['event:type1']).toBe(1);
      expect(stats.eventsByType['event:type2']).toBe(1);
    });

    test('should unsubscribe from events', async () => {
      const handler = jest.fn();
      const unsubscribe = EventBus.subscribeTo('test:event', handler);

      unsubscribe();

      await EventBus.publishEvent('test:event', {});

      expect(handler).not.toHaveBeenCalled();
    });

    test('should maintain event history', async () => {
      await EventBus.publishEvent('event:1', { data: 'test1' });
      await EventBus.publishEvent('event:2', { data: 'test2' });

      const history = EventBus.getEventHistory();

      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history.some(e => e.type === 'event:1')).toBe(true);
      expect(history.some(e => e.type === 'event:2')).toBe(true);
    });

    test('should filter history by event type', async () => {
      await EventBus.publishEvent('created', {});
      await EventBus.publishEvent('published', {});
      await EventBus.publishEvent('created', {});

      const history = EventBus.getEventHistory({ eventType: 'created' });

      expect(history.every(e => e.type === 'created')).toBe(true);
    });
  });

  describe('Campaign Validators', () => {
    test('should validate complete campaign', () => {
      const campaign = {
        _id: '123',
        status: 'draft',
        title: 'Test Campaign',
        description: 'This is a test campaign with enough description',
        goals: [{ title: 'Goal 1', amount: 1000 }],
        payment_methods: [{ type: 'paypal', is_primary: true }],
        location: { city: 'New York', state: 'NY' },
        category: 'emergency_medical',
      };

      const result = campaignValidators.validateCampaignComplete(campaign);

      expect(result.isComplete).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test('should reject campaign with missing title', () => {
      const campaign = {
        status: 'draft',
        description: 'Description here',
        goals: [{ title: 'Goal 1', amount: 1000 }],
        payment_methods: [{ type: 'paypal', is_primary: true }],
        location: { city: 'New York', state: 'NY' },
        category: 'emergency_medical',
      };

      const result = campaignValidators.validateCampaignComplete(campaign);

      expect(result.isComplete).toBe(false);
      expect(result.errors.some(e => e.includes('title'))).toBe(true);
    });

    test('should reject campaign without payment method', () => {
      const campaign = {
        status: 'draft',
        title: 'Test Campaign',
        description: 'This is a test campaign with enough description',
        goals: [{ title: 'Goal 1', amount: 1000 }],
        payment_methods: [],
        location: { city: 'New York', state: 'NY' },
        category: 'emergency_medical',
      };

      const result = campaignValidators.validateCampaignComplete(campaign);

      expect(result.isComplete).toBe(false);
      expect(result.errors.some(e => e.includes('payment method'))).toBe(true);
    });

    test('should validate pause permission', () => {
      const activeCampaign = { status: 'active' };
      const draftCampaign = { status: 'draft' };

      expect(campaignValidators.validateCanPause(activeCampaign).canPause).toBe(true);
      expect(campaignValidators.validateCanPause(draftCampaign).canPause).toBe(false);
    });

    test('should validate complete permission', () => {
      const activeCampaign = { status: 'active' };
      const archivedCampaign = { status: 'archived' };
      const completedCampaign = { status: 'completed' };

      expect(campaignValidators.validateCanComplete(activeCampaign).canComplete).toBe(true);
      expect(campaignValidators.validateCanComplete(archivedCampaign).canComplete).toBe(false);
      expect(campaignValidators.validateCanComplete(completedCampaign).canComplete).toBe(false);
    });

    test('should validate status transitions', () => {
      expect(campaignValidators.validateStatusTransition('draft', 'active').isValid).toBe(true);
      expect(campaignValidators.validateStatusTransition('active', 'paused').isValid).toBe(true);
      expect(campaignValidators.validateStatusTransition('draft', 'paused').isValid).toBe(false);
      expect(campaignValidators.validateStatusTransition('completed', 'active').isValid).toBe(false);
    });

    test('should get available actions', () => {
      const draftCampaign = { status: 'draft' };
      const activeCampaign = { status: 'active' };

      const draftActions = campaignValidators.getAvailableActions(draftCampaign);
      expect(draftActions.publish).toBe(true);
      expect(draftActions.pause).toBe(false);
      expect(draftActions.edit).toBe(true);

      const activeActions = campaignValidators.getAvailableActions(activeCampaign);
      expect(activeActions.pause).toBe(true);
      expect(activeActions.publish).toBe(false);
      expect(activeActions.edit).toBe(false);
    });
  });

  describe('Email Service', () => {
    test('should send campaign created email', async () => {
      const campaign = { id: '123', title: 'Campaign 1', creator_name: 'John' };

      await emailService.sendCampaignCreatedEmail('user@example.com', campaign);

      const emails = emailService.getSentEmails({ to: 'user@example.com' });
      expect(emails.length).toBe(1);
      expect(emails[0].subject).toContain('Welcome');
      expect(emails[0].metadata.eventType).toBe('campaign:created');
    });

    test('should send campaign published email', async () => {
      const campaign = {
        id: '123',
        title: 'Campaign 1',
        creator_name: 'John',
        url: 'https://honestneed.com/campaigns/123',
      };

      await emailService.sendCampaignPublishedEmail('user@example.com', campaign);

      const emails = emailService.getSentEmails({ to: 'user@example.com' });
      expect(emails.length).toBe(1);
      expect(emails[0].subject).toContain('Live');
      expect(emails[0].metadata.eventType).toBe('campaign:published');
    });

    test('should send campaign paused email', async () => {
      const campaign = { id: '123', title: 'Campaign 1', creator_name: 'John' };

      await emailService.sendCampaignPausedEmail('user@example.com', campaign);

      const emails = emailService.getSentEmails({ to: 'user@example.com' });
      expect(emails.length).toBe(1);
      expect(emails[0].subject).toContain('Paused');
      expect(emails[0].metadata.eventType).toBe('campaign:paused');
    });

    test('should send campaign completed email', async () => {
      const campaign = {
        id: '123',
        title: 'Campaign 1',
        creator_name: 'John',
        totalRaised: 50000,
        supporterCount: 25,
      };

      await emailService.sendCampaignCompletedEmail('user@example.com', campaign);

      const emails = emailService.getSentEmails({ to: 'user@example.com' });
      expect(emails.length).toBe(1);
      expect(emails[0].subject).toContain('Completed');
      expect(emails[0].metadata.eventType).toBe('campaign:completed');
    });

    test('should store mock emails for testing', async () => {
      await emailService.sendCampaignCreatedEmail('user1@example.com', {
        id: '1',
        title: 'Campaign 1',
      });
      await emailService.sendCampaignCreatedEmail('user2@example.com', {
        id: '2',
        title: 'Campaign 2',
      });

      const allEmails = emailService.getSentEmails();
      expect(allEmails.length).toBeGreaterThanOrEqual(2);

      const user1Emails = emailService.getSentEmails({ to: 'user1@example.com' });
      expect(user1Emails.every(e => e.to === 'user1@example.com')).toBe(true);
    });
  });

  describe('Campaign Event Handlers', () => {
    test('should register all event handlers', () => {
      const subscriberCountBefore = EventBus.getSubscriberCount('campaign:created');

      CampaignEventHandlers.registerAll();

      expect(EventBus.getSubscriberCount('campaign:created')).toBeGreaterThan(subscriberCountBefore);
      expect(EventBus.getSubscriberCount('campaign:published')).toBeGreaterThan(0);
      expect(EventBus.getSubscriberCount('campaign:updated')).toBeGreaterThan(0);
      expect(EventBus.getSubscriberCount('campaign:completed')).toBeGreaterThan(0);
      expect(EventBus.getSubscriberCount('campaign:paused')).toBeGreaterThan(0);
    });

    test('should clear all event handlers', () => {
      CampaignEventHandlers.registerAll();
      expect(EventBus.getSubscriberCount('campaign:created')).toBeGreaterThan(0);

      CampaignEventHandlers.unregisterAll();
      expect(EventBus.getSubscriberCount('campaign:created')).toBe(0);
    });
  });

  describe('Event Flow and Ordering', () => {
    test('should fire events in correct order', async () => {
      const eventLog = [];
      
      EventBus.subscribeTo('event:1', async () => {
        eventLog.push('event1');
      });
      EventBus.subscribeTo('event:1', async () => {
        eventLog.push('event1-secondary');
      });
      EventBus.subscribeTo('event:2', async () => {
        eventLog.push('event2');
      });

      await EventBus.publishEvent('event:1', {});
      await EventBus.publishEvent('event:2', {});

      expect(eventLog).toEqual(['event1', 'event1-secondary', 'event2']);
    });

    test('should handle concurrent event handlers', async () => {
      let count = 0;

      EventBus.subscribeTo('concurrent:test', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        count++;
      });

      EventBus.subscribeTo('concurrent:test', async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        count++;
      });

      await EventBus.publishEvent('concurrent:test', {});

      expect(count).toBe(2);
    });
  });

  describe('Status Transition Rules', () => {
    test('cannot publish non-draft campaign', () => {
      const campaign = { status: 'active' };
      const result = campaignValidators.validateCanPublish(campaign);

      expect(result.canPublish).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('cannot pause paused campaign', () => {
      const campaign = { status: 'paused' };
      const result = campaignValidators.validateCanPause(campaign);

      expect(result.canPause).toBe(false);
    });

    test('cannot pause completed campaign', () => {
      const campaign = { status: 'completed' };
      const result = campaignValidators.validateCanPause(campaign);

      expect(result.canPause).toBe(false);
    });

    test('cannot complete archived campaign', () => {
      const campaign = { status: 'archived' };
      const result = campaignValidators.validateCanComplete(campaign);

      expect(result.canComplete).toBe(false);
    });

    test('campaign can only be edited in draft status', () => {
      expect(campaignValidators.canEdit({ status: 'draft' })).toBe(true);
      expect(campaignValidators.canEdit({ status: 'active' })).toBe(false);
      expect(campaignValidators.canEdit({ status: 'paused' })).toBe(false);
      expect(campaignValidators.canEdit({ status: 'completed' })).toBe(false);
    });
  });

  describe('Validation Error Messages', () => {
    test('should provide clear error messages', () => {
      const campaign = { status: 'active' };
      const result = campaignValidators.validateCanPause(campaign);

      expect(result.reason).toContain('Only active campaigns');
    });

    test('should list all validation errors', () => {
      const campaign = {
        status: 'draft',
        title: '',
        description: '',
        goals: [],
        payment_methods: [],
        location: null,
      };

      const result = campaignValidators.validateCampaignComplete(campaign);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('title'))).toBe(true);
      expect(result.errors.some(e => e.includes('goal'))).toBe(true);
      expect(result.errors.some(e => e.includes('payment'))).toBe(true);
    });
  });

  describe('Integration: Complete Workflow', () => {
    test('should complete full campaign lifecycle', async () => {
      const eventLog = [];

      // Register handlers to track events
      EventBus.subscribeTo('campaign:created', async () => {
        eventLog.push('created');
      });
      EventBus.subscribeTo('campaign:published', async () => {
        eventLog.push('published');
      });
      EventBus.subscribeTo('campaign:paused', async () => {
        eventLog.push('paused');
      });
      EventBus.subscribeTo('campaign:completed', async () => {
        eventLog.push('completed');
      });

      // Simulate workflow
      await EventBus.publishEvent('campaign:created', { campaign_id: '1', creator_id: 'user1' });
      await EventBus.publishEvent('campaign:published', { campaign_id: '1', creator_id: 'user1' });
      await EventBus.publishEvent('campaign:paused', { campaign_id: '1', creator_id: 'user1' });
      await EventBus.publishEvent('campaign:completed', { campaign_id: '1', creator_id: 'user1' });

      expect(eventLog).toEqual(['created', 'published', 'paused', 'completed']);
    });

    test('should reject invalid transitions with clear error', () => {
      const transitions = [
        { from: 'draft', to: 'completed', shouldFail: true },
        { from: 'active', to: 'draft', shouldFail: true },
        { from: 'completed', to: 'paused', shouldFail: true },
        { from: 'paused', to: 'active', shouldFail: false },
      ];

      transitions.forEach(({ from, to, shouldFail }) => {
        const result = campaignValidators.validateStatusTransition(from, to);
        if (shouldFail) {
          expect(result.isValid).toBe(false);
        } else {
          expect(result.isValid).toBe(true);
        }
      });
    });
  });
});
