/**
 * PayoutReminders Job (F-4)
 *
 * Nudges creators who have unpaid sharer payout claims, and (optionally) auto-
 * cancels claims a creator never pays within N days — returning that balance to
 * the sharer's claimable pool so they can re-claim from another channel.
 *
 * Config (env, all optional):
 *   PAYOUT_REMINDER_AFTER_DAYS     start reminding once a claim is this old   (default 2)
 *   PAYOUT_REMINDER_INTERVAL_DAYS  minimum gap between reminders               (default 2)
 *   PAYOUT_AUTOCANCEL_DAYS         auto-cancel unpaid claims older than this   (default OFF)
 *
 * Accounting note: cancelling a slice subtracts it from amount_requested, so the
 * earnings ledger (which reserves pending/processing and counts completed
 * amount_requested as withdrawn) stays correct — the cancelled amount simply
 * returns to the sharer's available balance. The reward is never debited from the
 * creator's funded budget at payout time, so there is no budget double-accounting.
 */

const winstonLogger = require('../utils/winstonLogger');

const DAY_MS = 24 * 60 * 60 * 1000;

class PayoutRemindersJob {
  static async run() {
    const ShareWithdrawal = require('../models/ShareWithdrawal');
    const Campaign = require('../models/Campaign');
    const NotificationDispatcher = require('../services/NotificationDispatcher');

    const REMIND_AFTER = parseInt(process.env.PAYOUT_REMINDER_AFTER_DAYS || '2', 10);
    const REMIND_EVERY = parseInt(process.env.PAYOUT_REMINDER_INTERVAL_DAYS || '2', 10);
    const AUTOCANCEL = process.env.PAYOUT_AUTOCANCEL_DAYS
      ? parseInt(process.env.PAYOUT_AUTOCANCEL_DAYS, 10)
      : null;

    const now = Date.now();

    const withdrawals = await ShareWithdrawal.find({
      status: { $in: ['pending', 'processing'] },
      'campaign_withdrawals.status': 'pending',
    });

    let reminded = 0;
    let cancelled = 0;

    const campCache = {};
    const getCamp = async (id) => {
      if (!id) return null;
      const k = id.toString();
      if (!(k in campCache)) {
        campCache[k] = await Campaign.findById(id).select('title creator_id').lean();
      }
      return campCache[k];
    };

    for (const w of withdrawals) {
      let dirty = false;

      for (const cw of w.campaign_withdrawals) {
        if (cw.status !== 'pending') continue;
        const ageDays = (now - new Date(w.requested_at).getTime()) / DAY_MS;
        const camp = await getCamp(cw.campaign_id);
        if (!camp) continue;

        // --- Auto-cancel (guarded, opt-in) ---
        if (AUTOCANCEL && ageDays >= AUTOCANCEL) {
          cw.status = 'cancelled';
          cw.cancelled_at = new Date();
          w.amount_requested = Math.max(0, (w.amount_requested || 0) - (cw.amount_cents || 0));
          dirty = true;
          cancelled += 1;
          try {
            await NotificationDispatcher.notify({
              userId: w.user_id,
              type: 'payout_cancelled',
              data: { campaign_id: cw.campaign_id, withdrawal_id: w.withdrawal_id },
              overrides: {
                title: 'Payout claim cancelled',
                message: `Your $${(cw.amount_cents / 100).toFixed(2)} claim for "${camp.title}" was auto-cancelled after ${AUTOCANCEL} days unpaid. That balance is available to claim again.`,
                action_url: '/dashboard/share-rewards',
                icon_emoji: '⚠️',
                color: 'warning',
              },
            });
          } catch (_) { /* non-fatal */ }
          continue;
        }

        // --- Reminder ---
        if (ageDays >= REMIND_AFTER) {
          const lastRemind = cw.last_reminder_at ? new Date(cw.last_reminder_at).getTime() : 0;
          if (now - lastRemind >= REMIND_EVERY * DAY_MS) {
            cw.last_reminder_at = new Date();
            cw.reminder_count = (cw.reminder_count || 0) + 1;
            dirty = true;
            reminded += 1;
            try {
              await NotificationDispatcher.notify({
                userId: camp.creator_id,
                type: 'payout_reminder',
                data: { campaign_id: cw.campaign_id, withdrawal_id: w.withdrawal_id },
                overrides: {
                  title: '⏰ Sharer payout pending',
                  message: `A sharer is still waiting on $${(cw.amount_cents / 100).toFixed(2)} for "${camp.title}" (${Math.floor(ageDays)} days). Pay them and mark it paid.`,
                  action_url: '/sharers-payouts',
                  icon_emoji: '⏰',
                  color: 'warning',
                },
              });
            } catch (_) { /* non-fatal */ }
          }
        }
      }

      if (dirty) {
        // Settle the withdrawal once every slice is terminal (paid or cancelled).
        const slices = w.campaign_withdrawals;
        const allTerminal = slices.every((s) => s.status === 'paid' || s.status === 'cancelled');
        const anyPaid = slices.some((s) => s.status === 'paid');
        if (allTerminal) {
          if (anyPaid) {
            w.markCompleted(w.transaction_id || null);
          } else {
            w.status = 'cancelled';
          }
        }
        await w.save();
      }
    }

    const result = { reminded, cancelled, auto_cancel_enabled: !!AUTOCANCEL };
    winstonLogger.info('PayoutRemindersJob completed', result);
    return result;
  }
}

module.exports = PayoutRemindersJob;
