/**
 * @module Config/Vitest
 *
 * Configuration Vitest du cart-service.
 *
 * La section `env` injecte les variables d'environnement requises par environment.js
 * AVANT que les modules ne soient importés. Sans cela, environment.js lèverait une
 * erreur au chargement du module, faisant échouer toute la suite de tests.
 *
 * Les valeurs sont des stubs de test — elles ne sont jamais utilisées
 * pour des appels réels (tous les clients HTTP et repos sont mockés dans les tests).
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['src/tests/**/*.test.js'],

        // Variables d'environnement injectées uniquement pendant les tests.
        // Elles satisfont la validation fail-fast de environment.js
        // sans nécessiter un vrai fichier .env dans le runner CI.
        env: {
            NODE_ENV: 'test',
            PORT: '3006',
            JWT_ACCESS_SECRET: 'vitest-jwt-secret-not-for-production',
            DATABASE_URL: 'postgresql://test:test@localhost:5432/test_cart',
            REDIS_URL: 'redis://localhost:6379',
            PRODUCT_SERVICE_URL: 'http://localhost:3003',
            INTERNAL_PRODUCT_SECRET: 'vitest-internal-secret-not-for-production',
        },
    },
});
