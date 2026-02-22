import http from 'k6/http';
import { check, sleep } from 'k6';

const ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxZTQzZDVkMC1lM2I1LTRjZGItYTEyMi0zZDU1YTJhMDAwYmYiLCJlbWFpbCI6ImhhbmlkZXIyN0BnbWFpbC5jb20iLCJyb2xlcyI6WyJBRE1JTiJdLCJpYXQiOjE3NzE3OTUzODQsImV4cCI6MTc3MTc5NjI4NCwiYXVkIjoibW9uLWVjb21tZXJjZS1jbGllbnQiLCJpc3MiOiJtb24tZWNvbW1lcmNlLWFwaSJ9.8Awfl2zpr6H2wKOK0EKkCtM4HHijYl1vjOgYX6BW3zk';

export const options = {
    // Paliers progressifs pour observer à quel moment le serveur ralentit
    stages: [
        { duration: '30s', target: 20 },  // Montée douce à 20 utilisateurs
        { duration: '1m', target: 50 },   // Pic à 50 utilisateurs constants
        { duration: '30s', target: 0 },   // Descente
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% des requêtes doivent répondre en moins de 500ms
        http_req_failed: ['rate<0.05'],   // Moins de 5% d'erreurs tolérées
    },
};

export default function () {
    // URL de ton backend en production sur Render
    const BASE_URL = 'https://ecom-watch.onrender.com/api/v1';

    // ID d'une variante existante EN PRODUCTION 
    const variantId = 'a628f143-f0c4-491f-b2f0-5876136505ba';

    const params = {
        headers: {
            'Authorization': `Bearer ${ADMIN_TOKEN}`,
            'Content-Type': 'application/json',
        },
    };

    // 1. Lecture du stock (Opération de lecture - Très rapide)
    const resStock = http.get(`${BASE_URL}/inventory/${variantId}`, params);
    check(resStock, { '1. Stock OK (200)': (r) => r.status === 200 });

    sleep(1); // Pause simulant la réflexion de l'utilisateur

    // 2. Création de la commande (Opération d'écriture - Plus lourde pour la BDD)
    const orderPayload = JSON.stringify({
        items: [{ variantId: variantId, quantity: 1 }],
        shippingAddress: { email: 'loadtest@ecom-watch.com' }
    });

    const resOrder = http.post(`${BASE_URL}/orders`, orderPayload, params);
    const orderOk = check(resOrder, { '2. Order Created (201)': (r) => r.status === 201 });

    if (orderOk) {
        const body = JSON.parse(resOrder.body);
        const orderId = body.data ? body.data.id : body.id;

        // 3. Webhook Stripe
        const webhookPayload = JSON.stringify({
            type: 'checkout.session.completed',
            data: {
                object: {
                    metadata: { orderId: orderId.toString() },
                    payment_intent: 'pi_test_123',
                    amount_total: 1000
                }
            }
        });

        const resWebhook = http.post(`${BASE_URL}/payments/webhook/stripe`, webhookPayload, {
            headers: {
                'Content-Type': 'application/json',
                'stripe-signature': 'dummy-signature-si-test' // Sera rejeté en production
            },
        });

        // En production, on S'ATTEND à ce que cette requête échoue (400) à cause de la fausse signature.
        // Si elle renvoie 200, c'est que la sécurité de ton webhook est désactivée !
        check(resWebhook, { '3. Webhook Rejected securely (400)': (r) => r.status === 400 });
    }

    sleep(1);
}