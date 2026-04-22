/**
 * Transaction Controller Tests
 * Tests for HTTP endpoints: POST /donations, GET /transactions, etc.
 */

const mongoose = require('mongoose');
const { recordDonation, getUserTransactions, getAllTransactions, verifyTransaction, rejectTransaction } = require('../../src/controllers/TransactionController');
const TransactionService = require('../../src/services/TransactionService');
const Transaction = require('../../src/models/Transaction');
const Campaign = require('../../src/models/Campaign');
const User = require('../../src/models/User');

// Mock request/response
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockRequest = (overrides = {}) => {
  return {
    params: {},
    query: {},
    body: {},
    user: { id: new mongoose.Types.ObjectId() },
    ip: '127.0.0.1',
    get: jest.fn().mockReturnValue('Mozilla/5.0'),
    ...overrides,
  };
};

describe('TransactionController', () => {
  let req, res;
  let creator, supporter, admin, campaign;

  beforeEach(async () => {
    req = mockRequest();
    res = mockResponse();

    // Create test data
    creator = {
      _id: new mongoose.Types.ObjectId(),
      email: 'creator@example.com',
      is_admin: false,
    };

    supporter = {
      _id: new mongoose.Types.ObjectId(),
      email: 'supporter@example.com',
      is_admin: false,
    };

    admin = {
      _id: new mongoose.Types.ObjectId(),
      email: 'admin@example.com',
      is_admin: true,
    };

    campaign = {
      _id: new mongoose.Types.ObjectId(),
      campaign_id: 'CAMP-2024-001',
      creator_id: creator._id,
      title: 'Test Campaign',
      status: 'active',
      payment_methods: [
        { type: 'paypal', email: 'creator@example.com' },
      ],
    };
  });

  describe('POST /donations/:campaignId', () => {
    test('should record a valid donation', async () => {
      req.params.campaignId = campaign._id;
      req.user.id = supporter._id;
      req.body = {
        amount: 10.5,
        payment_method: 'paypal',
      };

      jest.spyOn(TransactionService, 'recordDonation').mockResolvedValueOnce({
        transaction_id: 'TRANS-20240101-ABC12',
        status: 'pending',
        amount_dollars: 10.5,
        platform_fee_dollars: 2.1,
        net_amount_dollars: 8.4,
        sweepstakes_entries_awarded: 10,
        message: 'Donation recorded successfully. Awaiting admin verification.',
      });

      await recordDonation(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          status: 'pending',
          amount_dollars: 10.5,
        }),
      });
    });

    test('should return 400 when amount is missing', async () => {
      req.params.campaignId = campaign._id;
      req.user.id = supporter._id;
      req.body = {
        payment_method: 'paypal',
        // Missing amount
      };

      await recordDonation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Amount'),
        })
      );
    });

    test('should return 400 when payment_method is missing', async () => {
      req.params.campaignId = campaign._id;
      req.user.id = supporter._id;
      req.body = {
        amount: 10,
        // Missing payment_method
      };

      await recordDonation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Payment method'),
        })
      );
    });

    test('should return 409 when campaign not active', async () => {
      req.params.campaignId = campaign._id;
      req.user.id = supporter._id;
      req.body = {
        amount: 10,
        payment_method: 'paypal',
      };

      jest.spyOn(TransactionService, 'recordDonation').mockRejectedValueOnce(
        new Error('CAMPAIGN_NOT_ACTIVE: Campaign is draft, cannot accept donations')
      );

      await recordDonation(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
    });

    test('should handle service errors', async () => {
      req.params.campaignId = campaign._id;
      req.user.id = supporter._id;
      req.body = {
        amount: 10,
        payment_method: 'paypal',
      };

      jest.spyOn(TransactionService, 'recordDonation').mockRejectedValueOnce(
        new Error('Unexpected error')
      );

      await recordDonation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /transactions', () => {
    test('should return user transactions with pagination', async () => {
      req.user.id = supporter._id;
      req.query = { page: 1, limit: 10 };

      jest.spyOn(TransactionService, 'getUserTransactions').mockResolvedValueOnce({
        transactions: [
          {
            _id: new mongoose.Types.ObjectId(),
            transaction_id: 'TRANS-001',
            amount_dollars: 10,
            status: 'pending',
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          pages: 1,
        },
      });

      await getUserTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          pagination: expect.any(Object),
        })
      );
    });

    test('should validate pagination parameters', async () => {
      req.user.id = supporter._id;
      req.query = { page: -1, limit: 10 };

      await getUserTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should enforce limit maximum of 100', async () => {
      req.user.id = supporter._id;
      req.query = { page: 1, limit: 150 };

      await getUserTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should use defaults when pagination not specified', async () => {
      req.user.id = supporter._id;
      req.query = {};

      jest.spyOn(TransactionService, 'getUserTransactions').mockResolvedValueOnce({
        transactions: [],
        pagination: { page: 1, limit: 10, total: 0, pages: 0 },
      });

      await getUserTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('GET /admin/transactions', () => {
    test('should return all transactions [admin only]', async () => {
      req.user.id = admin._id;
      req.query = { page: 1, limit: 20 };

      jest.spyOn(TransactionService, 'getAllTransactions').mockResolvedValueOnce({
        transactions: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 0 },
        filters: {},
      });

      await getAllTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should filter by status', async () => {
      req.user.id = admin._id;
      req.query = { page: 1, limit: 20, status: 'pending' };

      jest.spyOn(TransactionService, 'getAllTransactions').mockResolvedValueOnce({
        transactions: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 0 },
        filters: { status: 'pending' },
      });

      await getAllTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should reject invalid status', async () => {
      req.user.id = admin._id;
      req.query = { page: 1, limit: 20, status: 'invalid_status' };

      await getAllTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid status'),
        })
      );
    });

    test('should return 403 when user is not admin', async () => {
      req.user.id = supporter._id;
      req.query = { page: 1, limit: 20 };

      jest.spyOn(TransactionService, 'getAllTransactions').mockRejectedValueOnce(
        new Error('UNAUTHORIZED: Only admins can view all transactions')
      );

      await getAllTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('POST /admin/transactions/:id/verify', () => {
    test('should verify a transaction', async () => {
      req.params.id = new mongoose.Types.ObjectId();
      req.user.id = admin._id;

      jest.spyOn(TransactionService, 'verifyTransaction').mockResolvedValueOnce({
        _id: req.params.id,
        status: 'verified',
        verified_by: admin._id,
      });

      await verifyTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Transaction verified successfully',
        })
      );
    });

    test('should return 400 when transaction ID missing', async () => {
      req.params.id = '';
      req.user.id = admin._id;

      await verifyTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should return 403 when user not admin', async () => {
      req.params.id = new mongoose.Types.ObjectId();
      req.user.id = supporter._id;

      jest.spyOn(TransactionService, 'verifyTransaction').mockRejectedValueOnce(
        new Error('UNAUTHORIZED: Only admins can verify transactions')
      );

      await verifyTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('should return 400 for invalid transaction ID', async () => {
      req.params.id = new mongoose.Types.ObjectId();
      req.user.id = admin._id;

      jest.spyOn(TransactionService, 'verifyTransaction').mockRejectedValueOnce(
        new Error('TRANSACTION_NOT_FOUND')
      );

      await verifyTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /admin/transactions/:id/reject', () => {
    test('should reject a transaction', async () => {
      req.params.id = new mongoose.Types.ObjectId();
      req.user.id = admin._id;
      req.body = {
        reason: 'Suspicious activity detected',
      };

      jest.spyOn(TransactionService, 'rejectTransaction').mockResolvedValueOnce({
        _id: req.params.id,
        status: 'failed',
        rejected_by: admin._id,
        rejection_reason: 'Suspicious activity detected',
      });

      await rejectTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Transaction rejected successfully',
        })
      );
    });

    test('should return 400 when reason missing', async () => {
      req.params.id = new mongoose.Types.ObjectId();
      req.user.id = admin._id;
      req.body = {
        // Missing reason
      };

      await rejectTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('reason'),
        })
      );
    });

    test('should return 400 when reason is empty string', async () => {
      req.params.id = new mongoose.Types.ObjectId();
      req.user.id = admin._id;
      req.body = {
        reason: '',
      };

      await rejectTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should return 403 when user not admin', async () => {
      req.params.id = new mongoose.Types.ObjectId();
      req.user.id = supporter._id;
      req.body = {
        reason: 'Test reason',
      };

      jest.spyOn(TransactionService, 'rejectTransaction').mockRejectedValueOnce(
        new Error('UNAUTHORIZED: Only admins can reject transactions')
      );

      await rejectTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('should return 400 for invalid transaction ID', async () => {
      req.params.id = new mongoose.Types.ObjectId();
      req.user.id = admin._id;
      req.body = {
        reason: 'Test reason',
      };

      jest.spyOn(TransactionService, 'rejectTransaction').mockRejectedValueOnce(
        new Error('TRANSACTION_NOT_FOUND')
      );

      await rejectTransaction(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
