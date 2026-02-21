/**
 * @module Jobs/Schedulers/CronScheduler
 *
 * Orchestrateur central des cron jobs.
 *
 * Responsabilités :
 * - Enregistrement et validation des jobs
 * - Démarrage / arrêt centralisé
 * - Logging structuré et gestion d'erreur globale
 *
 * Ce pattern (un fichier par job, un orchestrateur central) facilite
 * l'ajout, la suppression et le test indépendant de chaque job.
 */
import cron from 'node-cron';
import { logInfo, logError } from '../../utils/logger.js';

class CronScheduler {
    constructor() {
        this.jobs = new Map();
        this.isRunning = false;
    }

    /**
     * Enregistre un nouveau cron job.
     *
     * @param {Object} jobConfig
     * @param {string} jobConfig.name     - Nom unique du job
     * @param {string} jobConfig.schedule - Expression cron (ex: '0 * * * *')
     * @param {Function} jobConfig.execute - Fonction à exécuter
     */
    register(jobConfig) {
        const { name, schedule, execute } = jobConfig;

        if (!name || !schedule || !execute) {
            throw new Error('Job invalide : name, schedule et execute requis');
        }

        if (this.jobs.has(name)) {
            logInfo(`[CRON] Job "${name}" déjà enregistré, remplacement`);
            this.unregister(name);
        }

        if (!cron.validate(schedule)) {
            throw new Error(`Expression cron invalide : ${schedule}`);
        }

        const task = cron.schedule(
            schedule,
            async () => {
                const startTime = Date.now();

                try {
                    await execute();
                    logInfo(`[CRON:${name.toUpperCase()}] Terminé en ${Date.now() - startTime}ms`);
                } catch (error) {
                    logError(error, { job: name });
                }
            },
            {
                scheduled: false,
                timezone: 'Europe/Paris',
            }
        );

        this.jobs.set(name, { task, schedule, execute });
        logInfo(`[CRON] Job enregistré : ${name} (${schedule})`);
    }

    /**
     * Enregistre plusieurs jobs en une seule fois.
     */
    registerMany(jobConfigs) {
        jobConfigs.forEach((config) => this.register(config));
    }

    /**
     * Démarre tous les crons enregistrés.
     */
    startAll() {
        if (this.isRunning) {
            logInfo('[CRON] Scheduler déjà démarré');
            return;
        }

        this.jobs.forEach((job, name) => {
            job.task.start();
            logInfo(`[CRON] Démarré : ${name.padEnd(20)} -> ${job.schedule}`);
        });

        this.isRunning = true;
        logInfo(`[CRON] ${this.jobs.size} job(s) actif(s)`);
    }

    /**
     * Arrête tous les crons.
     */
    stopAll() {
        this.jobs.forEach((job, name) => {
            job.task.stop();
            logInfo(`[CRON] Arrêté : ${name}`);
        });

        this.isRunning = false;
        logInfo('[CRON] Tous les jobs arrêtés');
    }

    /**
     * Arrête un job spécifique.
     */
    stop(name) {
        const job = this.jobs.get(name);

        if (!job) {
            logInfo(`[CRON] Job "${name}" introuvable`);
            return false;
        }

        job.task.stop();
        logInfo(`[CRON] Job "${name}" arrêté`);
        return true;
    }

    /**
     * Redémarre un job spécifique.
     */
    restart(name) {
        const job = this.jobs.get(name);

        if (!job) {
            logInfo(`[CRON] Job "${name}" introuvable`);
            return false;
        }

        job.task.stop();
        job.task.start();
        logInfo(`[CRON] Job "${name}" redémarré`);
        return true;
    }

    /**
     * Supprime un job et détruit la tâche associée.
     */
    unregister(name) {
        const job = this.jobs.get(name);

        if (!job) return false;

        job.task.stop();
        job.task.destroy();
        this.jobs.delete(name);
        logInfo(`[CRON] Job "${name}" supprimé`);
        return true;
    }

    /**
     * Exécute un job manuellement (tests, debug).
     */
    async executeNow(name) {
        const job = this.jobs.get(name);

        if (!job) {
            throw new Error(`Job "${name}" introuvable`);
        }

        logInfo(`[CRON] Exécution manuelle : ${name}`);
        return job.execute();
    }

    /**
     * Retourne la liste des jobs enregistrés avec leur configuration.
     */
    listJobs() {
        return Array.from(this.jobs.entries()).map(([name, job]) => ({
            name,
            schedule: job.schedule,
            isRunning: this.isRunning,
        }));
    }
}

export const cronScheduler = new CronScheduler();