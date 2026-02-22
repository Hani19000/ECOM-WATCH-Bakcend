import http from 'k6/http';
import { check, sleep } from 'k6';

const ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxZTQzZDVkMC1lM2I1LTRjZGItYTEyMi0zZDU1YTJhMDAwYmYiLCJlbWFpbCI6ImhhbmlkZXIyN0BnbWFpbC5jb20iLCJyb2xlcyI6WyJBRE1JTiJdLCJpYXQiOjE3NzE3OTY5NTcsImV4cCI6MTc3MTc5Nzg1NywiYXVkIjoibW9uLWVjb21tZXJjZS1jbGllbnQiLCJpc3MiOiJtb24tZWNvbW1lcmNlLWFwaSJ9.-XSHTDRcH8wJyQorpfDtBuYxZijywa1438gazX5bk1Y';

export const options = {
    stages: [
        { duration: '1m', target: 50 },  // Palier 1 : 50 utilisateurs 
        { duration: '2m', target: 100 }, // Palier 2 : 100 utilisateurs (montée en charge)
        { duration: '2m', target: 200 }, // Palier 3 : 200 utilisateurs (stress test)
        { duration: '1m', target: 0 },   // Redescente pour observer la récupération du serveur
    ],
    thresholds: {
        http_req_duration: ['p(95)<800'],
        http_req_failed: ['rate<0.70'],
    },
};

export default function () {
    const BASE_URL = 'https://ecom-watch.onrender.com/api/v1';
    const variantId = 'a628f143-f0c4-491f-b2f0-5876136505ba';

    const params = {
        headers: {
            'Authorization': `Bearer ${ADMIN_TOKEN}`,
            'Content-Type': 'application/json',
        },
    };

    // 1. Lecture du stock
    const resStock = http.get(`${BASE_URL}/inventory/${variantId}`, params);
    check(resStock, { '1. Stock OK (200)': (r) => r.status === 200 });

    sleep(1);

    // 2. Création de la commande avec Payload Complet
    const orderPayload = JSON.stringify({
        items: [
            {
                variantId: variantId,
                quantity: 1,
                productName: "Produit de Test K6",
                variantAttributes: { size: "25mm", color: "#C4C4C4" }
            }
        ],
        shippingAddress: {
            email: 'loadtest@ecom-watch.com',
            firstName: 'Load',
            lastName: 'Tester',
            address: '1 rue de la Performance',
            city: 'Paris',
            zipCode: '75001',
            country: 'France'
        }
    });

    const resOrder = http.post(`${BASE_URL}/orders/checkout`, orderPayload, params);

    // vérifie soit 201 (Succès), soit 409 (Conflit de numéro de commande)
    const orderProcessed = check(resOrder, {
        '2. Order Processed (201 or 409)': (r) => r.status === 201 || r.status === 409
    });

    // n'exécute le webhook QUE si la commande a été créée avec succès (201)
    if (resOrder.status === 201) {
        const body = JSON.parse(resOrder.body);
        const orderId = body.data?.order?.id || body.data?.id || body.id;

        if (orderId) {
            const webhookPayload = JSON.stringify({
                type: 'checkout.session.completed',
                data: {
                    object: {
                        metadata: { orderId: orderId.toString() },
                        payment_intent: 'pi_test_loadtest',
                        amount_total: 40000
                    }
                }
            });

            const resWebhook = http.post(`${BASE_URL}/payments/webhook/stripe`, webhookPayload, {
                headers: {
                    'Content-Type': 'application/json',
                    'stripe-signature': 'dummy-signature-test'
                },
            });

            check(resWebhook, { '3. Webhook Security OK (400)': (r) => r.status === 400 });
        }
    }

    sleep(1);
}