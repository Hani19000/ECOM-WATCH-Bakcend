/**
 * @module Config/Instruments
 *
 * Initialisation de Sentry — doit être importé EN PREMIER dans le point d'entrée
 * de l'application (avant Express, avant les routes) pour que le SDK puisse
 * instrumenter toutes les dépendances et capturer les erreurs non gérées.
 *
 * Sentry intercepte automatiquement :
 *  - Les exceptions non attrapées (uncaughtException)
 *  - Les rejets de promesses non gérés (unhandledRejection)
 *  - Les erreurs propagées via le middleware d'erreur Express
 */


// src/config/instruments.js
// src/config/instruments.js
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import 'dotenv/config'; // Assure-toi que dotenv est chargé ici aussi !

Sentry.init({
    dsn: process.env.SENTRY_DSN, // Utilise la variable du .env
    integrations: [
        nodeProfilingIntegration(),
    ],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
});

console.log("✅ Sentry : Initialisation du SDK terminée");