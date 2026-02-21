import http from 'k6/http';
import { check, sleep } from 'k6';

// 🔑 PLACE TON TOKEN ICI
const ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhYWI0Mzc3YS02ZWVjLTRkNDItYTc0Zi04MWZlM2E0Y2JiY2UiLCJlbWFpbCI6ImhhbmlkZXIyN0BnbWFpbC5jb20iLCJyb2xlcyI6WyJBRE1JTiJdLCJpYXQiOjE3NzEzNDczMzUsImV4cCI6MTc3MTM1MDkzNSwiYXVkIjoibW9uLWVjb21tZXJjZS1jbGllbnQiLCJpc3MiOiJtb24tZWNvbW1lcmNlLWFwaSJ9.1A3R5QvvbXMv5DxJoGkEHj93x6t7LxPRjH9mRLeyrac';

export const options = {
    stages: [
        { duration: '1m', target: 100 },
        { duration: '2m', target: 300 },
        { duration: '2m', target: 600 },
        { duration: '1m', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<300'],
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    const BASE_URL = 'http://localhost:3001/api/v1';
    const variantId = '15b3b108-e4c5-4b14-9418-70b30d3a247e';
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

    // 2. Commande
    const orderPayload = JSON.stringify({
        items: [{ variantId: variantId, quantity: 1 }],
        shippingAddress: { email: 'hanider27@gmail.com' }
    });

    const resOrder = http.post(`${BASE_URL}/orders`, orderPayload, params);
    // Ajout d'un check ici pour valider la création
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
                'stripe-signature': 'dummy-signature-si-test'
            },
        });
        // Ajout d'un check ici
        check(resWebhook, { '3. Payment Processed (200)': (r) => r.status === 200 });
    }

    sleep(1);
}