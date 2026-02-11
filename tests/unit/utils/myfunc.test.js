// Test for utility functions in function/myfunc.js

const { runtime, sleep, getGroupAdmins } = require('../../../function/myfunc');

describe('Utility Functions', () => {
    describe('runtime()', () => {
        test('should format seconds to human readable time', () => {
            expect(runtime(0)).toBe('');
            expect(runtime(60)).toBe('1 minute, ');
            expect(runtime(3600)).toBe('1 hour, ');
            expect(runtime(86400)).toBe('1 day, ');
            expect(runtime(90061)).toBe('1 day, 1 hour, 1 minute, 1 second');
        });

        test('should handle plural forms correctly', () => {
            expect(runtime(120)).toBe('2 minutes, ');
            expect(runtime(7200)).toBe('2 hours, ');
            expect(runtime(172800)).toBe('2 days, ');
        });
    });

    describe('sleep()', () => {
        test('should delay execution', async () => {
            const start = Date.now();
            await sleep(100);
            const end = Date.now();
            expect(end - start).toBeGreaterThanOrEqual(95); // Allow small margin
        });
    });

    describe('getGroupAdmins()', () => {
        test('should return array of admin IDs', () => {
            const participants = [
                { id: 'user1@s.whatsapp.net', admin: 'admin' },
                { id: 'user2@s.whatsapp.net', admin: null },
                { id: 'user3@s.whatsapp.net', admin: 'superadmin' },
            ];

            const admins = getGroupAdmins(participants);
            expect(admins).toEqual([
                'user1@s.whatsapp.net',
                'user3@s.whatsapp.net',
            ]);
        });

        test('should return empty array for no admins', () => {
            const participants = [
                { id: 'user1@s.whatsapp.net', admin: null },
                { id: 'user2@s.whatsapp.net', admin: null },
            ];

            const admins = getGroupAdmins(participants);
            expect(admins).toEqual([]);
        });

        test('should handle empty participants', () => {
            expect(getGroupAdmins([])).toEqual([]);
            expect(getGroupAdmins(null)).toEqual([]);
            expect(getGroupAdmins(undefined)).toEqual([]);
        });
    });
});
