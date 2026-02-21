import app from './app.js';
import { ENV } from './config/environment.js';
import { connectPostgres } from './config/database.js';
import { logInfo, logError } from './utils/logger.js';

/**
 * Gestion des erreurs fatales synchrones.
 * On loggue et on quitte proprement car l'état de l'app est instable.
 */
process.on('uncaughtException', (err) => {
    logError(err, { event: 'uncaughtException' });
    process.exit(1);
});

const startServer = async () => {
    // 1. On définit le port (Render fournit process.env.PORT)
    const port = ENV.server.port || 3000;

    // 2. On démarre l'écoute HTTP immédiatement. 
    // Cela permet à Render de valider le déploiement même si la DB met du temps.
    const server = app.listen(port, '0.0.0.0', () => {
        logInfo(`Serveur en ligne [${ENV.server.nodeEnv}] sur le port ${port}`);
    });

    try {
        // 3. Connexion à la base de données après le démarrage du serveur
        logInfo('Tentative de connexion à PostgreSQL...');
        await connectPostgres();
        logInfo('Connexion PostgreSQL établie avec succès');

    } catch (error) {
        // Si la DB échoue, on loggue l'erreur. 
        // En prod, on peut choisir de crash (process.exit) ou de continuer en mode dégradé.
        logError(error, { step: 'database_connection_startup' });

        // Si la DB est critique au démarrage
        // server.close(() => process.exit(1));
    }

    /**
     * Gestion des promesses rejetées non capturées.
     */
    process.on('unhandledRejection', (err) => {
        logError(err, { event: 'unhandledRejection' });
        // On ferme le serveur proprement avant de quitter
        server.close(() => {
            logInfo('Serveur fermé suite à unhandledRejection');
            process.exit(1);
        });
    });
};

startServer();