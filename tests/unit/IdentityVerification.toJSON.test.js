process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestneed-test';

const IdentityVerification = require('../../src/models/IdentityVerification');

describe('IdentityVerification.toJSON', () => {
  it('strips raw asset URLs and Persona credentials; keeps report_id', () => {
    const doc = new IdentityVerification({
      user_id: '000000000000000000000001',
      document_type: 'passport',
      document_front_url: 'https://cloudinary/front.jpg',
      document_front_public_id: 'cloudinary-fid',
      selfie_url: 'https://cloudinary/selfie.jpg',
      selfie_public_id: 'cloudinary-sid',
      persona_inquiry_id: 'inq_1',
      persona_session_token_hash: 'deadbeef',
      persona_report_id: 'rep_1',
      persona_last_event_id: 'evt_1',
    });
    const json = doc.toJSON();

    expect(json.document_front_url).toBeUndefined();
    expect(json.document_front_public_id).toBeUndefined();
    expect(json.selfie_url).toBeUndefined();
    expect(json.selfie_public_id).toBeUndefined();
    expect(json.persona_session_token_hash).toBeUndefined();
    expect(json.persona_last_event_id).toBeUndefined();

    // Kept — report_id is what admin UI needs; inquiry_id is a stable reference.
    expect(json.persona_inquiry_id).toBe('inq_1');
    expect(json.persona_report_id).toBe('rep_1');
  });
});
