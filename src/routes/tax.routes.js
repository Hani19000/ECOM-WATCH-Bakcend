/**
 * @module Routes/Tax
 * 
 * Endpoints pour la consultation des taux de TVA et calculs fiscaux.
 */
import { Router } from 'express';
import { taxController } from '../controllers/tax.controller.js';

const router = Router();

// Routes publiques : consultation des taux de TVA
router.get('/calculate', taxController.calculate);
router.get('/rates/:country', taxController.getCountryRates);
router.get('/countries', taxController.getAllCountries);

// Route pour vérification d'exonération (peut nécessiter auth selon votre besoin)
router.post('/check-exemption', taxController.checkExemption);

export default router;