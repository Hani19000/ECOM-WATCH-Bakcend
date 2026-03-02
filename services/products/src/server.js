/**
 * @module Server
 *
 * Point d'entrée du product-service.
 * Démarre le serveur Express puis connecte la DB (Fail-fast tolérant).
 */
import './config/instruments.js';
import app from './app.js';
import { ENV } from './config/environment.js';
import { connectPostgres } from './config/database.js';
import { logInfo, logError } from './utils/logger.js';

process.on('uncaughtException', (err) => {
    logError(err, { event: 'uncaughtException' });
    process.exit(1);
});

const startServer = async () => {
    const port = ENV.server.port;

    // Le serveur écoute AVANT la connexion DB pour que Render
    // valide le déploiement même si Neon met du temps à répondre.
    const server = app.listen(port, '0.0.0.0', () => {
        logInfo(`Serveur en ligne [${ENV.server.nodeEnv}] sur le port ${port}`);
    });

    try {
        await connectPostgres();
    } catch (error) {
        logError(error, { step: 'database_connection_startup' });
        // On continue — le service reste disponible pour les routes en cache
    }

    process.on('unhandledRejection', (err) => {
        logError(err, { event: 'unhandledRejection' });
        server.close(() => {
            logInfo('Serveur fermé suite à unhandledRejection');
            process.exit(1);
        });
    });

    process.on('SIGTERM', () => {
        logInfo("SIGTERM reçu — arrêt propre du product-service");
        server.close(() => process.exit(0));
    });

    process.on('SIGINT', () => {
        logInfo("SIGINT reçu — arrêt propre du product-service");
        server.close(() => process.exit(0));
    });
};

startServer();