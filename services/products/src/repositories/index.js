/**
 * @module Repository/Index
 *
 * Point d'entrée unique de la couche repository.
 * Importer depuis ce fichier plutôt que depuis chaque repo individuel
 * permet de déplacer ou renommer un fichier sans impacter les services.
 */
export { productsRepo } from './products.repo.js';
export { inventoryRepo } from './inventory.repo.js';
export { categoriesRepo } from './categories.repo.js';
export { promotionsRepo } from './promotions.repo.js';