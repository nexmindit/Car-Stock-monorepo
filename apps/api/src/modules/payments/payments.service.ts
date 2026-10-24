import { db } from '../../lib/db';
import {
  CreatePaymentSchema,
  CreateReservationDepositSchema,
  UpdatePaymentSchema,
  VoidPaymentSchema,
  PaymentFilterSchema,
} from '@car-stock/shared/schemas';
import { campaignDay } from '../../lib/campaignDate';
import { campaignFormulasService } from '../campaigns/campaign-formulas.service';
import { reservationAmounts } from '../sales/reservation-deposit.helpers';
import {
  createReservationWithDeposit,
  findActiveCampaignIdForModel,
} from '../sales/reservation-deposit.service';
import { generateSaleNumber } from '../sales/sale-number';
import { authService } from '../auth/auth.service';
import { AppError, NotFoundError, ForbiddenError, BadRequestError } from '../../lib/errors';
import { generateReceiptNumber, resolveIssuedBy } from './receipt-number';

// Payment types that affect car price (should update paidAmount and remainingAmount)
const CAR_PAYMENT_TYPES = ['DEPOSIT', 'DOWN_PAYMENT', 'FINANCE_PAYMENT'] as const;

// Buyer-charged fees (insurance / พรบ / registration) are part of what the
// customer owes. Invariant (must match sales.service.ts):
//   remainingAmount = totalAmount + buyerFees - paidAmount
const buyerFees = (sale: {
  insuranceFee: any;
  compulsoryInsuranceFee: any;
  registrationFee: any;
}): number =>
  Number(sale.insuranceFee ?? 0) +
  Number(sale.compulsoryInsuranceFee ?? 0) +
  Number(sale.registrationFee ?? 0);

export class PaymentsService {
  /**
   * Get all payments with pagination and filters
   */
  async getAllPayments(params: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_VIEW' as any)) {
      throw new ForbiddenError();
    }

    const validated = PaymentFilterSchema.parse(params);
    const skip = (validated.page - 1) * validated.limit;

    const where: any = {};

    if (validated.search) {
      where.OR = [
        { receiptNumber: { contains: validated.search, mode: 'insensitive' } },
        { customer: { is: { name: { contains: validated.search, mode: 'insensitive' } } } },
        { customer: { is: { code: { contains: validated.search, mode: 'insensitive' } } } },
        { sale: { is: { saleNumber: { contains: validated.search, mode: 'insensitive' } } } },
        { notes: { contains: validated.search, mode: 'insensitive' } },
      ];
    }

    if (validated.saleId) {
      where.saleId = validated.saleId;
    }

    if (validated.customerId) {
      where.customerId = validated.customerId;
    }

    if (validated.status) {
      where.status = validated.status;
    }

    if (validated.paymentType) {
      where.paymentType = validated.paymentType;
    }

    const [payments, total] = await Promise.all([
      db.payment.findMany({
        where,
        select: {
          id: true,
          receiptNumber: true,
          amount: true,
          paymentDate: true,
          paymentType: true,
          paymentMethod: true,
          referenceNumber: true,
          description: true,
          notes: true,
          status: true,
          customer: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          sale: {
            select: {
              id: true,
              saleNumber: true,
            },
          },
          createdAt: true,
        },
        skip,
        take: validated.limit,
        orderBy: { paymentDate: 'desc' },
      }),
      db.payment.count({ where }),
    ]);

    return {
      data: payments,
      meta: {
        total,
        page: validated.page,
        limit: validated.limit,
        totalPages: Math.ceil(total / validated.limit),
        hasNextPage: validated.page < Math.ceil(total / validated.limit),
        hasPrevPage: validated.page > 1,
      },
    };
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_VIEW' as any)) {
      throw new ForbiddenError();
    }

    const payment = await db.payment.findUnique({
      where: { id },
      include: {
        customer: true,
        sale: {
          include: {
            customer: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
            // Car on the sale: the linked unit, or the booked model + colors
            // while no VIN is assigned yet.
            stock: {
              select: {
                id: true,
                vin: true,
                exteriorColor: true,
                interiorColor: true,
                vehicleModel: { select: { id: true, brand: true, model: true, variant: true } },
              },
            },
            vehicleModel: { select: { id: true, brand: true, model: true, variant: true } },
          },
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundError('Payment');
    }

    return payment;
  }

  /**
   * Create new payment
   */
  async createPayment(data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_CREATE' as any)) {
      throw new ForbiddenError();
    }

    const validated = CreatePaymentSchema.parse(data);

    // Check if customer exists
    const customer = await db.customer.findUnique({
      where: { id: validated.customerId },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundError('Customer');
    }

    let sale = null;
    
    // Only check for sale if saleId is provided (not a miscellaneous payment)
    if (validated.saleId) {
      sale = await db.sale.findUnique({
        where: { id: validated.saleId },
        select: { id: true, totalAmount: true, paidAmount: true, remainingAmount: true },
      });

      if (!sale) {
        throw new NotFoundError('Sale');
      }
    }

    // Validate amount is positive
    if (validated.amount <= 0) {
      throw new BadRequestError('จำนวนเงินต้องมากกว่า 0');
    }

    // Validate overpayment for car-related payments. The strict check must
    // happen INSIDE the transaction (below) to avoid TOCTOU races where two
    // concurrent payments both pass a stale check. This is a fast pre-check
    // for friendly error messages only — the transactional re-check is
    // authoritative.
    const isCarPayment = CAR_PAYMENT_TYPES.includes(validated.paymentType as typeof CAR_PAYMENT_TYPES[number]);

    if (sale && isCarPayment) {
      const remaining = Number(sale.remainingAmount);
      if (validated.amount > remaining) {
        throw new BadRequestError(
          `จำนวนเงินเกินยอดค้างชำระ (คงเหลือ ${remaining.toLocaleString()} บาท)`
        );
      }
    }

    // Generate receipt number
    const receiptNumber = await generateReceiptNumber();

    const issuedByName = await resolveIssuedBy(currentUser.id, currentUser.username);

    // Create payment + update sale balance in a single transaction.
    // Serializable isolation ensures concurrent payments cannot both observe
    // the same `remainingAmount` and overdraw the sale.
    const payment = await db.$transaction(
      async (tx) => {
        // Re-fetch the sale inside the transaction to get a current snapshot,
        // and re-validate overpayment against it. Under serializable isolation
        // this prevents the race where two concurrent payments each see the
        // pre-transaction balance and individually pass the check.
        let txSale: {
          totalAmount: any;
          paidAmount: any;
          remainingAmount: any;
          insuranceFee: any;
          compulsoryInsuranceFee: any;
          registrationFee: any;
        } | null = null;
        if (validated.saleId) {
          txSale = await tx.sale.findUnique({
            where: { id: validated.saleId },
            select: {
              totalAmount: true,
              paidAmount: true,
              remainingAmount: true,
              insuranceFee: true,
              compulsoryInsuranceFee: true,
              registrationFee: true,
            },
          });
          if (!txSale) {
            throw new NotFoundError('Sale');
          }

          if (isCarPayment) {
            const txRemaining = Number(txSale.remainingAmount);
            if (validated.amount > txRemaining) {
              throw new BadRequestError(
                `จำนวนเงินเกินยอดค้างชำระ (คงเหลือ ${txRemaining.toLocaleString()} บาท)`
              );
            }
          }
        }

        const created = await tx.payment.create({
          data: {
            customerId: validated.customerId,
            saleId: validated.saleId || null,
            description: validated.description || null,
            paymentDate: validated.paymentDate,
            paymentType: validated.paymentType,
            amount: validated.amount,
            paymentMethod: validated.paymentMethod,
            referenceNumber: validated.referenceNumber || null,
            notes: validated.notes || null,
            receivingBank: validated.receivingBank || validated.receivingBankName || null,
            receivingBankName: validated.receivingBankName || null,
            receivingAccountNumber: validated.receivingAccountNumber || null,
            receivingBranch: validated.receivingBranch || null,
            receiptNumber,
            createdById: currentUser.id,
            issuedBy: issuedByName,
          },
        });

        // Update sale paid amount and remaining amount
        // Only for car-related payment types (DEPOSIT, DOWN_PAYMENT, FINANCE_PAYMENT)
        if (txSale && validated.saleId && isCarPayment) {
          const newPaidAmount = Number(txSale.paidAmount) + validated.amount;
          const newRemainingAmount = Number(txSale.totalAmount) + buyerFees(txSale) - newPaidAmount;

          await tx.sale.update({
            where: { id: validated.saleId },
            data: {
              paidAmount: newPaidAmount,
              remainingAmount: newRemainingAmount,
            },
          });
        }

        await tx.activityLog.create({
          data: {
            userId: currentUser.id,
            action: 'CREATE_PAYMENT',
            entity: 'PAYMENT',
            entityId: created.id,
            details: {
              receiptNumber: created.receiptNumber,
              amount: created.amount,
              saleId: created.saleId,
              customerId: created.customerId,
              paymentType: created.paymentType,
              description: created.description,
            },
          },
        });

        return created;
      },
      { isolationLevel: 'Serializable' }
    );

    return payment;
  }

  /**
   * จองรถจากหน้าชำระเงิน: book a car by model + color (no VIN yet) and issue
   * the deposit receipt in one step. Creates a RESERVATION_SALE (RESERVED,
   * stockId null) and its DEPOSIT payment in one transaction; the VIN is
   * linked later from the sale page (assign-stock).
   */
  async createReservationDeposit(data: unknown, currentUser: any) {
    // Creates a sale and a payment — needs both rights.
    if (
      !authService.hasPermission(currentUser.role, 'PAYMENT_CREATE') ||
      !authService.hasPermission(currentUser.role, 'SALE_CREATE')
    ) {
      throw new ForbiddenError();
    }

    const validated = CreateReservationDepositSchema.parse(data);

    const [customer, vehicleModel] = await Promise.all([
      db.customer.findUnique({ where: { id: validated.customerId }, select: { id: true } }),
      db.vehicleModel.findUnique({
        where: { id: validated.vehicleModelId },
        select: { id: true, price: true },
      }),
    ]);
    if (!customer) throw new NotFoundError('Customer');
    if (!vehicleModel) throw new NotFoundError('Vehicle model');

    const amounts = reservationAmounts({
      totalAmount: validated.totalAmount,
      depositAmount: validated.depositAmount,
      modelPrice: Number(vehicleModel.price),
    });

    // Tag the active campaign the same way createSale does (sales-page bookings).
    const saleDay = campaignDay(validated.createdAt ?? new Date());
    const campaignId = await findActiveCampaignIdForModel(vehicleModel.id, saleDay);
    const campaignSubsidySnapshot = await campaignFormulasService.computeSaleSubsidySnapshot({
      campaignId,
      vehicleModelId: vehicleModel.id,
      stockId: null,
    });

    const issuedByName = await resolveIssuedBy(currentUser.id, currentUser.username);

    const saleNumber = await generateSaleNumber();
    const receiptNumber = await generateReceiptNumber();

    const { payment } = await db.$transaction(async (tx) => {
      const result = await createReservationWithDeposit(tx, {
        userId: currentUser.id,
        sale: {
          saleNumber,
          type: 'RESERVATION_SALE',
          status: 'RESERVED',
          customerId: validated.customerId,
          stockId: null,
          vehicleModelId: vehicleModel.id,
          preferredExtColor: validated.preferredExtColor,
          preferredIntColor: validated.preferredIntColor || null,
          totalAmount: amounts.totalAmount,
          depositAmount: amounts.depositAmount,
          remainingAmount: amounts.remainingAmount,
          reservedDate: validated.createdAt ?? new Date(),
          campaignId: campaignId ?? null,
          campaignSubsidySnapshot,
          paymentMode: 'CASH',
          ...(validated.createdAt ? { createdAt: validated.createdAt } : {}),
        },
        deposit: {
          receiptNumber,
          paymentDate: validated.paymentDate,
          paymentMethod: validated.paymentMethod,
          referenceNumber: validated.referenceNumber,
          notes: validated.notes,
          receivingBank: validated.receivingBank,
          receivingBankName: validated.receivingBankName,
          receivingAccountNumber: validated.receivingAccountNumber,
          receivingBranch: validated.receivingBranch,
          issuedBy: issuedByName,
          logDetails: { via: 'PAYMENT_PAGE' },
        },
      });
      const { sale } = result;

      await tx.saleHistory.create({
        data: {
          saleId: sale.id,
          action: 'CREATE_SALE',
          fromStatus: null,
          toStatus: sale.status,
          notes: `จองรถพร้อมรับเงินจอง (ใบเสร็จ ${receiptNumber})`,
          createdById: currentUser.id,
        },
      });
      await tx.activityLog.create({
        data: {
          userId: currentUser.id,
          action: 'CREATE_SALE',
          entity: 'SALE',
          entityId: sale.id,
          details: {
            saleNumber: sale.saleNumber,
            customerId: sale.customerId,
            totalAmount: sale.totalAmount,
            via: 'PAYMENT_PAGE',
          },
        },
      });
      return result;
    });

    if (!payment) throw new AppError('Deposit payment was not created', 500);
    return this.getPaymentById(payment.id, currentUser);
  }

  /**
   * Update payment (ADMIN/ACCOUNTANT only, ACTIVE payments only)
   */
  async updatePayment(id: string, data: any, currentUser: any) {
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_UPDATE' as any)) {
      throw new ForbiddenError();
    }

    const validated = UpdatePaymentSchema.parse(data);

    const existingPayment = await db.payment.findUnique({
      where: { id },
      select: { id: true, status: true, amount: true, saleId: true, paymentType: true },
    });

    if (!existingPayment) {
      throw new NotFoundError('Payment');
    }

    if (existingPayment.status === 'VOIDED') {
      throw new BadRequestError('ไม่สามารถแก้ไขใบเสร็จที่ยกเลิกแล้วได้');
    }

    const oldAmount = Number(existingPayment.amount);
    const newAmount = validated.amount ?? oldAmount;

    const oldType = existingPayment.paymentType;
    const newType = validated.paymentType ?? oldType;
    const wasCarPayment = CAR_PAYMENT_TYPES.includes(oldType as typeof CAR_PAYMENT_TYPES[number]);
    const isCarPayment = CAR_PAYMENT_TYPES.includes(newType as typeof CAR_PAYMENT_TYPES[number]);

    // Calculate net effect on sale paidAmount
    // Subtract old car-payment amount, add new car-payment amount
    const oldContribution = wasCarPayment ? oldAmount : 0;
    const newContribution = isCarPayment ? newAmount : 0;
    const saleDiff = newContribution - oldContribution;

    // Validate overpayment when amount increases for car-related payments
    if (existingPayment.saleId && saleDiff > 0 && isCarPayment) {
      const sale = await db.sale.findUnique({
        where: { id: existingPayment.saleId },
        select: { remainingAmount: true },
      });

      if (sale) {
        const remaining = Number(sale.remainingAmount);
        if (saleDiff > remaining) {
          throw new BadRequestError(
            `จำนวนเงินเกินยอดค้างชำระ (คงเหลือ ${remaining.toLocaleString()} บาท)`
          );
        }
      }
    }

    const payment = await db.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id },
        data: validated,
      });

      // Update sale paidAmount/remainingAmount if contribution changed
      if (existingPayment.saleId && saleDiff !== 0) {
        const sale = await tx.sale.findUnique({
          where: { id: existingPayment.saleId },
          select: {
            paidAmount: true,
            totalAmount: true,
            insuranceFee: true,
            compulsoryInsuranceFee: true,
            registrationFee: true,
          },
        });

        if (sale) {
          const newPaidAmount = Number(sale.paidAmount) + saleDiff;
          const newRemainingAmount = Number(sale.totalAmount) + buyerFees(sale) - newPaidAmount;

          await tx.sale.update({
            where: { id: existingPayment.saleId },
            data: {
              paidAmount: newPaidAmount,
              remainingAmount: newRemainingAmount,
            },
          });
        }
      }

      await tx.activityLog.create({
        data: {
          userId: currentUser.id,
          action: 'UPDATE_PAYMENT',
          entity: 'PAYMENT',
          entityId: updated.id,
          details: {
            receiptNumber: updated.receiptNumber,
            changes: validated,
          },
        },
      });

      return updated;
    });

    return payment;
  }

  /**
   * Void payment
   */
  async voidPayment(id: string, data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_VOID' as any)) {
      throw new ForbiddenError();
    }

    const validated = VoidPaymentSchema.parse(data);

    // Check if payment exists
    const existingPayment = await db.payment.findUnique({
      where: { id },
      select: { id: true, status: true, amount: true, saleId: true, paymentType: true },
    });

    if (!existingPayment) {
      throw new NotFoundError('Payment');
    }

    if (existingPayment.status === 'VOIDED') {
      throw new BadRequestError('Cannot void already voided payment');
    }

    const isCarPayment = CAR_PAYMENT_TYPES.includes(existingPayment.paymentType as typeof CAR_PAYMENT_TYPES[number]);

    // Void payment + reverse sale balance + log in a single transaction
    const payment = await db.$transaction(async (tx) => {
      const voided = await tx.payment.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidReason: validated.voidReason,
          voidedAt: new Date(),
        },
      });

      // Reverse sale balance for car-related payment types
      if (existingPayment.saleId && isCarPayment) {
        const sale = await tx.sale.findUnique({
          where: { id: existingPayment.saleId },
          select: {
            paidAmount: true,
            totalAmount: true,
            insuranceFee: true,
            compulsoryInsuranceFee: true,
            registrationFee: true,
          },
        });

        if (sale) {
          const newPaidAmount = Number(sale.paidAmount) - Number(existingPayment.amount);
          const newRemainingAmount = Number(sale.totalAmount) + buyerFees(sale) - newPaidAmount;

          await tx.sale.update({
            where: { id: existingPayment.saleId },
            data: {
              paidAmount: newPaidAmount,
              remainingAmount: newRemainingAmount,
            },
          });
        }
      }

      await tx.activityLog.create({
        data: {
          userId: currentUser.id,
          action: 'VOID_PAYMENT',
          entity: 'PAYMENT',
          entityId: voided.id,
          details: {
            receiptNumber: voided.receiptNumber,
            amount: voided.amount,
            voidReason: validated.voidReason,
          },
        },
      });

      return voided;
    });

    return payment;
  }

  /**
   * Get payment statistics
   */
  async getPaymentStats(currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_VIEW' as any)) {
      throw new ForbiddenError();
    }

    const [totalPayments, activePayments, voidedPayments] = await Promise.all([
      db.payment.count(),
      db.payment.count({ where: { status: 'ACTIVE' } }),
      db.payment.count({ where: { status: 'VOIDED' } }),
    ]);

    // Calculate total amount received
    const amountResult = await db.payment.aggregate({
      where: { status: 'ACTIVE' },
      _sum: {
        amount: true,
      },
    });

    const totalAmount = Number(amountResult._sum.amount || 0);

    // Calculate amounts by payment type
    const [depositResult, downPaymentResult, financeResult, otherExpenseResult] = await Promise.all([
      db.payment.aggregate({
        where: { status: 'ACTIVE', paymentType: 'DEPOSIT' },
        _sum: { amount: true },
      }),
      db.payment.aggregate({
        where: { status: 'ACTIVE', paymentType: 'DOWN_PAYMENT' },
        _sum: { amount: true },
      }),
      db.payment.aggregate({
        where: { status: 'ACTIVE', paymentType: 'FINANCE_PAYMENT' },
        _sum: { amount: true },
      }),
      db.payment.aggregate({
        where: { status: 'ACTIVE', paymentType: 'OTHER_EXPENSE' },
        _sum: { amount: true },
      }),
    ]);

    const depositAmount = Number(depositResult._sum.amount || 0);
    const downPaymentAmount = Number(downPaymentResult._sum.amount || 0);
    const financePaymentAmount = Number(financeResult._sum.amount || 0);
    const otherExpenseAmount = Number(otherExpenseResult._sum.amount || 0);

    // Calculate monthly revenue (current month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    // Exclusive upper bound = first instant of next month, so payments timestamped
    // after midnight on the last day of the month are still included.
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const monthlyAmountResult = await db.payment.aggregate({
      where: {
        status: 'ACTIVE',
        paymentDate: {
          gte: startOfMonth,
          lt: startOfNextMonth,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const monthlyRevenue = Number(monthlyAmountResult._sum.amount || 0);

    return {
      totalPayments,
      activePayments,
      voidedPayments,
      totalAmount,
      depositAmount,
      downPaymentAmount,
      financePaymentAmount,
      otherExpenseAmount,
      monthlyRevenue,
    };
  }

  /**
   * Get outstanding payments (sales with remaining amount > 0)
   */
  async getOutstandingPayments(currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'PAYMENT_VIEW' as any)) {
      throw new ForbiddenError();
    }

    const outstandingSales = await db.sale.findMany({
      where: {
        remainingAmount: {
          gt: 0,
        },
        status: {
          in: ['RESERVED', 'PREPARING', 'DELIVERED', 'COMPLETED'],
        },
      },
      select: {
        id: true,
        saleNumber: true,
        totalAmount: true,
        paidAmount: true,
        remainingAmount: true,
        deliveryDate: true,
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        stock: {
          select: {
            vin: true,
            vehicleModel: {
              select: {
                brand: true,
                model: true,
                variant: true,
              },
            },
          },
        },
      },
      orderBy: { deliveryDate: 'asc' },
      take: 50,
    });

    return outstandingSales;
  }
}

export const paymentsService = new PaymentsService();
