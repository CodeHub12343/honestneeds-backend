/**
 * Volunteer Opportunity Controller (BU-06)
 *
 * HTTP layer for business-posted volunteer opportunities and volunteer
 * applications. Thin wrappers around VolunteerOpportunityService.
 */

const VolunteerOpportunityService = require('../services/VolunteerOpportunityService');
const { validateOpportunityCreate, validateApplication } = require('../validators/businessValidators');

function badRequest(res, error) {
  return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error } });
}

// ── Business-side ──────────────────────────────────────────────

exports.create = async (req, res, next) => {
  try {
    const check = validateOpportunityCreate(req.body);
    if (!check.valid) return badRequest(res, check.error);
    const data = await VolunteerOpportunityService.create(req.user.id, req.body);
    res.status(201).json({ success: true, message: 'Opportunity posted', data });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const data = await VolunteerOpportunityService.update(req.user.id, req.params.opportunityId, req.body);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.close = async (req, res, next) => {
  try {
    const data = await VolunteerOpportunityService.close(req.user.id, req.params.opportunityId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.listOwn = async (req, res, next) => {
  try {
    const data = await VolunteerOpportunityService.listOwn(req.user.id, {
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
      status: req.query.status,
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.listApplications = async (req, res, next) => {
  try {
    const data = await VolunteerOpportunityService.listApplicationsForOpportunity(
      req.user.id,
      req.params.opportunityId,
      { page: parseInt(req.query.page, 10) || 1, limit: parseInt(req.query.limit, 10) || 20, status: req.query.status }
    );
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.getApplication = async (req, res, next) => {
  try {
    const data = await VolunteerOpportunityService.getApplicationForOwner(req.user.id, req.params.applicationId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.reviewApplication = async (req, res, next) => {
  try {
    const data = await VolunteerOpportunityService.reviewApplication(
      req.user.id,
      req.params.applicationId,
      req.body.decision,
      req.body.note || null
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.completeApplication = async (req, res, next) => {
  try {
    const data = await VolunteerOpportunityService.completeApplication(
      req.user.id,
      req.params.applicationId,
      req.body.hours || 0
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── Public / volunteer-side ────────────────────────────────────

exports.browse = async (req, res, next) => {
  try {
    const data = await VolunteerOpportunityService.browse({
      q: req.query.q,
      category: req.query.category,
      is_remote: req.query.is_remote,
      city: req.query.city,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const data = await VolunteerOpportunityService.getById(req.params.opportunityId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.apply = async (req, res, next) => {
  try {
    const check = validateApplication(req.body);
    if (!check.valid) return badRequest(res, check.error);
    const data = await VolunteerOpportunityService.apply(req.user.id, req.params.opportunityId, req.body);
    res.status(201).json({ success: true, message: 'Application submitted', data });
  } catch (error) {
    next(error);
  }
};

exports.withdraw = async (req, res, next) => {
  try {
    const data = await VolunteerOpportunityService.withdraw(req.user.id, req.params.applicationId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.listMyApplications = async (req, res, next) => {
  try {
    const data = await VolunteerOpportunityService.listMyApplications(req.user.id, {
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
      status: req.query.status,
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};
