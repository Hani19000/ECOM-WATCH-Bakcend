/**
 * @module Service/Profile
 *
 * Orchestre la logique métier du profil utilisateur et du suivi de commandes.
 *
 * SÉCURITÉ :
 * - Aucune donnée sensible dans les logs
 * - Rate limiting géré en amont (middleware)
 * - Defense in depth : exclusion des champs sensibles même si le repo les retourne
 */
import { usersRepo, ordersRepo } from '../repositories/index.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { logInfo, logError } from '../utils/logger.js';

class ProfileService {
    constructor() {
        if (ProfileService.instance) return ProfileService.instance;
        ProfileService.instance = this;
        Object.freeze(this);
    }

    /**
     * Récupère le profil complet de l'utilisateur avec statistiques calculées.
     * Exclut explicitement les champs sensibles (passwordHash, salt) en defense in depth —
     * même si le repo les omet, ce service constitue une seconde barrière.
     */
    async getFullProfile(userId) {
        const user = await usersRepo.findById(userId);

        if (!user) {
            throw new AppError('Utilisateur introuvable', HTTP_STATUS.NOT_FOUND);
        }

        const orders = await ordersRepo.listByUserId(userId);

        const stats = {
            totalOrders: orders.length,
            totalSpent: orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0),
            pendingOrders: orders.filter((o) => o.status === 'PENDING').length,
            completedOrders: orders.filter((o) => o.status === 'DELIVERED').length,
        };

        const { passwordHash, salt, ...safeUser } = user;

        return { ...safeUser, stats };
    }

    /**
     * Met à jour le profil utilisateur (PATCH sémantique).
     * Seuls les champs autorisés sont modifiables — email et rôle ont des endpoints dédiés.
     */
    async updateProfileWithValidation(userId, updates) {
        const { firstName, lastName, phone } = updates;

        if (!firstName && !lastName && !phone) {
            throw new AppError(
                'Au moins un champ doit être fourni pour la mise à jour',
                HTTP_STATUS.BAD_REQUEST
            );
        }

        const sanitizedUpdates = {
            firstName: firstName ? String(firstName).trim() : undefined,
            lastName: lastName ? String(lastName).trim() : undefined,
            phone: phone ? String(phone).trim() : undefined,
        };

        if (sanitizedUpdates.phone) {
            const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
            if (!phoneRegex.test(sanitizedUpdates.phone)) {
                throw new AppError('Format de téléphone invalide', HTTP_STATUS.BAD_REQUEST);
            }
        }

        const cleanUpdates = Object.fromEntries(
            Object.entries(sanitizedUpdates).filter(([, value]) => value !== undefined)
        );

        const updatedUser = await usersRepo.updateProfile(userId, cleanUpdates);

        if (!updatedUser) {
            throw new AppError('Utilisateur introuvable', HTTP_STATUS.NOT_FOUND);
        }

        logInfo(`Profil mis à jour pour l'utilisateur ${userId}`);

        const { passwordHash, salt, ...safeUser } = updatedUser;
        return safeUser;
    }

    /**
     * Récupère l'historique des commandes avec pagination.
     * La pagination est appliquée en mémoire — optimisable avec SQL LIMIT/OFFSET
     * si le volume de commandes par utilisateur devient significatif.
     */
    async getOrderHistory(userId, options = {}) {
        const { page = 1, limit = 10, status = null } = options;

        const parsedPage = parseInt(page, 10);
        const parsedLimit = parseInt(limit, 10);

        if (parsedPage < 1 || parsedLimit < 1 || parsedLimit > 100) {
            throw new AppError('Paramètres de pagination invalides', HTTP_STATUS.BAD_REQUEST);
        }

        const offset = (parsedPage - 1) * parsedLimit;
        const allOrders = await ordersRepo.listByUserId(userId);

        const filteredOrders = status
            ? allOrders.filter((order) => order.status === status)
            : allOrders;

        const paginatedOrders = filteredOrders.slice(offset, offset + parsedLimit);

        const ordersWithItems = await Promise.all(
            paginatedOrders.map(async (order) => ({
                ...order,
                items: await ordersRepo.listItems(order.id),
            }))
        );

        return {
            orders: ordersWithItems,
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                total: filteredOrders.length,
                totalPages: Math.ceil(filteredOrders.length / parsedLimit),
            },
        };
    }

    /**
     * Suivi de commande guest (sans authentification).
     *
     * Protection contre l'énumération :
     * - Validation conjointe numéro + email (un seul facteur ne suffit pas)
     * - Délai artificiel sur tout échec pour égaliser les temps de réponse
     * - Message d'erreur identique quelle que soit la cause du rejet
     */
    async trackOrderGuest(orderNumber, email) {
        if (!orderNumber || !email) {
            throw new AppError('Numéro de commande et email requis', HTTP_STATUS.BAD_REQUEST);
        }

        const sanitizedOrderNumber = String(orderNumber).trim().toUpperCase();
        const sanitizedEmail = String(email).trim().toLowerCase();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(sanitizedEmail)) {
            await this.#artificialDelay();
            throw new AppError(
                'Commande introuvable. Vérifiez vos informations.',
                HTTP_STATUS.NOT_FOUND
            );
        }

        try {
            const order = await ordersRepo.findByOrderNumberAndEmail(
                sanitizedOrderNumber,
                sanitizedEmail
            );

            if (!order) {
                logInfo(`Tentative de suivi échouée : orderNumber=${sanitizedOrderNumber}`);
                await this.#artificialDelay();
                throw new AppError(
                    'Commande introuvable. Vérifiez vos informations.',
                    HTTP_STATUS.NOT_FOUND
                );
            }

            logInfo(`Suivi guest réussi : orderNumber=${sanitizedOrderNumber}`);
            return order;

        } catch (error) {
            if (error instanceof AppError) throw error;

            logError(error, { action: 'trackOrderGuest', orderNumber: sanitizedOrderNumber });
            await this.#artificialDelay();
            throw new AppError(
                'Commande introuvable. Vérifiez vos informations.',
                HTTP_STATUS.NOT_FOUND
            );
        }
    }

    /**
     * Rattache une commande guest à un compte utilisateur.
     * Message d'erreur générique pour ne pas révéler la cause du rejet.
     */
    async claimGuestOrder(orderId, newUserId, verificationEmail) {
        try {
            const transferredOrder = await ordersRepo.transferOwnership(
                orderId,
                newUserId,
                verificationEmail
            );
            logInfo(`Commande ${orderId} transférée à l'utilisateur ${newUserId}`);
            return transferredOrder;
        } catch (error) {
            logError(error, { action: 'claimGuestOrder', orderId, newUserId });
            throw new AppError('Impossible de rattacher cette commande', HTTP_STATUS.BAD_REQUEST);
        }
    }

    /**
     * Auto-claim : rattache toutes les commandes guest d'un email à un nouveau compte.
     * Ne fait jamais échouer l'inscription — retourne toujours un objet de résultat.
     */
    async autoClaimGuestOrders(newUserId, email) {
        try {
            const guestOrders = await ordersRepo.findGuestOrdersByEmail(email);

            if (guestOrders.length === 0) {
                return { claimed: 0, orders: [] };
            }

            const claimedOrders = [];
            for (const order of guestOrders) {
                try {
                    const claimed = await ordersRepo.transferOwnership(order.id, newUserId, email);
                    claimedOrders.push(claimed);
                } catch (error) {
                    logError(error, { action: 'autoClaimGuestOrders', orderId: order.id });
                }
            }

            logInfo(`${claimedOrders.length} commande(s) transférée(s) à l'utilisateur ${newUserId}`);
            return { claimed: claimedOrders.length, orders: claimedOrders };

        } catch (error) {
            logError(error, { action: 'autoClaimGuestOrders', newUserId });
            // L'inscription ne doit pas échouer si le claim échoue
            return { claimed: 0, orders: [], error: error.message };
        }
    }

    /**
     * Délai aléatoire pour rendre temporellement indiscernables les réponses
     * en succès et en échec (protection contre l'énumération par timing attack).
     */
    async #artificialDelay() {
        const delayMs = 200 + Math.random() * 300;
        return new Promise((resolve) => setTimeout(resolve, delayMs));
    }
}

export const profileService = new ProfileService();