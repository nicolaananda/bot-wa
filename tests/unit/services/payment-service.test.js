// Test for PaymentService

const paymentService = require('../../../services/payment-service');

describe('PaymentService', () => {
    describe('calculateTotal()', () => {
        test('should calculate total with unique code for bronze user', () => {
            const result = paymentService.calculateTotal(10000, 1, 'bronze');

            expect(result.subtotal).toBe(10000);
            expect(result.discount).toBe(0);
            expect(result.afterDiscount).toBe(10000);
            expect(result.uniqueCode).toBeGreaterThanOrEqual(1);
            expect(result.uniqueCode).toBeLessThanOrEqual(99);
            expect(result.total).toBeGreaterThan(10000);
            expect(result.total).toBeLessThanOrEqual(10099);
        });

        test('should apply 5% discount for silver user', () => {
            const result = paymentService.calculateTotal(10000, 1, 'silver');

            expect(result.subtotal).toBe(10000);
            expect(result.discount).toBe(500); // 5% of 10000
            expect(result.afterDiscount).toBe(9500);
            expect(result.total).toBeGreaterThan(9500);
            expect(result.total).toBeLessThanOrEqual(9599);
        });

        test('should apply 10% discount for gold user', () => {
            const result = paymentService.calculateTotal(10000, 1, 'gold');

            expect(result.subtotal).toBe(10000);
            expect(result.discount).toBe(1000); // 10% of 10000
            expect(result.afterDiscount).toBe(9000);
            expect(result.total).toBeGreaterThan(9000);
            expect(result.total).toBeLessThanOrEqual(9099);
        });

        test('should calculate correctly for multiple quantities', () => {
            const result = paymentService.calculateTotal(5000, 3, 'bronze');

            expect(result.subtotal).toBe(15000);
            expect(result.total).toBeGreaterThan(15000);
            expect(result.total).toBeLessThanOrEqual(15099);
        });
    });

    describe('getProductPrice()', () => {
        test('should return bronze price for bronze user', () => {
            const product = {
                price: 10000,
                price_silver: 9500,
                price_gold: 9000,
            };

            const price = paymentService.getProductPrice(product, 'bronze');
            expect(price).toBe(10000);
        });

        test('should return silver price for silver user', () => {
            const product = {
                price: 10000,
                price_silver: 9500,
                price_gold: 9000,
            };

            const price = paymentService.getProductPrice(product, 'silver');
            expect(price).toBe(9500);
        });

        test('should fallback to base price if role price not set', () => {
            const product = {
                price: 10000,
            };

            const price = paymentService.getProductPrice(product, 'silver');
            expect(price).toBe(10000);
        });
    });

    describe('generateOrderId()', () => {
        test('should generate unique order ID with method prefix', () => {
            const orderId1 = paymentService.generateOrderId('SALDO');
            const orderId2 = paymentService.generateOrderId('SALDO');

            expect(orderId1).toMatch(/^SALDO-[A-Z0-9]+-\d+$/);
            expect(orderId2).toMatch(/^SALDO-[A-Z0-9]+-\d+$/);
            expect(orderId1).not.toBe(orderId2);
        });
    });
});
