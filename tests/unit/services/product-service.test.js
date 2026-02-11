// Test for ProductService

const productService = require('../../../services/product-service');

describe('ProductService', () => {
    let mockDb;

    beforeEach(() => {
        mockDb = {
            data: {
                produk: {
                    'net2u': {
                        id: 'net2u',
                        name: 'Netflix 2 User',
                        price: 50000,
                        price_silver: 47500,
                        price_gold: 45000,
                        desc: 'Netflix Premium 2 User',
                        stok: ['account1', 'account2', 'account3'],
                    },
                    'spot1u': {
                        id: 'spot1u',
                        name: 'Spotify 1 User',
                        price: 20000,
                        stok: [],
                    },
                },
            },
        };
    });

    describe('getProduct()', () => {
        test('should return product if exists', () => {
            const product = productService.getProduct('net2u', mockDb);

            expect(product).toBeDefined();
            expect(product.name).toBe('Netflix 2 User');
        });

        test('should return null if product not found', () => {
            const product = productService.getProduct('invalid', mockDb);

            expect(product).toBeNull();
        });
    });

    describe('checkStock()', () => {
        test('should return available true if stock sufficient', () => {
            const result = productService.checkStock('net2u', 2, mockDb);

            expect(result.available).toBe(true);
            expect(result.currentStock).toBe(3);
            expect(result.requested).toBe(2);
        });

        test('should return available false if stock insufficient', () => {
            const result = productService.checkStock('net2u', 5, mockDb);

            expect(result.available).toBe(false);
            expect(result.reason).toBe('Insufficient stock');
            expect(result.currentStock).toBe(3);
            expect(result.requested).toBe(5);
        });

        test('should return available false if out of stock', () => {
            const result = productService.checkStock('spot1u', 1, mockDb);

            expect(result.available).toBe(false);
            expect(result.reason).toBe('Out of stock');
            expect(result.currentStock).toBe(0);
        });

        test('should return available false if product not found', () => {
            const result = productService.checkStock('invalid', 1, mockDb);

            expect(result.available).toBe(false);
            expect(result.reason).toBe('Product not found');
        });
    });

    describe('getAllProducts()', () => {
        test('should return array of all products', () => {
            const products = productService.getAllProducts(mockDb);

            expect(products).toHaveLength(2);
            expect(products[0].id).toBeDefined();
            expect(products[0].name).toBeDefined();
        });
    });

    describe('formatRupiah()', () => {
        test('should format number to Rupiah', () => {
            expect(productService.formatRupiah(10000)).toBe('10.000');
            expect(productService.formatRupiah(1000000)).toBe('1.000.000');
            expect(productService.formatRupiah(500)).toBe('500');
        });
    });
});
