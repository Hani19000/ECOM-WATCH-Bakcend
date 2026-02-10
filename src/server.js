import app from './app.js';
import { ENV } from './config/environment.js';
import { connectPostgres } from './config/database.js';
import { logInfo, logError } from './utils/logger.js';

/**
 * uncaughtException couvre les throw synchrones non attrapés.
 * On sort immédiatement car l'état de l'application est indéterminé.
 */
process.on('uncaughtException', (err) => {
    logError(err, { event: 'uncaughtException' });
    process.exit(1);
});

const startServer = async () => {
    try {
        // Initialise et valide le pool PostgreSQL (fail-fast)
        await connectPostgres();

        const port = ENV.server.port || 3000;
        const server = app.listen(port, () => {
            logInfo(`Serveur en ligne [${ENV.server.nodeEnv}] sur le port ${port}`);
        });

        /**
         * unhandledRejection couvre les promesses rejetées sans .catch().
         * Fermeture gracieuse pour laisser les requêtes en cours se terminer.
         */
        process.on('unhandledRejection', (err) => {
            logError(err, { event: 'unhandledRejection' });
            server.close(() => process.exit(1));
        });

    } catch (error) {
        logError(error, { step: 'server_startup' });
        process.exit(1);
    }
};

startServer();