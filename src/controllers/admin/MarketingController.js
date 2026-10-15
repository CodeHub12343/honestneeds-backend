/**
 * MarketingController — TASK-9.2.
 *
 * Admin-only. The dry-run default + list-size pre-flight + double-confirm
 * are the mitigations against the "accidentally emailed the whole list"
 * failure mode. Every real send writes an AuditLog entry.
 */

const emailService = require('../../services/emailService');
const AuditLogger = require('../../services/AuditLogger');
const winstonLogger = require('../../utils/winstonLogger');

function fail(res, err, context) {
  const statusCode = err?.statusCode || 500;
  if (statusCode >= 500) {
    winstonLogger.error(`MarketingController.${context} failed`, {
      message: err?.message,
      code: err?.code,
    });
  }
  return res.status(statusCode).json({
    success: false,
    error: { code: err?.code || 'MARKETING_ERROR', message: err?.message || 'Marketing action failed' },
  });
}

class MarketingController {
  // GET /api/admin/marketing/lists
  static async listSegments(req, res) {
    try {
      const lists = await emailService.marketing.listLists();
      return res.json({
        success: true,
        data: lists.map((l) => ({
          id: l.id,
          name: l.name,
          contact_count: l.contact_count || 0,
        })),
      });
    } catch (err) {
      return fail(res, err, 'listSegments');
    }
  }

  // POST /api/admin/marketing/contacts
  // { email, list_ids[], custom_fields?, locale? }
  static async addContact(req, res) {
    try {
      const { email, list_ids, custom_fields, locale } = req.body || {};
      const result = await emailService.marketing.addToList({
        email,
        list_ids,
        custom_fields,
        locale,
      });
      return res.status(201).json({ success: true, data: result });
    } catch (err) {
      return fail(res, err, 'addContact');
    }
  }

  // DELETE /api/admin/marketing/contacts
  static async removeContact(req, res) {
    try {
      const { email, list_id } = req.body || {};
      const result = await emailService.marketing.removeFromList({ email, list_id });
      return res.json({ success: true, data: result });
    } catch (err) {
      return fail(res, err, 'removeContact');
    }
  }

  // POST /api/admin/marketing/unsubscribe
  static async unsubscribe(req, res) {
    try {
      const { email } = req.body || {};
      const result = await emailService.marketing.unsubscribe({ email });
      return res.json({ success: true, data: result });
    } catch (err) {
      return fail(res, err, 'unsubscribe');
    }
  }

  /**
   * POST /api/admin/marketing/campaigns
   * Body: { name, subject, html, list_ids[], locale?, send_at?, confirm?, dry_run? }
   *
   * Safety gates:
   *  - `dry_run: true` (DEFAULT) returns a rendered preview and never calls
   *    the provider.
   *  - To actually send, caller must set `dry_run: false` AND include
   *    `confirm: 'yes-send-live'` (literal string) AND
   *    `confirm_contact_count: <N>` matching the resolved list size — mirrors
   *    the UI double-confirm.
   */
  static async send(req, res) {
    try {
      const {
        name,
        subject,
        html,
        list_ids,
        locale = 'en',
        send_at = null,
        dry_run,
        confirm,
        confirm_contact_count,
      } = req.body || {};

      const isDryRun = dry_run !== false; // default true for safety

      // Pre-flight: resolve list sizes so we can confirm them.
      const lists = await emailService.marketing.listLists();
      const resolved = lists.filter((l) => (list_ids || []).includes(l.id));
      const totalContacts = resolved.reduce((n, l) => n + (l.contact_count || 0), 0);

      if (isDryRun) {
        const preview = await emailService.marketing.sendCampaign({
          name,
          subject,
          html,
          list_ids,
          locale,
          send_at,
          dry_run: true,
        });
        return res.json({
          success: true,
          data: {
            dry_run: true,
            resolved_lists: resolved.map((l) => ({ id: l.id, name: l.name, contact_count: l.contact_count })),
            total_contacts: totalContacts,
            preview: preview.preview,
          },
        });
      }

      if (confirm !== 'yes-send-live') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'CONFIRM_REQUIRED',
            message: 'Set { confirm: "yes-send-live" } to send live',
          },
        });
      }
      if (!Number.isInteger(confirm_contact_count) || confirm_contact_count !== totalContacts) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'CONTACT_COUNT_MISMATCH',
            message: `Expected confirm_contact_count=${totalContacts}, got ${confirm_contact_count}`,
          },
        });
      }

      const result = await emailService.marketing.sendCampaign({
        name,
        subject,
        html,
        list_ids,
        locale,
        send_at,
        dry_run: false,
      });

      await AuditLogger.record({
        actor: req.adminUser || { userId: req.user?.userId },
        action: 'marketing.campaign.sent',
        entityType: 'MarketingCampaign',
        entityId: null,
        description: `Marketing send ${name} → ${totalContacts} contacts`,
        after: {
          singlesend_id: result.id,
          scheduled_at: result.scheduled_at,
          list_ids,
          subject,
          contact_count: totalContacts,
        },
        req,
      });

      return res.status(201).json({ success: true, data: result });
    } catch (err) {
      return fail(res, err, 'send');
    }
  }
}

module.exports = MarketingController;
