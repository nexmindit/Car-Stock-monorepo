import { Elysia, t } from 'elysia';
import { paymentsService } from './payments.service';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';

export const paymentRoutes = new Elysia({ prefix: '/payments' })
  // Get all payments
  .get(
    '/',
    async ({ query, set, requester }) => {
      const result = await paymentsService.getAllPayments(query, requester);
      set.status = 200;
      return {
        success: true,
        data: result.data,
        meta: result.meta,
      };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
        saleId: t.Optional(t.String()),
        customerId: t.Optional(t.String()),
        status: t.Optional(t.Union([t.Literal('ACTIVE'), t.Literal('VOIDED')])),
        paymentType: t.Optional(
          t.Union([
            t.Literal('DEPOSIT'),
            t.Literal('DOWN_PAYMENT'),
            t.Literal('FINANCE_PAYMENT'),
            t.Literal('OTHER_EXPENSE'),
            t.Literal('MISCELLANEOUS'),
          ])
        ),
      }),
      detail: {
        tags: ['Payments'],
        summary: 'Get all payments',
        description: 'Get payments with pagination and filters',
      },
    }
  )
  // Get payment statistics
  .get(
    '/stats',
    async ({ set, requester }) => {
      const stats = await paymentsService.getPaymentStats(requester);
      set.status = 200;
      return {
        success: true,
        data: stats,
      };
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Payments'],
        summary: 'Get payment statistics',
        description: 'Get overview statistics for payments',
      },
    }
  )
  // Get outstanding payments
  .get(
    '/outstanding',
    async ({ set, requester }) => {
      const outstanding = await paymentsService.getOutstandingPayments(requester);
      set.status = 200;
      return {
        success: true,
        data: outstanding,
      };
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Payments'],
        summary: 'Get outstanding payments',
        description: 'Get sales with outstanding payments',
      },
    }
  )
  // Get payment by ID
  .get(
    '/:id',
    async ({ params, set, requester }) => {
      const payment = await paymentsService.getPaymentById(params.id, requester);
      set.status = 200;
      return {
        success: true,
        data: payment,
      };
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Payments'],
        summary: 'Get payment by ID',
        description: 'Get a specific payment with full details',
      },
    }
  )
  // Create payment
  .post(
    '/',
    async ({ body, set, requester }) => {
      const payment = await paymentsService.createPayment(body, requester);
      set.status = 201;
      return {
        success: true,
        data: payment,
        message: 'Payment recorded successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('PAYMENT_CREATE')],
      body: t.Object({
        saleId: t.Optional(t.String()),
        customerId: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
        paymentDate: t.Optional(t.Date()),
        paymentType: t.Union([
          t.Literal('DEPOSIT'),
          t.Literal('DOWN_PAYMENT'),
          t.Literal('FINANCE_PAYMENT'),
          t.Literal('OTHER_EXPENSE'),
          t.Literal('MISCELLANEOUS'),
        ]),
        amount: t.Number({ minimum: 0.01 }),
        paymentMethod: t.Union([
          t.Literal('CASH'),
          t.Literal('BANK_TRANSFER'),
          t.Literal('CHEQUE'),
          t.Literal('CREDIT_CARD'),
        ]),
        referenceNumber: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        receivingBank: t.Optional(t.String()),
        receivingBankName: t.Optional(t.String()),
        receivingAccountNumber: t.Optional(t.String()),
        receivingBranch: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Payments'],
        summary: 'Create payment',
        description: 'Record a new payment. SaleId is optional for miscellaneous payments.',
      },
    }
  )
  // Book a car by model + color and take its deposit in one step
  .post(
    '/reservation-deposit',
    async ({ body, set, requester }) => {
      const payment = await paymentsService.createReservationDeposit(body, requester);
      set.status = 201;
      return {
        success: true,
        data: payment,
        message: 'Reservation and deposit recorded successfully',
      };
    },
    {
      // Creates a sale and a payment: both permissions are required.
      beforeHandle: [
        authMiddleware,
        requirePermission('PAYMENT_CREATE'),
        requirePermission('SALE_CREATE'),
      ],
      body: t.Object({
        customerId: t.String({ minLength: 1 }),
        vehicleModelId: t.String({ minLength: 1 }),
        preferredExtColor: t.String({ minLength: 1 }),
        preferredIntColor: t.Optional(t.String()),
        totalAmount: t.Optional(t.Number({ minimum: 0.01 })),
        depositAmount: t.Number({ minimum: 0.01 }),
        paymentDate: t.Optional(t.Union([t.Date(), t.String()])),
        paymentMethod: t.Union([
          t.Literal('CASH'),
          t.Literal('BANK_TRANSFER'),
          t.Literal('CHEQUE'),
          t.Literal('CREDIT_CARD'),
        ]),
        referenceNumber: t.Optional(t.String()),
        receivingBank: t.Optional(t.String()),
        receivingBankName: t.Optional(t.String()),
        receivingAccountNumber: t.Optional(t.String()),
        receivingBranch: t.Optional(t.String()),
        description: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        createdAt: t.Optional(t.Union([t.Date(), t.String()])),
      }),
      detail: {
        tags: ['Payments'],
        summary: 'Book a car (model + color, no VIN) with a deposit receipt',
        description:
          'Creates a RESERVATION_SALE with no stock linked plus its DEPOSIT payment in one transaction. totalAmount defaults to the model price. Requires PAYMENT_CREATE and SALE_CREATE.',
      },
    }
  )
  // Update payment
  .patch(
    '/:id',
    async ({ params, body, set, requester }) => {
      const payment = await paymentsService.updatePayment(params.id, body, requester);
      set.status = 200;
      return {
        success: true,
        data: payment,
        message: 'Payment updated successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('PAYMENT_UPDATE')],
      body: t.Object({
        description: t.Optional(t.String()),
        paymentDate: t.Optional(t.Union([t.Date(), t.String()])),
        paymentType: t.Optional(t.Union([
          t.Literal('DEPOSIT'),
          t.Literal('DOWN_PAYMENT'),
          t.Literal('FINANCE_PAYMENT'),
          t.Literal('OTHER_EXPENSE'),
          t.Literal('MISCELLANEOUS'),
        ])),
        amount: t.Optional(t.Numeric()),
        paymentMethod: t.Optional(t.Union([
          t.Literal('CASH'),
          t.Literal('BANK_TRANSFER'),
          t.Literal('CHEQUE'),
          t.Literal('CREDIT_CARD'),
        ])),
        referenceNumber: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        issuedBy: t.Optional(t.String()),
        receivingBank: t.Optional(t.String()),
        receivingBankName: t.Optional(t.String()),
        receivingAccountNumber: t.Optional(t.String()),
        receivingBranch: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Payments'],
        summary: 'Update payment',
        description: 'Update an existing payment (ADMIN/ACCOUNTANT only)',
      },
    }
  )
  // Void payment
  .post(
    '/:id/void',
    async ({ params, body, set, requester }) => {
      const payment = await paymentsService.voidPayment(params.id, body, requester);
      set.status = 200;
      return {
        success: true,
        data: payment,
        message: 'Payment voided successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('PAYMENT_VOID')],
      body: t.Object({
        voidReason: t.String({ minLength: 1 }),
      }),
      detail: {
        tags: ['Payments'],
        summary: 'Void payment',
        description: 'Void a payment (accountant, admin only)',
      },
    }
  );
