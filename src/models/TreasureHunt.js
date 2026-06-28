/**
 * TreasureHunt (RG-11 GPS Treasure Hunts / Hidden QR Codes)
 *
 * A hunt is a set of geolocated "stops". A user "finds" a stop by being within
 * `radius_meters` of its coordinates (GPS) or by scanning its secret code
 * (hidden QR). Finding all stops completes the hunt and grants the reward.
 *
 * Per-user progress is embedded under `finds` keyed by stop code, keeping the
 * model self-contained (hunts are low-volume, high-read).
 */

const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema(
  {
    code: { type: String, required: true }, // secret code / QR payload
    name: { type: String, required: true, maxlength: 120 },
    hint: { type: String, default: '', maxlength: 500 },
    // GeoJSON point [lng, lat]; optional for pure QR stops.
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined },
    },
    radius_meters: { type: Number, default: 50 },
    reward_xp: { type: Number, default: 100 },
    _id: false,
  },
  { _id: false }
);

const findSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stop_code: { type: String, required: true },
    found_at: { type: Date, default: Date.now },
    method: { type: String, enum: ['gps', 'qr'], default: 'qr' },
    _id: false,
  },
  { _id: false }
);

const treasureHuntSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 150 },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: '', maxlength: 2000 },
    city: { type: String, default: null, index: true },
    stops: { type: [stopSchema], default: [] },
    finds: { type: [findSchema], default: [] },
    completion_reward_xp: { type: Number, default: 500 },
    completion_badge: { type: String, default: null },
    completed_by: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    starts_at: { type: Date, default: null },
    ends_at: { type: Date, default: null },
    is_active: { type: Boolean, default: true, index: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

module.exports = mongoose.model('TreasureHunt', treasureHuntSchema);
