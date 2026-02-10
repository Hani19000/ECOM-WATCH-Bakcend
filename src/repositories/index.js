/**
 * @module Repository/Index
 *
 * Point d'entrée unique de la couche repository.
 * Importer depuis ce fichier plutôt que depuis chaque repo individuel
 * permet de déplacer ou renommer un fichier sans impacter les services.
 */
export { usersRepo } from './users.repo.js';
export { rolesRepo } from './roles.repo.js';
export { refreshTokensRepo } from './refreshTokens.repo.js';
export { productsRepo } from './products.repo.js';
export { inventoryRepo } from './inventory.repo.js';
export { categoriesRepo } from './categories.repo.js';
export { cartsRepo } from './carts.repo.js';
export { ordersRepo } from './orders.repo.js';
export { paymentsRepo } from './payments.repo.js';
export { shipmentsRepo } from './shipments.repo.js';
export { addressesRepo } from './adresses.repo.js'