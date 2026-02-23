import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../repositories/index.js', () => ({
    usersRepo: { findByEmail: vi.fn(), create: vi.fn(), findById: vi.fn(), count: vi.fn() },
    rolesRepo: { findByName: vi.fn(), addUserRole: vi.fn(), listUserRoles: vi.fn() },
    ordersRepo: { autoClaimGuestOrders: vi.fn(), findGuestOrdersByEmail: vi.fn().mockResolvedValue([]) }
}));

vi.mock('../services/password.service.js', () => ({
    passwordService: { generateSalt: vi.fn(), hashPassword: vi.fn(), comparePassword: vi.fn() }
}));

vi.mock('../services/token.service.js', () => ({
    tokenService: { generateAccessToken: vi.fn(), generateRefreshToken: vi.fn(), verifyAccessToken: vi.fn() }
}));

vi.mock('../services/session.service.js', () => ({
    sessionService: { createSession: vi.fn(), deleteSession: vi.fn() }
}));

import { authService } from '../services/auth.service.js';
import { usersRepo, rolesRepo } from '../repositories/index.js';
import { passwordService } from '../services/password.service.js';
import { AppError } from '../utils/appError.js';

describe('AuthService - Register', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('devrait rejeter si l\'email existe déjà', async () => {
        usersRepo.findByEmail.mockResolvedValue({ id: '1', email: 'test@test.com' });
        await expect(authService.register({ email: 'test@test.com' })).rejects.toThrow(AppError);
    });

    it('devrait créer un utilisateur avec un hash et un salt', async () => {
        rolesRepo.findByName.mockResolvedValue({ id: 1, name: 'USER' });
        usersRepo.findByEmail.mockResolvedValue(null);
        passwordService.generateSalt.mockReturnValue('fake-salt');
        passwordService.hashPassword.mockResolvedValue('hashed-pwd');
        usersRepo.create.mockResolvedValue({ id: 'new-id', email: 'new@test.com' });

        const result = await authService.register({
            email: 'new@test.com',
            password: 'Password123',
            firstName: 'John',
            lastName: 'Doe'
        });

        expect(result.user.email).toBe('new@test.com');
    });
});