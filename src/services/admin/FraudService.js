/**
 * FraudService (AD-06 Fraud Detection Dashboard)
 * -------------------------------------------------------------------------
 * Surfaces the platform's risk picture by combining:
 *  - Alert documents (system / rule-engine / AI generated)
 *  - AIFraudAssessment documents (per-subject risk scores)
 * and provides the triage actions: assign, resolve, dismiss, escalate alerts
 * and clear / confirm AI assessments.
 */

const Alert = require('../../models/Alert');
const AIFraudAssessment = require('../../models/AIFraudAssessment');
const AuditService = require('./AuditService');

class FraudService {
  /**
   * Dashboard summary: counts by severity/status + top risk subjects.
   */
  static async getDashboard() {
    const [alertsBySeverity, alertsByStatus, assessmentsByLevel, topRisks, recentAlerts] =
      await Promise.all([
        Alert.aggregate([{ $group: { _id: '$severity', count: { $sum: 1 } } }]),
        Alert.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        AIFraudAssessment.aggregate([{ $group: { _id: '$risk_level', count: { $sum: 1 } } }]),
        AIFraudAssessment.find({ flagged_for_review: true, review_status: { $in: ['none', 'pending'] } })
          .sort({ risk_score: -1 })
          .limit(20)
          .lean(),
        Alert.find({ status: { $in: ['open', 'investigating'] } })
          .sort({ severity: -1, created_at: -1 })
          .limit(20)
          .populate('assigned_to', 'display_name email')
          .lean(),
      ]);

    const toMap = (agg) =>
      (agg || []).reduce((acc, r) => {
        acc[r._id || 'unknown'] = r.count;
        return acc;
      }, {});

    return {
      alerts: {
        by_severity: toMap(alertsBySeverity),
        by_status: toMap(alertsByStatus),
        recent_open: recentAlerts,
      },
      ai_assessments: {
        by_risk_level: toMap(assessmentsByLevel),
        top_risks: topRisks,
      },
    };
  }

  /**
   * Paginated alert list with filters.
   */
  static async listAlerts({ status, severity, alertType, page = 1, limit = 25 }) {
    const skip = (page - 1) * limit;
    const filter = {};
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (alertType) filter.alert_type = alertType;

    const [alerts, total] = await Promise.all([
      Alert.find(filter)
        .sort({ severity: -1, created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('assigned_to', 'display_name email')
        .populate('resolved_by', 'display_name email')
        .lean(),
      Alert.countDocuments(filter),
    ]);
    return { alerts, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
  }

  /**
   * Apply an action to an alert: 'assign'|'resolve'|'dismiss'|'escalate'.
   */
  static async actOnAlert(alertId, action, { adminId, notes, req } = {}) {
    const alert = await Alert.findById(alertId);
    if (!alert) {
      const err = new Error('Alert not found');
      err.statusCode = 404;
      err.code = 'ALERT_NOT_FOUND';
      throw err;
    }
    const before = { status: alert.status };

    switch (action) {
      case 'assign':
        alert.assigned_to = adminId;
        alert.status = alert.status === 'open' ? 'investigating' : alert.status;
        break;
      case 'resolve':
        alert.status = 'resolved';
        alert.resolved_at = new Date();
        alert.resolved_by = adminId;
        alert.resolution_notes = notes || null;
        break;
      case 'dismiss':
        alert.status = 'dismissed';
        alert.resolution_notes = notes || null;
        alert.resolved_by = adminId;
        alert.resolved_at = new Date();
        break;
      case 'escalate':
        alert.status = 'escalated';
        alert.resolution_notes = notes || null;
        break;
      default: {
        const err = new Error(`Unknown alert action: ${action}`);
        err.statusCode = 400;
        err.code = 'INVALID_ACTION';
        throw err;
      }
    }
    await alert.save();

    await AuditService.record({
      adminId,
      action: `alert.${action}`,
      entityType: 'Report',
      entityId: alert._id,
      description: `Alert ${action}: ${alert.title}`,
      changes: { before, after: { status: alert.status } },
      metadata: { notes },
      req,
    });
    return alert.toObject();
  }

  /**
   * Resolve an AI fraud assessment review: 'clear' or 'confirm'.
   */
  static async reviewAssessment(assessmentId, decision, { adminId, notes, req } = {}) {
    const assessment = await AIFraudAssessment.findById(assessmentId);
    if (!assessment) {
      const err = new Error('Assessment not found');
      err.statusCode = 404;
      err.code = 'ASSESSMENT_NOT_FOUND';
      throw err;
    }
    if (!['clear', 'confirm'].includes(decision)) {
      const err = new Error(`Unknown assessment decision: ${decision}`);
      err.statusCode = 400;
      err.code = 'INVALID_DECISION';
      throw err;
    }
    const before = { review_status: assessment.review_status };
    assessment.review_status = decision === 'clear' ? 'cleared' : 'confirmed_fraud';
    assessment.flagged_for_review = decision !== 'clear';
    assessment.reviewer_id = adminId;
    assessment.review_notes = notes || null;
    assessment.reviewed_at = new Date();
    await assessment.save();

    await AuditService.record({
      adminId,
      action: `fraud_assessment.${decision}`,
      entityType: assessment.subject_type === 'campaign' ? 'Campaign' : 'User',
      entityId: assessment._id,
      description: `Fraud assessment ${decision === 'clear' ? 'cleared' : 'confirmed as fraud'}`,
      changes: { before, after: { review_status: assessment.review_status } },
      metadata: { notes, subject_type: assessment.subject_type, subject_id: assessment.subject_id },
      req,
    });
    return assessment.toObject();
  }
}

module.exports = FraudService;
