/**
 * PublicConfigController — unauth-safe reads of a few PlatformSettings keys.
 *
 * The main admin config API is admin-only. The frontend's Footer + Veterans
 * hub needs a tiny subset: external_links (social media, Justice Lifts,
 * Battle Buddies for Vets). This controller serves ONLY the keys explicitly
 * listed in `PUBLIC_KEYS`.
 */

const PlatformSettings = require('../models/PlatformSettings');
const winstonLogger = require('../utils/winstonLogger');

const PUBLIC_KEYS = new Set(['external_links']);

exports.getExternalLinks = async (req, res) => {
  try {
    const key = 'external_links';
    if (!PUBLIC_KEYS.has(key)) {
      return res.status(404).json({ success: false });
    }
    const doc = await PlatformSettings.getByKey(key);
    // Default shape so the frontend never has to code around a missing row.
    const value = (doc && doc.value) || { social: [], programs: [] };
    res.set('Cache-Control', 'public, max-age=300'); // 5 min
    return res.json({ success: true, data: value });
  } catch (err) {
    winstonLogger.error('PublicConfigController.getExternalLinks failed', { message: err.message });
    return res.status(200).json({ success: true, data: { social: [], programs: [] } });
  }
};
