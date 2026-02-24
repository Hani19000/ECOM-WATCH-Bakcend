# README — Documentation Technique Complète du Backend `ECOM-WATCH`

## 1. Architecture globale

### 1.1 Pattern principal : Service Layer Pattern
Le backend applique un Service Layer Pattern strict :
1. **Controllers** : orchestration HTTP (input/output), aucune logique métier profonde.
2. **Services** : règles métier, sécurité fonctionnelle, transactions, cohérence inter-agrégats.
3. **Repositories** : SQL explicite, mapping des lignes base -> objets JS.

Pourquoi ce choix :
- Réduire le couplage entre HTTP et logique métier.
- Permettre des changements de transport (REST vers autre canal) sans réécrire le cœur métier.
- Faciliter les garanties de cohérence transactionnelle au bon niveau (services).

### 1.2 Pourquoi Node.js / Express
- Modèle I/O non bloquant adapté aux charges e-commerce.
- Excellente intégration avec Stripe, Redis, Sentry, node-cron.
- Express permet un pipeline middleware explicite, favorable à la sécurité défensive.

### 1.3 Invariants systémiques
- Les transitions de stock et commande sont pilotées par la couche service et confirmées en SQL transactionnel.
- Les webhooks de paiement sont validés cryptographiquement.
- Les accès guest sont protégés contre l’énumération (timing-safe + délais artificiels + messages neutres).
- Le cache n’est jamais la source de vérité pour les décisions critiques.

---

## 2. Structure des dossiers et rôle architectural

## `src/config`
Rôle architectural : centraliser toutes les décisions d’infrastructure (environnement, DB, sécurité HTTP, observabilité, upload).

### `src/config/environment.js`
Responsabilité unique : construire une configuration immuable, validée au démarrage.

Fonctions et intentions :
- Validation des variables obligatoires : éviter des fautes de configuration découvertes en production sur un chemin de code tardif.
- Support config PostgreSQL dual (URL cloud ou paramètres locaux) : portabilité de déploiement.
- `ENV` figé (`Object.freeze`) : empêcher les mutations runtime qui créent des comportements non déterministes.

Contraintes :
- Variables secrets obligatoires (JWT, Stripe, Sentry, etc.).
- Cohérence DB exigée avant bootstrap.

Garanties :
- Fail-fast explicite.
- Standardisation des accès de config dans tout le code.

### `src/config/database.js`
Responsabilité unique : gérer le pool PostgreSQL et son cycle de vie.

Fonctions :
- `connectPostgres()` : valider la connectivité au boot.
- `closePostgres()` : fermeture propre du pool.
- `pgPool` : singleton partagé.

Pourquoi :
- Éviter des connexions ad hoc dispersées.
- Prévenir la saturation de connexions et les fuites.

Garanties :
- Paramétrage pool borné.
- SSL cohérent entre environnements.

### `src/config/security.js`
Responsabilité unique : appliquer la politique de sécurité HTTP transverse.

Fonctions majeures :
- `helmetMiddleware` : CSP/HSTS pour réduire XSS/MITM.
- `corsMiddleware` : contrôle strict des origines.
- `compressResponse` : optimisation réseau contrôlée.
- Limiteurs : `generalLimiter`, `authLimiter`, `passwordChangeLimiter`, `trackingGuestLimiter`, `profileGeneralLimiter`, `passwordResetLimiter`.
- `notFound` : normalisation des 404.

Pourquoi :
- Segmenter le rate limit par risque métier (auth, reset, tracking guest).
- Éviter les protections monolithiques sous-optimales.

Garanties :
- Réduction brute-force, scraping et enumeration.
- Pipeline sécurité homogène.

### `src/config/cloudinary.js`
Responsabilité unique : externaliser le stockage médias vers Cloudinary.

Fonctions :
- `uploadCloud` : upload direct cloud.
- `buildCloudinaryUrl(rawUrl, options)` : rétro-optimiser des URLs anciennes sans ré-upload.

Pourquoi :
- Infrastructure stateless.
- Réduction coût disque local et simplification scaling horizontal.

Garanties :
- Formats contrôlés.
- Livraison CDN optimisée.

### `src/config/multer.config.js`
Responsabilité unique : valider les uploads côté serveur.

Fonctions :
- `fileFilter` : whitelist MIME image.
- `upload` : memory storage + limite taille.

Pourquoi :
- Limiter surface d’attaque des uploads.
- Éviter stockage intermédiaire non nécessaire.

Garanties :
- Contrôle format et taille avant traitement métier.

### `src/config/instruments.js`
Responsabilité unique : instrumenter Sentry le plus tôt possible.

Pourquoi :
- Capturer erreurs et rejets non gérés.
- Préserver la traçabilité des incidents.

---

## `src/constants`
Rôle architectural : source centrale des valeurs partagées.

### `src/constants/enums.js`
Responsabilité unique : référentiel des enums métier.
- `USER_ROLES`, `ORDER_STATUS`, `PAYMENT_STATUS`, `PRODUCT_STATUS`, `USER_STATUS`.
- `isValidEnum`, `validateEnum`.

Pourquoi :
- Aligner applicatif et contraintes DB.
- Éviter chaînes magiques divergentes.

### `src/constants/errors.js`
Responsabilité unique : messages d’erreur par domaine.
Pourquoi :
- Uniformiser les retours API.
- Préparer internationalisation.

### `src/constants/httpStatus.js`
Responsabilité unique : codes HTTP nommés.
Pourquoi :
- Lisibilité et élimination des magic numbers.

### `src/constants/roles.js`
Responsabilité unique : référentiel rôles/permissions.
Pourquoi :
- Gouvernance RBAC centralisée.

---

## `src/models`
Rôle architectural : contrats de données (documentation typée).

### `src/models/index.js`
Responsabilité unique : typedefs JSDoc des entités.
Pourquoi :
- Clarifier la modélisation e-commerce.
- Stabiliser les interfaces inter-couches.

---

## `src/middlewares`
Rôle architectural : contrôles transverses avant logique métier.

### `src/middlewares/auth.middleware.js`
Responsabilité unique : authentification JWT obligatoire.
Fonction :
- `protect`.

Pourquoi :
- Hydrater `req.user` comme prérequis RBAC.
- Refuser comptes inactifs.

Garanties :
- AuthN robuste.
- Continuité avec rolesRepo.

### `src/middlewares/optionalAuth.middleware.js`
Responsabilité unique : authentification opportuniste.
Fonction :
- `optionalAuth`.

Pourquoi :
- Supporter les flux guest sans dupliquer les routes.

Garanties :
- Dégradation gracieuse : token invalide => requête continue en guest.

### `src/middlewares/role.middleware.js`
Responsabilité unique : autorisation RBAC.
Fonction :
- `restrictTo(...allowedRoles)`.

Pourquoi :
- Contrôler l’accès à privilèges au bord des routes.

### `src/middlewares/validator.middleware.js`
Responsabilité unique : adaptation validations -> erreurs HTTP.
Fonction :
- `validate(validationFn, source)`.

Pourquoi :
- Éviter la duplication de try/catch.

### `src/middlewares/sanitizer.middleware.js`
Responsabilité unique : sanitation d’entrée légère.
Fonction :
- `sanitizer`.

Pourquoi :
- Réduire risque XSS sur données textuelles.
- Préserver les mots de passe non transformés.

### `src/middlewares/ratelimiter.middleware.js`
Responsabilité unique : ré-export des limiteurs.
Pourquoi :
- Découpler routes et module config.

### `src/middlewares/logger.middleware.js`
Responsabilité unique : journalisation requête/latence.
Fonction :
- `requestLogger`.

Pourquoi :
- Observabilité opérationnelle.

### `src/middlewares/multer.middleware.js`
Responsabilité unique : normaliser erreurs upload.
Fonction :
- `handleUpload(multerInstance, fieldName)`.

Pourquoi :
- Retourner des erreurs client compréhensibles.

### `src/middlewares/erroHandler.middleware.js`
Responsabilité unique : gestion d’erreur globale.
Fonctions :
- `handlePostgresError`, `sendErrorDev`, `sendErrorProd`, `errorHandler`.

Pourquoi :
- Dissocier erreurs opérationnelles et bugs.
- Éviter fuite d’informations en prod.

Garanties :
- Mapping explicite des codes PostgreSQL.
- Cohérence du contrat d’erreur API.

---

## `src/utils`
Rôle architectural : primitives transverses de robustesse.

### `src/utils/appError.js`
Responsabilité unique : hiérarchie d’erreurs métier.
Fonctions/classes :
- `AppError`, `NotFoundError`, `ValidationError`, `ConflictError`, `BusinessError`, `assertExists`.

Pourquoi :
- Différencier erreur attendue et défaut système.

### `src/utils/asyncHandler.js`
Responsabilité unique : capter les rejets async Express.
Fonction :
- `asyncHandler`.

Pourquoi :
- Supprimer le boilerplate.

### `src/utils/logger.js`
Responsabilité unique : abstraction de logging et Sentry.
Fonctions :
- `logError`, `logInfo`.

### `src/utils/response.js`
Responsabilité unique : uniformiser format réponse.
Fonctions :
- `sendSuccess`, `sendError`.

### `src/utils/validation.js`
Responsabilité unique : validation métier centralisée.
Fonctions principales :
- `isDefined`, `validateRequired`, `validateUUID`, `validateEnum`, `validateInteger`, `validateQuantity`, `validateAmount`, `validatePercentage`, `validateEmail`, `validatePasswordStrength`, `validatePhone`, `validateSKU`, `validateSlug`, `validateAddress`.

Pourquoi :
- Réduire divergence des règles d’entrée.
- Prévenir incohérences en stock/pricing/identité.

### `src/utils/healthCheck.js`
Responsabilité unique : sondes techniques.
Fonctions :
- `checkPostgres`, `healthCheck`.

---

## `src/routes`
Rôle architectural : hiérarchie des ressources API et application des middlewares.

### `src/routes/index.routes.js`
Responsabilité unique : agrégation des sous-routeurs.
- Applique `generalLimiter` globalement.
- Monte `auth`, `users`, `products`, `categories`, `promotions`, `cart`, `orders`, `shipping`, `payments`, `inventory`, `taxes`, `admin`, `sitemap`.

Pourquoi :
- Point d’entrée unique et cohérent de version API.

### `src/routes/auth.routes.js`
Responsabilité unique : endpoints d’auth/session/reset.
Pourquoi :
- Isoler endpoints à forte sensibilité brute-force.
Fonctions de validation inline : exigences minimales sur payload.

### `src/routes/users.routes.js`
Responsabilité unique : profil utilisateur + admin comptes.
Pourquoi :
- Séparer self-service de l’administration.
- Limiter les opérations critiques (changement mot de passe).

### `src/routes/admin.routes.js`
Responsabilité unique : endpoints réservés admin + pilotage cron.
Pourquoi :
- Encadrer les opérations d’exploitation.

### `src/routes/products.routes.js`
Responsabilité unique : lecture catalogue + mutations admin.
Pourquoi :
- Ordonner routes statiques avant paramétriques pour éviter collisions Express.

### `src/routes/categories.routes.js`
Responsabilité unique : taxonomie publique/administrée.

### `src/routes/cart.routes.js`
Responsabilité unique : panier authentifié.

### `src/routes/order.routes.js`
Responsabilité unique : cycle commande guest/auth/admin.
Pourquoi :
- Rendre explicite le modèle dual d’accès commande.

### `src/routes/payment.routes.js`
Responsabilité unique : session paiement, statut, webhooks publics.
Pourquoi :
- Permettre guest checkout tout en conservant sécurité signature webhook.

### `src/routes/shipping.routes.js`
Responsabilité unique : adresses, calculs transport, suivi.

### `src/routes/inventory.routes.js`
Responsabilité unique : lecture stock et administration inventaire.

### `src/routes/promotions.routes.js`
Responsabilité unique : promotions publiques et administration.

### `src/routes/tax.routes.js`
Responsabilité unique : consultation/calcul fiscal.

### `src/routes/sitemap.routes.js`
Responsabilité unique : exposition sitemap XML public.

---

## `src/controllers`
Rôle architectural : adaptation HTTP <-> services, sans logique métier profonde.

### `src/controllers/auth.controller.js`
Responsabilité unique : orchestrer auth et cookies de session.
Fonctions :
- `register` : créer utilisateur + session + cookie refresh.
- `login` : authentifier + session.
- `logout` : révoquer session.
- `refresh` : renouveler access token.
- `requestPasswordReset` : réponse neutre anti-énumération.
- `resetPassword` : consommation token + purge cookie.

### `src/controllers/users.controller.js`
Responsabilité unique : endpoints profil/admin utilisateurs.
Fonctions :
- `getProfile`, `updateProfile`, `updatePassword`, `getMyOrders`, `getAllUsers`, `deleteUser`, `updatePrivileges`.

### `src/controllers/admin.controller.js`
Responsabilité unique : exposer agrégats de pilotage.
Fonctions :
- `getStats`, `getSalesHistory`, `changeUserRole`.

### `src/controllers/product.controller.js`
Responsabilité unique : endpoints catalogue et variantes.
Fonctions :
- `getAll`, `getOne`, `create`, `update`, `delete`, `addVariant`, `getFilters`, `deleteVariant`.

### `src/controllers/categories.controller.js`
Responsabilité unique : CRUD catégories.
Fonctions :
- `getAllCategories`, `createCategory`, `updateCategory`, `deleteCategory`.

### `src/controllers/cart.controller.js`
Responsabilité unique : endpoints panier.
Fonctions :
- `getCart`, `addItem`, `updateQuantity`, `removeItem`, `clear`.

### `src/controllers/order.controller.js`
Responsabilité unique : endpoints commande bout-en-bout.
Fonctions :
- `previewTotal`, `checkout`, `cancelOrder`, `trackGuestOrder`, `claimOrder`, `getOrderDetail`, `getMyOrders`, `getAllOrders`, `updateStatus`.

### `src/controllers/payment.controller.js`
Responsabilité unique : endpoints paiement et redirections.
Fonctions :
- `createCheckoutSession`, `handleStripeWebhook`, `handlePayPalWebhook`, `checkStatus`, `handleSuccess`, `handleCancel`.
- Utilitaire : `isValidStripeSessionId`.

### `src/controllers/shipping.controller.js`
Responsabilité unique : endpoints transport/adresses/suivi.
Fonctions :
- `getAddresses`, `addAddress`, `deleteAddress`, `calculateOptions`, `getRates`, `getTracking`, `createShipment`, `updateTracking`.

### `src/controllers/inventory.controller.js`
Responsabilité unique : endpoints inventaire.
Fonctions :
- `getStock`, `adjustStock`, `getLowStockAlerts`, `addStock`, `getAllInventory`.

### `src/controllers/promotions.controller.js`
Responsabilité unique : endpoints promotions.
Fonctions :
- `create`, `getAll`, `getOne`, `update`, `delete`, `toggle`.

### `src/controllers/tax.controller.js`
Responsabilité unique : endpoints fiscalité.
Fonctions :
- `calculate`, `getCountryRates`, `getAllCountries`, `checkExemption`.

### `src/controllers/sitemap.controller.js`
Responsabilité unique : génération XML SEO.
Fonctions :
- `generateProductsSitemap`, `getSitemap`.
Utilitaires : `escapeXml`, `formatDate`.

---

## `src/services`
Rôle architectural : cœur métier, invariants fonctionnels, cohérence transactionnelle.

### `src/services/orders.service.js`
Responsabilité unique : cycle de vie commande et cohérence stock/paiement/statut.

Fonctions privées :
- `#calculateTotals(items, country, method, category)` : calculer total de façon normative (shipping + taxe) pour éviter divergence front/back.
- `#artificialDelay()` : homogénéiser timing des échecs guest.
- `#timingSafeEmailCompare(stored, provided)` : neutraliser side-channel timing.
- `#resolveEffectivePrice(variantId, basePrice, client)` : prix effectif avec promotions actives.
- `#invalidateVariantCache(variantId)` : invalidation non bloquante après mutation.
- `#sendOrderStatusNotification(...)` : notifier sans bloquer flux critique.

Fonctions publiques :
- `cancelOrderAndReleaseStock(orderId, reason)` : atomicité annulation + libération réservations.
- `cancelPendingOrder(orderId, user, email)` : annulation contrôlée et idempotente.
- `_assertOrderAccess(order, user, email)` : contrôle ownership centralisé.
- `createOrderFromCart(userId, checkoutData)` : transaction de création commande/réservation.
- `previewOrderTotal(userId, checkoutData)` : simulation fiable de pricing.
- `getUserOrders(userId)` : détail commandes authentifiées.
- `getOrderDetails(orderId, user)` : accès auth ou admin.
- `getOrderHistory(userId, options)` : pagination historique.
- `getOrderDetailsGuest(orderId, email)` : accès guest durci.
- `trackOrderGuest(orderNumber, email)` : suivi guest sécurisé.
- `claimGuestOrder(orderId, newUserId, verificationEmail)` : rattachement ownership.
- `autoClaimGuestOrders(newUserId, email)` : conversion guest -> compte.
- `updateOrderStatus(orderId, newStatus)` : transition état + effets secondaires.
- `listAllOrders(params)` : vue admin.

Contraintes métier :
- Interdiction d’annuler une commande déjà payée ou expédiée.
- Guest tracking conditionné par email de la commande.
- Prix et taxe calculés côté backend uniquement.

Garanties :
- **Atomicité** en transaction SQL.
- **Idempotence** sur annulation déjà effectuée.
- Réduction **race conditions** sur stock via repo conditionnel.

### `src/services/payment.service.js`
Responsabilité unique : orchestration paiement Stripe et traitement webhooks.

Fonctions :
- `createSession(orderId, user)` : préparer checkout sécurisé (guest/auth).
- `processStripeWebhook(rawBody, signature)` : valider signature et router événements.
- `_handleCheckoutCompleted(session)` : transaction statut commande + stock vente confirmée.
- `_handleCheckoutExpired(session)` : annulation et libération stock idempotente.
- `_invalidateProductCache(variantId)` : cohérence cache.
- `_sendGuestOrderConfirmation(email, orderData)` : confirmation guest.
- `_handlePaymentFailed(paymentIntent)` : extension prévue.
- `getPaymentStatus(orderId, user, guestEmail)` : statut paiement avec contrôle ownership.
- `getPaymentHistory(orderId)` : historique transactionnel.
- `_triggerPostPaymentNotifications(session, orderId)` : notifications asynchrones.

Pourquoi :
- Séparer explicitement “intention de payer” (session) et “paiement prouvé” (webhook).

Garanties :
- Signature HMAC obligatoire.
- Transaction unique pour éviter état “commande payée sans stock confirmé”.

### `src/services/products.service.js`
Responsabilité unique : gouvernance catalogue/variantes/cache.

Fonctions :
- `#getCacheKey`, `#invalidateProductCache`.
- `checkAvailability(slug, sku)` : prévenir conflits d’identité produit.
- `#safeParseAttributes` : nettoyage attributs pour éviter pollution de données.
- `#resolveDisplayPrice` : afficher prix vitrine cohérent avec promos.
- `getProductDetails(idOrSlug)` : lecture enrichie et cache-aside.
- `listCatalog(filters)` : catalogue paginé avec enrichissement prix.
- `createProductWithVariant(productData, variantData, imageUrl)` : création atomique produit+variante+stock.
- `updateProduct(id, updateData)` : mutation produit + invalidation cache.
- `addVariantToProduct(productId, variantData)` : extension produit.
- `deleteProduct(productId)` : suppression contrôlée.
- `validateVariants(variantIds)` : contrôle existence/stock multi-IDs.
- `updateVariant(variantId, updateData)`.
- `deleteVariant(variantId)` : protège invariant “au moins une variante”.
- `getProductFilters()`.

### `src/services/inventory.service.js`
Responsabilité unique : stratégie d’inventaire et nettoyage des réservations.

Fonctions :
- `#invalidateCache(variantId)` : cohérence cache variant/product/catalog.
- `#cancelOrderAndReleaseStock(orderId)` : annulation transactionnelle dédiée.
- `getAllInventory(params)` : vue admin paginée.
- `getStockLevel(variantId)` : lecture stock résiliente cache/DB.
- `adjustStock(variantId, quantity, reason)` : correction admin.
- `getLowStockAlerts()` : alerting réappro.
- `reserveStock(variantId, quantity, client)` : réservation sécurisée.
- `cleanupExpiredReservations()` : annulation lot des commandes expirées.
- `restockVariant(variantId, quantity)` : réapprovisionnement.

Pourquoi :
- Dissocier la logique de réservation (pré-vente) de la vente confirmée (post-paiement).

### `src/services/shipping.service.js`
Responsabilité unique : calcul transport, adresses, expéditions.

Fonctions :
- `#getZone(country)`, `#getEstimatedDelivery(zone, method)`, `#getMethodLabel(method)`.
- `calculateShippingCost(country, totalWeight, method, subtotal)`.
- `getAvailableOptions(country, totalWeight, subtotal)` : options et cache.
- `calculateRates(cartId, {country})` : compat legacy.
- `getUserAddresses`, `createAddress`, `deleteAddress`.
- `createShipment(orderId, carrier)` : exige commande payée.
- `updateTracking(shipmentId, status, currentLocation)` : propagation statut commande.
- `getShipmentByOrder(orderId)`, `getShipmentForUser(orderId, userId)`.

### `src/services/auth.service.js`
Responsabilité unique : inscription, login, refresh, logout.

Fonctions :
- `#createAuthSession(user)` : factoriser access/refresh + persistance session.
- `register(payload)` : création compte transactionnelle + rôle + auto-claim + notification.
- `login(payload)` : authentification + auto-claim.
- `logout(refreshToken)` : révocation ciblée.
- `refreshAccessToken(refreshToken)` : validation session whitelist.

Contraintes :
- Messages d’erreur non discriminants sur identifiants.
- Blocage compte inactif.

### `src/services/users.service.js`
Responsabilité unique : profil, privilèges, sécurité mot de passe.

Fonctions :
- `getUserProfile`, `listAllUsers`.
- `deleteUser(targetUserId, currentAdminId)` : anti auto-suppression et anti suppression admin.
- `updatePrivileges(targetUserId, privileges, currentAdminId)` : anti auto-modification.
- `getProfile(userId)` : projection sûre.
- `changePassword(userId, payload)` : vérification ancien MDP + historique.
- `#clearUserCache(userId)`.

### `src/services/passwordreset.service.js`
Responsabilité unique : flux reset sécurisé.

Fonctions :
- `#generateToken()`.
- `requestReset(email)` : neutralité anti-énumération.
- `resetPassword(rawToken, newPassword)` : token usage unique, historique, invalidation sessions.
- `#assertPasswordNotReused`.
- `#invalidateAllSessions`.
- `#sendResetNotification`.

### `src/services/password.service.js`
Responsabilité unique : hash PBKDF2 et comparaison timing-safe.
Fonctions :
- `generateSalt`, `hashPassword`, `comparePassword`.

### `src/services/token.service.js`
Responsabilité unique : JWT access/refresh.
Fonctions :
- `generateAccessToken`, `generateRefreshToken`, `verifyAccessToken`, `verifyRefreshToken`, `decodeToken`.

### `src/services/session.service.js`
Responsabilité unique : sessions hybrides Redis + DB.
Fonctions :
- `createSession`, `validateSession`, `deleteSession`.
Pourquoi :
- Redis pour latence ; DB pour révocation durable.

### `src/services/roles.service.js`
Responsabilité unique : administration RBAC.
Fonctions :
- `getAllRoles`, `assignRoleToUser`, `removeRoleFromUser`, `createCustomRole`, `deleteRole`.
Invariant :
- Conservation d’au moins un admin.

### `src/services/cart.service.js`
Responsabilité unique : agrégation panier et contrôle stock.
Fonctions :
- `#getCacheKey`, `#invalidateCartCache`.
- `getFullCart`, `getCartByUserId`, `addToCart`, `updateItemQuantity`, `removeItemFromCart`, `clearCart`, `mergeCarts`.

### `src/services/categories.service.js`
Responsabilité unique : taxonomie et intégrité des catégories.
Fonctions :
- `#getCacheKey`, `getAllCategories`, `createCategory`, `assignCategoriesToProduct`, `updateCategory`, `deleteCategory`.
Invariant :
- Empêcher suppression d’une catégorie encore utilisée.

### `src/services/promotions.service.js`
Responsabilité unique : cycle promotion et cohérence cache.

Fonctions :
- `#buildProductCacheKeys`, `#invalidateProductsCache`, `#validateDates`, `#validatePercentage`.
- `createPromotion`, `listPromotions`, `getPromotionDetails`, `updatePromotion`, `deletePromotion`, `calculateDiscountedPrice`, `togglePromotionStatus`.

### `src/services/admin.service.js`
Responsabilité unique : agrégats dashboard.
Fonctions :
- `getDashboardStats`, `getSalesHistory`, `getSalesReport`, `updateUserRole`.

### `src/services/profile.service.js`
Responsabilité unique : profil avancé et flux guest lié aux commandes.
Fonctions :
- `getFullProfile`, `updateProfileWithValidation`, `getOrderHistory`, `trackOrderGuest`, `claimGuestOrder`, `autoClaimGuestOrders`, `#artificialDelay`.

### `src/services/tax.service.js`
Responsabilité unique : fiscalité multi-pays.
Fonctions :
- `getCountryRates`, `calculateTax`, `extractTaxFromTotal`, `isEligibleForExemption`, `getAllSupportedCountries`.

### `src/services/sitemap.service.js`
Responsabilité unique : sitemap XML à la volée.
Fonctions :
- `generate`.
Utilitaires :
- `escapeXml`, `toW3CDate`, `buildUrlEntry`, `fetchActiveProductSlugs`.

### `src/services/cache.service.js`
Responsabilité unique : façade Redis.
Fonctions :
- `connect`, `set`, `get`, `delete`, `deleteMany`.

### `src/services/health.service.js`
Responsabilité unique : état de santé dépendances.
Fonction :
- `check`.

### `src/services/notifications/email.service.js`
Responsabilité unique : transport email transactionnel.
Fonctions :
- `_sendEmail`, `_stripHtml`, `sendOrderConfirmation`, `sendOrderShipped`, `sendOrderDelivered`, `sendOrderCancelled`, `sendOrderStatusUpdate`, `sendWelcomeEmail`, `sendPasswordReset`.

### `src/services/notifications/notification.service.js`
Responsabilité unique : orchestration événementielle des notifications.
Fonctions :
- `_getCustomerEmail`, `notifyOrderPaid`, `notifyOrderShipped`, `notifyOrderDelivered`, `notifyOrderCancelled`, `notifyOrderGenericUpdate`, `notifyOrderStatusChange`, `notifyUserRegistered`, `notifyPasswordReset`.

### `src/services/templates/email/index.js`
Responsabilité unique : bibliothèque de templates HTML email.
Fonctions/scripts :
- `getBaseTemplate`, `formatPrice`, `formatDate`, `emailTemplates.orderConfirmation`, `orderShipped`, `orderDelivered`, `orderCancelled`, `orderStatusUpdate`, `welcome`, `passwordReset`.

---

## `src/repositories`
Rôle architectural : persistance SQL explicite, validations structurelles, mappings homogènes.

### `src/repositories/_mappers.js`
Responsabilité unique : conversion `snake_case` -> `camelCase`.
Fonctions :
- `mapRow`, `mapRows`.

### `src/repositories/index.js`
Responsabilité unique : point d’entrée consolidé des repositories.

### `src/repositories/orders.repo.js`
Responsabilité unique : persister commandes, items, vues guest/auth/admin.

Fonctions :
- `createOrder`, `addItem`, `createWithItems`.
- `findById`, `findGuestOnlyById`, `findByOrderNumberAndEmail`, `findGuestOrdersByEmail`.
- `transferOwnership`.
- `listByUserId`, `listItems`.
- `updateStatus`.
- `getUserStats`, `findAll`, `findExpiredPendingOrders`, `getGlobalStats`, `getDailySalesHistory`.

Pourquoi :
- Séparer en SQL le périmètre guest (`user_id IS NULL`) du périmètre authentifié.
- Empêcher transferts concurrents via `FOR UPDATE`.

Garanties :
- Contrôle d’accès cohérent dès la persistance.
- Résistance à l’énumération par comparaison timing-safe.

### `src/repositories/inventory.repo.js`
Responsabilité unique : opérations stock atomiques.

Fonctions :
- `upsert`, `reserve`, `release`, `confirmSale`, `findAll`, `addStock`, `removeStock`, `findByVariantId`, `checkAvailability`, `findLowStock`, `findOutOfStock`, `getStats`.

Pourquoi :
- Garantir intégrité du stock sans verrou applicatif manuel.

Garanties :
- Conditions SQL atomiques (`available_stock >= qty`, `reserved_stock >= qty`).
- Erreurs métier explicites sur stock insuffisant.

### `src/repositories/products.repo.js`
Responsabilité unique : persistance catalogue/variantes/promotions actives.

Fonctions :
- `create`, `findById`, `findBySlug`, `list`, `update`, `getUniqueSizes`.
- `addVariant`, `findVariantBySku`, `listVariantsByProduct`, `deleteById`.
- `getFullDetails`, `findVariantById`, `updateVariant`, `deleteVariantById`.
- `findExistingVariantIds`, `validateVariants`.
- `count`, `countLowStock`, `findActivePromotionPrice`.

Pourquoi :
- Agréger les informations en SQL pour éviter les N+1 et maintenir performances catalogue.

### `src/repositories/carts.repo.js`
Responsabilité unique : panier et items.

Fonctions :
- `create`, `findById`, `findByIdOrFail`, `findByUserId`, `getOrCreate`.
- `addItem`, `setItemQuantity`, `updateItemQuantity`, `removeItem`, `removeItemByVariant`, `clearCart`.
- `listItems`, `calculateTotal`, `countItems`, `hasItems`, `delete`.

Pourquoi :
- Offrir une API repository expressive pour limiter logique SQL dans services.

### `src/repositories/users.repo.js`
Responsabilité unique : comptes utilisateurs et secrets.

Fonctions :
- `create`, `findById`, `findByEmail`, `list`, `findByEmailWithCredentials`, `updateProfile`, `setActive`, `deleteById`, `updateCredentials`, `count`, `getPasswordHistory`, `addToHistory`.

Pourquoi :
- Séparer lectures sûres (sans secrets) et lectures auth (avec hash/salt).

### `src/repositories/roles.repo.js`
Responsabilité unique : persistance RBAC.

Fonctions :
- `list`, `findAll`, `findByName`, `findById`, `create`, `delete`, `countUsersByRole`, `seedDefaults`, `addUserRole`, `assignRoleByName`, `removeUserRole`, `listUserRoles`.

### `src/repositories/promotions.repo.js`
Responsabilité unique : promotions et associations.

Fonctions :
- `create`, `list`, `findById`, `update`, `delete`, `addToProduct`, `addToVariant`, `removeFromProduct`, `removeFromVariant`, `getActiveByProduct`, `getActiveByVariant`, `incrementUsage`, `getLinkedProducts`, `getLinkedVariants`.

### `src/repositories/categories.repo.js`
Responsabilité unique : taxonomie produit.

Fonctions :
- `create`, `findById`, `findBySlug`, `list`, `addProductCategory`, `linkProductToCategory`, `removeProductCategory`, `listByProductId`, `update`, `delete`, `removeAllFromProduct`.

### `src/repositories/shipments.repo.js`
Responsabilité unique : suivi d’expédition.

Fonctions :
- `create`, `update`, `updateTracking`, `markShipped`, `markDelivered`, `findByOrderId`, `findById`.

### `src/repositories/adresses.repo.js`
Responsabilité unique : adresses utilisateur.

Fonctions :
- `create`, `findByUserId`, `delete`.

Invariant :
- Unicité fonctionnelle de l’adresse par défaut via update préalable.

### `src/repositories/payments.repo.js`
Responsabilité unique : enregistrement des tentatives/statuts paiement.

Fonctions :
- `create`, `setStatus`, `listByOrderId`.

### `src/repositories/passwordreset.repo.js`
Responsabilité unique : tokens reset hashés.

Fonctions :
- `createToken`, `findValidToken`, `deleteToken`.

### `src/repositories/refreshTokens.repo.js`
Responsabilité unique : persistance refresh tokens.

Fonctions :
- `create`, `findByToken`, `revokeById`, `revokeByUserId`, `deleteExpired`.

---

## `src/jobs`
Rôle architectural : maintenance asynchrone du système.

### `src/jobs/index.js`
Responsabilité unique : enregistrer et démarrer/arrêter les crons.
Fonctions :
- `initializeCronJobs`, `shutdownCronJobs`.

### `src/jobs/schedulers/cronScheduler.js`
Responsabilité unique : orchestrateur générique de jobs.
Fonctions :
- `register`, `registerMany`, `startAll`, `stopAll`, `stop`, `restart`, `unregister`, `executeNow`, `listJobs`.

Pourquoi :
- Gouvernance opérationnelle uniforme des tâches de fond.

### `src/jobs/cron/inventory.cron.js`
Responsabilité unique : libérer réservations expirées.
Pourquoi :
- Éviter gel stock dû paniers/checkout abandonnés.

### `src/jobs/cron/orders.cron.js`
Responsabilité unique : annuler commandes pendantes anciennes.
Pourquoi :
- Maintenir cohérence commerciale et disponibilité stock.

### `src/jobs/cron/sessions.cron.js`
Responsabilité unique : purge tokens expirés.
Pourquoi :
- Hygiène sécurité et maîtrise volumétrie.

### `src/jobs/cron/stats.cron.js`
Responsabilité unique : rafraîchir vues/statistiques admin.
Pourquoi :
- Garantir fraîcheur analytique sans recalcul coûteux à chaque requête.

### `src/jobs/cron/archive.cron.js`
Responsabilité unique : archiver commandes historiques.
Pourquoi :
- Préserver performance tables actives.

---

## 3. Entrée application et bootstrap

### `src/app.js`
Responsabilité unique : composer le pipeline Express.
Décisions clés :
- `trust proxy` activé pour IP réelles derrière load balancer.
- Capture `rawBody` webhooks avant parsing JSON complet.
- Ordonnancement sécurité -> routing -> gestion erreurs.
- Démarrage des cron jobs au boot + arrêt propre sur signaux.

### `src/server.js`
Responsabilité unique : démarrer l’écoute réseau et superviser erreurs fatales.
Décisions clés :
- Le serveur écoute avant la DB pour satisfaire health checks PaaS.
- Gestion explicite `uncaughtException` et `unhandledRejection`.

---

## 4. Performance (hors tests unitaires)

### `src/tests/performance/load-test.js` (script K6 de charge)
Responsabilité unique : valider comportement sous montée en charge transactionnelle.

Pourquoi les paliers 50 et 200 utilisateurs (avec intermédiaire 100) :
- 50 VUs : charge nominale réaliste.
- 200 VUs : stress significatif pour observer saturation contrôlée et qualité de dégradation.
- Palier intermédiaire : visualiser la pente de dégradation plutôt qu’un point binaire.

Thresholds :
- `http_req_duration p(95)<800` : protéger l’expérience majoritaire.
- `http_req_failed rate<0.70` : seuil de rupture tolérant pour diagnostic de stress extrême.

Scénario :
- Lecture stock -> création commande -> simulation webhook.
Pourquoi :
- Tester un flux métier transversal (pas uniquement endpoint isolé).

---

## 5. Fichiers racine et infrastructure externe

### `src/server.js`, `src/app.js`
Déjà couverts : bootstrap runtime et pipeline HTTP.

### `package.json`
Responsabilité unique : dépendances et scripts d’exécution.
Pourquoi :
- Encadrer run/test/dev et dépendances critiques (Express, pg, redis, stripe, sentry).

### `docker/Dockerfile`, `docker-compose.yml`
Responsabilité unique : portabilité d’exécution et composition des services.
Pourquoi :
- Standardiser environnement de déploiement/local.

### `init-postgres.sql`, `migrations/*.sql`
Responsabilité unique : schéma, procédures SQL, optimisations production.
Pourquoi :
- Déporter les invariants relationnels et routines lourdes au plus près des données.

---

## 6. Garanties transverses de fiabilité

1. **Atomicité**
- Création de commande, confirmation paiement, claim ownership : encapsulés en transactions.

2. **Prévention des race conditions**
- Réservation stock par `UPDATE ... WHERE available_stock >= qty`.
- Confirmation vente par `reserved_stock >= qty`.

3. **Idempotence**
- Annulation déjà effectuée non destructive.
- Événements webhook expirés ignorés si commande déjà traitée.

4. **Sécurité défensive**
- Rate limiting spécialisé.
- RBAC route-level.
- Validation + sanitation.
- Signature webhook obligatoire.

5. **Résilience opérationnelle**
- Redis utilisé en accélérateur avec fallback DB.
- Cron isolés : échec local n’arrête pas l’ensemble.

6. **Observabilité**
- Sentry + logs contextuels + endpoint health.
  
---

### src/config/environment.js
- 1 `import 'dotenv/config';` : charge variables d’environnement avant tout accès, évite des undefined.
- 3‑14 `requiredEnv = [...]` : liste minimale pour faire tourner l’app (ports, JWT, Sentry, Redis, Stripe, client URL) ; fail-fast si absent.
- 17‑23 `hasPostgresConfig` : accepte soit `DATABASE_URL` (cloud/pooler) soit triplet host/user/pass/db ; rend la config DB explicite.
- 25‑32 `missingEnv` + erreur : stoppe le boot si config incomplète ; protège contre des crashs en charge.
- 34 `isProduction` : drapeau unique pour branches sécurité (SSL, logs).
- 36‑82 `ENV = Object.freeze({ ... })` : construit la config immuable ; sections server, database (postgres/redis), jwt (secrets + expirations), bcrypt (iterations PBKDF2), rateLimit (fenêtres paramétrables), sentry, stripe, cloudinary, clientUrl, email.  
  Garanties : lecture homogène, impossibilité de muter à runtime, valeurs par défaut contrôlées.

### src/config/database.js
- 1‑6 imports pg, ENV, logger.
- 12‑25 `poolConfig` : priorise `connectionString` (Neon/Render) avec SSL, sinon host/user/pass avec SSL seulement en prod ; réduit erreurs de certificat.
- 27‑32 `finalConfig` : ajoute pooling (max 20, idle 30s, connect timeout 5s) pour éviter exsanguination de connexions.
- 34 `pgPool = new Pool(finalConfig)` : singleton partagé.
- 40‑56 `connectPostgres()` : log cible (URL vs host:port), fait un connect/release pour fail-fast ; propage l’erreur après log.
- 58‑66 `closePostgres()` : ferme le pool proprement, log succès/échec.

### src/config/security.js
- 1‑9 imports helmet/cors/compression/rateLimit, ENV, ERRORS, logInfo, HTTP_STATUS, NotFoundError.
- 18‑29 `getClientIp(req)` : récupère IP réelle derrière proxy (x-forwarded-for) ; clé pour rate limit cohérent.
- 31‑37 `getAllowedOrigins()` : allowlist par défaut en prod (vercel + wildcard vercel app).
- 39‑47 `getOrigins()` : fusion CORS_ORIGINS env + defaults, dédoublonne ; autorise regex.
- 49 `origins` : memo résultant.
- 58‑84 `helmetMiddleware` : CSP stricte (self, cloudinary images, sentry connect), HSTS 1 an ; limite XSS/MI(TM).
- 90‑112 `corsMiddleware` : callback origin → match exact/regex ou autorise requêtes sans origin (mobile, cURL) ; renvoie erreur explicite sinon.
- 118‑129 `compressResponse` : compression conditionnelle (disable via header), niveau 6 compromis CPU/bande passante.
- 137‑151 `generalLimiter` : fenêtre ENV, clé IP réelle ; standardHeaders on.
- 153‑180 `authLimiter` : plus strict, handler personnalisé log + message user-friendly ; cible brute-force login/register.
- 186‑209 `passwordChangeLimiter` : protège brute-force sur mot de passe actuel ; clé IP+user.
- 215‑239 `trackingGuestLimiter` : empêche énumération d’IDs commande ; clé IP.
- 245‑272 `profileGeneralLimiter` : permissif (5000) pour navigation/polling profil ; clé IP+user.
- 278‑300 `passwordResetLimiter` : 5 req/h ; clé IP only (user déconnecté).
- 310‑320 `notFound` : middleware 404 → NotFoundError avec URL ; uniformise gestion des routes manquantes.

### src/config/cloudinary.js
- 1‑8 imports cloudinary v2, CloudinaryStorage, multer, ENV.
- 10‑14 `cloudinary.config` : applique secrets env.
- 16‑28 `storage = new CloudinaryStorage({...})` : dossier `fburger`, formats whitelist, transformation unique (w/h limit 800, f_auto q_auto) pour CDN caching performant.
- 30 `uploadCloud = multer({ storage })` : middleware prêt à l’emploi (stream direct, pas d’écriture disque).
- 32‑54 `buildCloudinaryUrl(rawUrl, {width=800,height=800})` : insère f_auto,q_auto,w,h,c_limit dans une URL déjà stockée ; évite double injection ; retourne l’original si déjà optimisée ou hors domaine Cloudinary.

### src/config/multer.config.js
- 1‑7 imports multer, ValidationError.
- 9‑11 constantes ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES (5 MB) : compromis qualité/bande passante.
- 13‑18 `fileFilter` : accepte seulement images, sinon ValidationError lisible.
- 20‑28 `upload = multer({ storage: memoryStorage, fileFilter, limits })` : évite écriture disque, limite taille.

### src/config/instruments.js
- 1‑6 imports Sentry, profiling, dotenv.
- 8‑14 `Sentry.init` : dsn, profiling integration, sampleRate=1 pour traces+profils ; doit être importé en tout premier (voir server.js).

---

### src/middlewares/auth.middleware.js
- 1‑9 imports tokenService, usersRepo, rolesRepo, AppError, HTTP_STATUS, asyncHandler.
- 11‑38 `protect` (asyncHandler) :  
  - extrait Bearer token ; si absent → 401.  
  - verifyAccessToken → si invalide → 401.  
  - charge user (findById) ; si absent → 401.  
  - si `isActive` false → 403 suspendu.  
  - charge roles, hydrate `req.user = {...user, roles}`.  
  - `next()`.

### src/middlewares/optionalAuth.middleware.js
- 1‑8 imports tokenService, usersRepo, rolesRepo, asyncHandler.
- 10‑46 `optionalAuth` :  
  - si pas de Bearer → req.user=undefined, next.  
  - try verifyAccessToken ; si invalide → user undefined, next.  
  - charge user ; si absent → undefined, next.  
  - charge roles, hydrate req.user ; next.  
  - catch global → undefined, next.  
  But : flux guest sans rejet.

### src/middlewares/role.middleware.js
- 1‑6 imports AppError, HTTP_STATUS.
- 10‑28 `restrictTo(...allowedRoles)` retourne middleware :  
  - si pas req.user/roles → 401.  
  - si intersection vide → 403.  
  - sinon next.  
  Principe : RBAC simple par rôle nominal.

### src/middlewares/validator.middleware.js
- 1‑4 imports HTTP_STATUS, AppError.
- 6‑20 `validate(validationFn, source='body')` : exécute validationFn sur req[source]; catch → si AppError alors next(error) sinon AppError 400 générique. Centralise la traduction validation→HTTP.

### src/middlewares/sanitizer.middleware.js
- 5‑18 `sanitizeValue` : trim + échappement `<` `>` pour strings.  
- 20‑35 `sanitizeObject` : récursif, skip champs contenant 'password', applique sanitizeValue.  
- 37‑43 `sanitizer` : applique à body/query/params ; next.  
  Pourquoi : réduire XSS basique tout en préservant mots de passe.

### src/middlewares/ratelimiter.middleware.js
- Re-export `generalLimiter`, `authLimiter` depuis config/security : évite couplage direct aux routes.

### src/middlewares/logger.middleware.js
- 1‑5 imports ENV, logInfo.
- 7‑30 `requestLogger` : no-op en test ; mesure durée via event `finish`; color code status (2xx vert, 4xx jaune, 5xx rouge) pour lisibilité console dev ; logInfo avec méthode, url, status, durée.

### src/middlewares/multer.middleware.js
- 1‑6 imports multer, HTTP_STATUS.
- 8‑33 `handleUpload(multerInstance, fieldName)` : wrap `.single(fieldName)` ; gère `MulterError` (taille) -> 400 avec message clair ; autres erreurs -> 400 ; sinon next.

### src/middlewares/erroHandler.middleware.js
- 1‑6 imports AppError, HTTP_STATUS, ENV, logError.
- 12‑26 `handlePostgresError(err)` : map codes 23505 (unique) -> 409, 23503 (FK) -> 400, 22P02 (UUID malformé) -> 400 ; sinon retourne err.
- 28‑38 `sendErrorDev` : renvoie stack + objet erreur pour debug.
- 40‑57 `sendErrorProd` : si `isOperational` → message safe ; sinon logError et 500 générique.
- 59‑80 `errorHandler(err, _req, res, _next)` : normalise status/statusCode ; en prod copie message, map postgres/JWT expiré/invalide ; délègue à sendErrorProd ou Dev selon NODE_ENV.

---

### src/utils/appError.js
- 8‑18 `AppError` : name = class, statusCode, status = 'fail' 4xx sinon 'error', `isOperational=true`, captureStackTrace.
- 20‑25 `NotFoundError(resource,id)` : 404 “Resource with ID … not found”.
- 27‑32 `ValidationError` : 400.
- 34‑39 `ConflictError` : 409.
- 41‑46 `BusinessError` : 422.
- 48‑55 `assertExists(resource, resourceName, id)` : throw NotFound si falsy.

### src/utils/asyncHandler.js
- 6‑8 `asyncHandler(fn)` : retourne wrapper Promise.resolve(fn).catch(next) pour Express.

### src/utils/logger.js
- 6‑17 `isProduction` flag.  
- 19‑27 `logError(error, context={})` : Sentry extras + captureException ; en dev log console message+context JSON.  
- 32‑42 `logInfo(message)` : en dev console.log ; en prod breadcrumb Sentry (pas de console).

### src/utils/response.js
- 10‑14 `sendSuccess(res, statusCode, data=null)` : {success:true,data}.  
- 18‑22 `sendError(res, statusCode, message)` : {success:false,message}.

### src/utils/validation.js
- 11‑14 `isDefined` : non undefined/null/''.
- 16‑23 `validateRequired(data, requiredFields)` : liste champs manquants → ValidationError.
- 25‑33 `validateUUID(value, fieldName='ID')` : regex UUIDv4, sinon ValidationError.
- 35‑44 `validateEnum(value, allowedValues, fieldName='Field')` : si valeur hors liste → ValidationError.
- 46‑53 `validateInteger(number, fieldName='Quantity')` / alias `validateQuantity` : entier >=0 sinon ValidationError.
- 55‑63 `validateAmount(amount, fieldName='Amount')` : number positif sinon ValidationError.
- 65‑72 `validatePercentage(value, fieldName='Percentage')` : 0‑100 sinon ValidationError.
- 74‑81 `validateEmail(email)` : regex RFC simplifiée, sinon ValidationError.
- 83‑92 `validatePasswordStrength(password)` : min 8, au moins une majuscule et un chiffre, sinon ValidationError.
- 94‑100 `validatePhone(phone)` : regex tel 8‑15 chiffres ; si présent et invalide → ValidationError.
- 102‑110 `validateSKU(sku)` : regex A-Z0-9-_ 3‑30 ; sinon ValidationError.
- 112‑118 `validateSlug(slug)` : regex lowercase + tirets ; sinon ValidationError.
- 120‑128 `validateAddress(address)` : doit être objet, champs street/city/country/postalCode ; code postal 3‑10 ; sinon ValidationError.

### src/utils/healthCheck.js
- 8‑18 `checkPostgres(pgPool)` : SELECT 1, retourne {status:'up'} ou {status:'down',error}.
- 20‑30 `healthCheck(pgPool)` : exécute sondes en parallèle (actuellement Postgres), agrège résultat.


**Services – Détail complet (intention, notions, “pourquoi”)**

---

### src/services/orders.service.js
- Imports (repos/services/utils) : fédère persistance commande/stock/promo + fiscalité + notifications + cache + transactions (pgPool) + crypto pour timing-safe.
- Singleton (constructor) : éviter états divergents, partager config/caches.
- `#calculateTotals(items, country, method, taxCategory)` : normalise calcul prix/poids → shippingService → taxService ; garantit cohérence front/back et arrondis uniques.
- `#artificialDelay()` : délai aléatoire anti-énumération sur accès guest.
- `#timingSafeEmailCompare(stored, provided)` : buffers égalisés + `crypto.timingSafeEqual` pour éviter side-channel.
- `#resolveEffectivePrice(variantId, basePrice, client)` : applique promo active (variante/produit) dans la même transaction pour éviter divergence prix/réservation.
- `#invalidateVariantCache(variantId)` : purge cache variant + produit (id/slug) et catalogue ; fire-and-forget pour ne pas bloquer.
- `cancelOrderAndReleaseStock(orderId, reason)` : transaction SQL; liste items; `inventoryRepo.release` réservé→dispo; set status CANCELLED; commit; inval cache variants post‑commit ; idempotence assurée par statut.
- `cancelPendingOrder(orderId, user?, email?)` : refuse PAID; si déjà CANCELLED → message neutre; contrôle ownership (`_assertOrderAccess`); délègue à `cancelOrderAndReleaseStock`.
- `_assertOrderAccess(order, user, email)` : si user ≠ owner et pas ADMIN → 403 ; si guest → email requis et égal à l’adresse de livraison.
- `createOrderFromCart(userId?, checkoutData)` : transaction ; réserve stock via UPDATE conditionnel (prévention race); calcule prix effectifs (promo) + totaux ; crée order + items ; commit ; inval cache variants ; ROLLBACK si erreur (atomicité).
- `previewOrderTotal(userId?, checkoutData)` : si user sans items → charge panier ; erro si vide ; résout prix promo + poids ; renvoie totaux (pas de mutation DB).
- `getUserOrders(userId)` : liste commandes + items (N+1 contrôlé, volumes users).
- `getOrderDetails(orderId, user)` : NOT_FOUND si absent ; contrôle ownership ou ADMIN ; renvoie items.
- `getOrderHistory(userId, options)` : filtre status, pagination mémoire, items attachés.
- `getOrderDetailsGuest(orderId, email)` : vérifie email + commande guest ; timing-safe + delay sur échec ; NOT_FOUND neutre.
- `trackOrderGuest(orderNumber, email)` : format ORD-YYYY-n ; lookup guest par numéro+email (timing-safe en repo) ; delay sur échec.
- `claimGuestOrder(orderId, newUserId, verificationEmail)` : transfert ownership (repo) ; message neutre si échec.
- `autoClaimGuestOrders(newUserId, email)` : trouve commandes guest par email, boucle transfert, logs erreurs mais ne bloque pas login/register ; retourne count + orderNumbers.
- `updateOrderStatus(orderId, newStatus)` : refuse annuler SHIPPED ; update statut ; si SHIPPED → crée shipment ; si CANCELLED → release stock + inval cache ; envoie notifications statut.
- `listAllOrders(params)` : délègue repo (filtres/pagination).
- `#sendOrderStatusNotification(...)` : appelle notificationService, log erreurs sans casser flux.

---

### src/services/payment.service.js
- Singleton vérifie `STRIPE_SECRET_KEY` : fail-fast config.
- `createSession(orderId, user?)` : charge commande+items ; contrôle ownership ; refuse PAID/CANCELLED ; construit session Stripe (metadata orderId/orderNumber/isGuest, success/cancel URLs) ; pour guest force création customer email ; enregistre paiement PENDING ; renvoie checkoutUrl/sessionId/isGuest.
- `processStripeWebhook(rawBody, signature)` : vérifie signature HMAC (constructEvent) ; route événements : `checkout.session.completed` → `_handleCheckoutCompleted`, `checkout.session.expired` → `_handleCheckoutExpired`, `payment_intent.payment_failed` → `_handlePaymentFailed`.
- `_handleCheckoutCompleted(session)` : transaction ; update commande PAID + insère paiement ; confirme vente stock (reserved→sold) ; inval cache variant ; commit ; inval cache produit (post‑commit) ; déclenche notifications (guest ou user) asynchrones ; rollback en cas d’échec.
- `_handleCheckoutExpired(session)` : si commande non traitée → annule via OrderService (idempotent) pour libérer stock.
- `_handlePaymentFailed(paymentIntent)` : placeholder (extension échecs).
- `_invalidateProductCache(variantId)` : récup produit parent, delete caches id/slug/catalog.
- `_sendGuestOrderConfirmation(email, orderData)` : envoi confirmation guest, log.
- `getPaymentStatus(orderId, user?, guestEmail?)` : ownership user ou email ; logs tentatives ; retourne statut commande (fallback PENDING).
- `getPaymentHistory(orderId)` : historique paiements (audits).
- `_triggerPostPaymentNotifications(session, orderId)` : si guest → email session ; sinon email user ; envoi via notificationService ; log erreurs.

---

### src/services/products.service.js
- Singleton : cohérence cache/config.
- Helpers :  
  - `#getCacheKey(type,id)` / `#invalidateProductCache(id,slug)` : gestion fine cache détails + catalogue.  
  - `#safeParseAttributes` : JSON parse + whitelist clés + échappement pour éviter XSS/injection d’attributs.  
  - `#resolveDisplayPrice(variants, startingPrice)` : prix vitrine = promo la plus basse.
- `checkAvailability(slug, sku)` : prévient doublons (slug produit, SKU variant).
- `getProductDetails(idOrSlug)` : cache-aside ; détecte UUID vs slug ; agrège variantes/promos/inventaire ; calcule totalInventory ; TTL 1h.
- `listCatalog(filters)` : par défaut status ACTIVE ; filtre catégorie/taille/search ; agrège promotions/inventaire ; enrichit startingPrice/discountedPrice ; cache 15 min.
- `createProductWithVariant(productData, variantData, imageUrl)` : transaction ; crée produit ; lie catégories ; parse attributs ; ajoute variante (price, attrs, image) ; upsert stock initial ; commit ; purge caches catalogue.
- `updateProduct(id, updateData)` : recatégorisation complète si fourni ; update produit ; commit ; purge caches ; renvoie détails frais.
- `addVariantToProduct(productId, variantData)` : vérifie produit ; merge attrs (size/image) ; crée variante ; upsert stock initial ; purge caches.
- `deleteProduct(productId)` : supprime + purge caches ; NotFound si absent.
- `validateVariants(variantIds)` : contrôle existence/stock en masse (pour checkout/front).
- `updateVariant(variantId, updateData)` : merge attrs existants + nouveaux ; update ; purge caches produit.
- `deleteVariant(variantId)` : refuse si dernière variante (BusinessError) ; supprime + purge caches.
- `getProductFilters()` : tailles distinctes (pour filtres UI).

---

### src/services/inventory.service.js
- Const privées : `#ORDER_EXPIRATION_MINUTES=30`, `#LOW_STOCK_THRESHOLD=5`, prefixes cache.
- `#invalidateCache(variantId)` : delete cache variant + produit + catalogue.
- `#cancelOrderAndReleaseStock(orderId)` : transaction : liste items, release stock, set status CANCELLED, commit, purge caches variants.
- `getAllInventory(params)` : retourne items + pagination (page/limit/total).
- `getStockLevel(variantId)` : cache-aside ; fallback DB si Redis KO ; marque isLowStock.
- `adjustStock(variantId, quantity, reason)` : refuse total<0 ; upsert et purge cache.
- `getLowStockAlerts()` : trouve variants < seuil, enrichit avec SKU/nom produit.
- `reserveStock(variantId, quantity, client?)` : vérifie existence/stock, réserve via repo (UPDATE atomique), purge cache.
- `cleanupExpiredReservations()` : trouve commandes PENDING > 30 min, annule chacune (Promise.allSettled) ; logs erreurs ; retourne nombre traitées.
- `restockVariant(variantId, quantity)` : quantity>0 sinon ValidationError ; addStock repo ; purge cache.

---

### src/services/shipping.service.js
- Tarifs privés par zone/méthode + mapping pays→zone.
- `#getZone(country)` : map ou DEFAULT.
- `calculateShippingCost(country, totalWeight, method='STANDARD', cartSubtotal=0)` : calcule base+perKg ; applique franco si seuil atteint ; renvoie coût/isFree/zone/ETA.
- `getAvailableOptions(country, totalWeight, cartSubtotal)` : cache-aside des options ; génère labels ; TTL 1h.
- `calculateRates(cartId,{country})` : legacy estimation standard.
- `getUserAddresses(userId)` : cache carnet 30 min ; fallback DB ; set cache.
- `createAddress(userId, addressData)` : insère, purge cache utilisateur.
- `deleteAddress(userId, addressId)` : delete, NotFound si rien supprimé.
- `createShipment(orderId, carrier='COLISSIMO')` : exige commande existante PAID ; génère tracking ; crée shipment ; set status commande SHIPPING_IN_PROGRESS.
- `updateTracking(shipmentId, status, currentLocation='')` : update shipment ; si DELIVERED → set commande COMPLETED, purge cache order.
- `getShipmentByOrder(orderId)` / `getShipmentForUser(orderId, userId)` : contrôle ownership pour user ; retourne shipment.

---

### src/services/cart.service.js
- Helpers cache : `#getCacheKey(cartId)`, `#invalidateCartCache`.
- `getFullCart(cartId)` : récup items, calc subtotal/itemCount, currency EUR, cache 24h.
- `getCartByUserId(userId)` : getOrCreate panier, renvoie vue complète.
- `addToCart(userId, variantId, quantity)` : vérifie variant existant, stock disponible ; addItem (ON CONFLICT) ; purge cache.
- `updateItemQuantity(userId, itemId, newQuantity)` : vérifie item appartient au panier user ; check stock dispo ; update qty ; purge cache.
- `removeItemFromCart(userId, itemId)` : vérifie présence ; delete ; purge cache.
- `clearCart(cartId)` : vide tous les items ; purge cache.
- `mergeCarts(guestCartId, userId)` : charge guest items, réutilise addToCart (re‑valide stock), delete guest cart, purge caches ; renvoie panier user.

---

### src/services/categories.service.js
- `#getCacheKey(key)` : namespace catégories.
- `getAllCategories()` : cache 24h ; fallback DB.
- `createCategory({name, slug})` : validate nom/slug ; conflit slug -> ConflictError ; purge cache all.
- `assignCategoriesToProduct(productId, categoryIds)` : idempotent, via repo linkProductToCategory ; purge cache produit.
- `updateCategory(id, data)` : update ; purge cache all ; NotFound si aucun update.
- `deleteCategory(id)` : refuse si catégories liées à produits (ConflictError) ; delete sinon ; purge cache.

---

### src/services/promotions.service.js
- Privés : `#buildProductCacheKeys(productId)` (récup produit pour clés), `#invalidateProductsCache(productIds)`, `#validateDates`, `#validatePercentage`.
- `createPromotion(promotionData, linkedItems={productIds,variantIds})` : validate dates/percentage ; transaction : create promo + liaisons produits/variants ; commit ; purge caches produits liés.
- `listPromotions(filters)` : statut/active + pagination.
- `getPromotionDetails(id)` : charge promo + linked products/variants ; NotFound si absent.
- `updatePromotion(id, updateData, linkedItems?)` : validate dates si modifiées ; transaction : update promo, remplace liaisons si fournies ; calcule produits affectés ; commit ; purge caches concernés.
- `deletePromotion(id)` : NotFound si absent ; récup linkedProducts ; delete ; purge caches.
- `calculateDiscountedPrice(originalPrice, promotion)` : applique pourcentage ou fixe, plancher 0.
- `togglePromotionStatus(id)` : bascule ACTIVE/INACTIVE ; purge caches produits liés.

---

### src/services/admin.service.js
- `getDashboardStats()` : Promise.all (count users, global stats orders, low stock count, product count) → agrégats dashboard.
- `getSalesHistory(days=30)` : valide 1–365 ; délègue repo.
- `getSalesReport(startDate, endDate)` : requiert deux dates ; délègue repo (non montré).
- `updateUserRole(userId, roleName)` : vérifie user existant, update rôle via repo.

---

### src/services/profile.service.js
- Singleton.
- `getFullProfile(userId)` : user sans secrets + commandes ; stats total/pending/completed/totalSpent.
- `updateProfileWithValidation(userId, updates)` : au moins un champ ; sanitize/validate phone ; patch profil ; NotFound si échec.
- `getOrderHistory(userId, options)` : pagination mémoire avec items ; valide page/limit.
- `trackOrderGuest(orderNumber, email)` : validation formats ; delay anti-énumération ; NOT_FOUND neutre.
- `claimGuestOrder(orderId, newUserId, verificationEmail)` : transfert ownership ; BusinessError générique si échec.
- `autoClaimGuestOrders(newUserId, email)` : tente transfert en masse, logs erreurs, retourne comptage.
- `#artificialDelay()` : 200‑500 ms.

---

### src/services/auth.service.js
- Singleton.
- `#createAuthSession(user)` : génère access/refresh (TokenService), persiste session (SessionService), retourne tokens + user (id, email, firstName, roles).
- `register({email,password,firstName,lastName})` : check email unique ; rôle USER ; PBKDF2 hash+salt ; transaction user + rôle ; auto-claim commandes guest ; notif welcome ; session ; retourne tokens + claimedOrders.
- `login({email,password})` : lookup email ; refuse inactif ; PBKDF2 compare timing-safe ; charge rôles ; auto-claim guest ; session ; retourne tokens + claimedOrders.
- `logout(refreshToken)` : révoque session si présent.
- `refreshAccessToken(refreshToken)` : verify JWT refresh ; validate session whitelist ; charge user+roles ; retourne nouvel access + user info ; supprime session si token invalide.

---

### src/services/users.service.js
- `getUserProfile(userId)` : cache 15 min ; charge user, rôles, stats commandes ; retourne profil enrichi.
- `listAllUsers(params)` : liste paginée sans secrets ; enrichit rôles ; retourne pagination.
- `deleteUser(targetUserId, currentAdminId)` : interdit auto-suppression ; refuse supprimer un admin ; delete, purge caches.
- `updatePrivileges(targetUserId, {role,isActive}, currentAdminId)` : interdit auto-modif ; refuse toucher un admin ; toggle isActive ; ajoute/enlève rôle (ADMIN/USER) ; purge caches ; retourne profil frais.
- `getProfile(userId)` : retourne user sans hash/salt.
- `changePassword(userId, {oldPassword,newPassword})` : vérifie ancien via PBKDF2 ; contrôle historique (courant + 2 derniers) pour non-réutilisation ; stocke ancien dans history ; génère nouveau salt/hash ; update credentials ; purge caches.
- `#clearUserCache(userId)` : delete caches profil.

---

### src/services/passwordreset.service.js
- Singleton.
- `#generateToken()` : 32 bytes random hex, hash SHA-256 (stocke seulement le hash).
- `requestReset(email)` : normalise email ; si user existe → crée token unique (supprime ancien) ; envoie notif ; réponse neutre sinon (anti-énumération).
- `resetPassword(rawToken, newPassword)` : hash token, trouve token valide (non expiré) ; vérifie user ; contrôle non-réutilisation (history + courant) ; génère nouveau hash/salt ; ajoute ancien en history ; delete token (usage unique) ; invalide toutes sessions user.
- `#assertPasswordNotReused(user,newPassword)` : compare PBKDF2 aux 2 derniers + courant.
- `#invalidateAllSessions(userId)` : delete sessions via SessionService ; erreurs ignorées (ne bloque pas).
- `#sendResetNotification(email, rawToken)` : envoi email reset, log erreurs.

---

### src/services/password.service.js
- `generateSalt(length=16)` : entropie par user.
- `hashPassword(password, salt)` : PBKDF2-SHA512 itérations ENV (≥100k), keylen 64 ; lève si args manquants.
- `comparePassword(password, storedHash, storedSalt)` : re-hash puis `timingSafeEqual`; catch → false ; évite timing leaks.

---

### src/services/token.service.js
- Secrets/access/refresh/expirations chargés depuis ENV, immuables.
- `generateAccessToken(user)` : payload sub/email/roles, issuer/audience, expiresIn court (env).
- `generateRefreshToken(user)` : payload sub only, expiresIn long.
- `verifyAccessToken(token)` / `verifyRefreshToken(token)` : try/catch → null si invalide.
- `decodeToken(token)` : decode sans vérif (debug/rotation).

---

### src/services/session.service.js
- Cookie options : httpOnly, secure, sameSite None (ou Lax en dev), maxAge 7d.
- `createSession(userId, refreshToken)` : calc expiresAt, insert refreshToken DB, set cache Redis TTL aligné cookie.
- `validateSession(refreshToken)` : cherche en cache puis DB ; recache si trouvé (self-healing) ; retourne session ou null.
- `deleteSession(refreshToken)` : revoke DB si trouvé + delete cache.

---

### src/services/roles.service.js
- Rôles système protégés : ADMIN, USER, MODERATOR.
- `getAllRoles()` : liste.
- `assignRoleToUser(userId, roleName)` : vérifie rôle/user existants ; idempotent (si déjà présent → message).
- `removeRoleFromUser(userId, roleName)` : refuse retirer dernier admin (countUsersByRole) ; sinon delete user_role.
- `createCustomRole(name, description)` : upper, refuse doublon.
- `deleteRole(roleId)` : refuse si rôle système ; delete sinon.

---

### src/services/cache.service.js
- Crée client Redis (url host:port, password) ; log connect/error ; `connect()` si fermé.
- `set(key, value, ttl)` : JSON.stringify + EX=ttl.
- `get(key)` : JSON.parse si valeur ; null sinon.
- `delete(key)` / `deleteMany(keys)` : purge ciblée.

---

### src/services/health.service.js
- `check()` : initialise status (UP/DOWN) ; `pgPool.query('SELECT 1')` → database status ; `cacheService.client.ping()` → cache status ; isHealthy = both UP ; retourne timestamp/uptime + services.

---

### src/services/notifications/email.service.js
- Singleton Resend (ENV.resend apiKey/from).  
- `_stripHtml(html)` : retire balises/style pour texte brut fallback.  
- `_sendEmail({to,subject,html,text})` : envoi Resend, logInfo succès, logError sinon.  
- Templates métiers : `sendOrderConfirmation`, `sendOrderShipped`, `sendOrderDelivered`, `sendOrderCancelled`, `sendOrderStatusUpdate`, `sendWelcomeEmail`, `sendPasswordReset` → chaque méthode génère `{subject,html}` via emailTemplates puis `_sendEmail`.

---

### src/services/notifications/notification.service.js
- Singleton.
- `_getCustomerEmail(userId, orderData)` : priorité shippingAddress.email, fallback user.email ; protège notifications guest.
- `notifyOrderPaid/Shipped/Delivered/Cancelled/GenericUpdate` : délègue à emailService, log errors, log info.
- `notifyOrderStatusChange(prev,newStatus,userId,orderData,additionalData)` : no-op si statut identique ; récup email ; switch statut → appelle la notif appropriée ; log si email absent.
- `notifyUserRegistered(userData)` : envoi welcome si email présent ; log sinon.
- `notifyPasswordReset(email, resetToken)` : construit resetUrl (ENV.clientUrl) puis emailService.

---

### src/services/templates/email/index.js
- `getBaseTemplate(content, title)` : squelette HTML table-compatible Outlook, styles, boutons, badges statut.
- `formatPrice(amount)` : Intl currency EUR.
- `formatDate(date)` : Intl fr-FR date/heure.
- `emailTemplates` :  
  - `orderConfirmation(orderData)` : badge PAYÉE, recap montant/date/adresse, lien suivi.  
  - `orderShipped(orderData)` : tracking/carrier/ETA, badge EXPÉDIÉE.  
  - `orderDelivered(orderData)` : badge LIVRÉE, appel à feedback/retour.  
  - `orderCancelled(orderData)` : badge ANNULÉE, info remboursement si payé.  
  - `orderStatusUpdate(orderData)` : fallback statuts (PENDING/PAID/PROCESSING/SHIPPED/DELIVERED/CANCELLED/REFUNDED).  
  - `welcome(userData)` : onboarding boutique.  
  - `passwordReset({resetUrl})` : lien reset valable 1h.


---

### src/repositories/orders.repo.js
Rôle : source de vérité des commandes (authentifiées et guest), cohérence items/état/paiement.

Principes structurants :
- Séparation périmètre guest (`user_id IS NULL`) vs authentifié (`user_id IS NOT NULL`) dès la requête SQL.
- Agrégation JSON des items pour limiter les allers-retours applicatifs.
- Verrous transactionnels (`FOR UPDATE`) sur les opérations de transfert (claim) pour éviter les races.

Fonctions clés :
- `createOrder(client, order)` : insère l’entête en statut `PENDING`; centralise la base taxable et les montants; utilise le client transactionnel pour l’atomicité avec items/stock.
- `addItem(client, item)` : ajoute une ligne dans `order_items` avec sérialisation JSON des attributs variante ; fait partie de la transaction de création.
- `createWithItems({ order, items })` : enveloppe transactionnelle (BEGIN/COMMIT/ROLLBACK) pour créer entête + items en bloc.
- `findById(id)` : lecture brute d’une commande (tous états, tous périmètres).
- `findGuestOnlyById(id)` : lecture sécurisée guest (user_id NULL) avec agrégation items et image courante de la variante ; limite l’exposition aux seules commandes publiques.
- `findByOrderNumberAndEmail(orderNumber, email)` : lookup guest par numéro + email, avec comparaison timing-safe (buffers égalisés) pour éviter l’énumération de commandes.
- `findGuestOrdersByEmail(email)` : récupère les commandes guest rattachables (auto-claim).
- `transferOwnership(orderId, newUserId, verificationEmail)` : transaction avec `FOR UPDATE` ; vérifie email de livraison, refuse si déjà rattachée, assigne `user_id`.
- `listByUserId(userId)` : commandes d’un utilisateur (ordre chronologique descendant).
- `listItems(orderId, client=pgPool)` : items d’une commande, enrichis de l’image actuelle de la variante (join product_variants).
- `updateStatus(orderId, status, paymentData?, client)` : met à jour le statut et, si paiement fourni, insère l’entrée correspondante dans `payments`.
- `getUserStats(userId)` : agrégats de base (total commandes, pending, total dépensé) pour profils/dashboards.
- `findAll({status,userId,search,page,limit})` : vue administration paginée avec filtres multi‑critères (statut, user, recherche multi‑champs) ; jointure users pour email ; pagination SQL COUNT + LIMIT/OFFSET.
- `findExpiredPendingOrders(expirationMinutes)` : détecte les commandes PENDING périmées pour nettoyage/annulation automatique.
- `getGlobalStats(client)` : agrégats globaux hors commandes annulées (count, totalAmount) pour dashboard.
- `getDailySalesHistory(days)` : histogramme journalier des ventes (statuts non annulés ni pending) sur fenêtre glissante.

---

### src/repositories/inventory.repo.js
Rôle : assurer l’intégrité du stock disponible/réservé par opérations atomiques SQL.

Principes :
- Validations strictes (UUID, quantités) en amont.
- Mise à jour conditionnelle (`available_stock >= qty`, `reserved_stock >= qty`) pour éliminer les race conditions applicatives.
- GREATEST pour prévenir les valeurs négatives.

Fonctions :
- `upsert({variantId, availableStock, reservedStock}, client)` : crée ou met à jour l’entrée inventaire avec horodatage.
- `reserve(variantId, quantity, client)` : décrémente disponible, incrémente réservé, échoue si stock insuffisant ; retourne aussi le prix de la variante pour calculs de commande.
- `release(variantId, quantity, client)` : remet du réservé vers disponible, garde reserved_stock ≥ 0 ; NotFound si entrée manquante.
- `confirmSale(variantId, quantity, client)` : décrémente exclusivement le réservé (vente finalisée), protège contre reserved insuffisant.
- `findAll({page,limit,search})` : liste paginée inventaire + SKU + prix + produit ; recherche sur SKU/nom produit.
- `addStock(variantId, quantity, client)` / `removeStock(variantId, quantity, client)` : ajustements directs avec clamp à 0.
- `findByVariantId(variantId)` : lecture simple.
- `checkAvailability(variantId, quantity)` : booléen sans exception pour pré‑validation UI.
- `findLowStock(threshold)` / `findOutOfStock()` : alertes seuils.
- `getStats()` : agrégats globaux (total variants, stocks disponibles/réservés, ruptures).

---

### src/repositories/products.repo.js
Rôle : catalogue produits/variantes, intégration promotions et inventaire.

Principes :
- Filtrage dynamique (status, catégorie, taille, recherche).
- Agrégation JSONB des variantes avec inventaire et promotions pour éviter N+1.
- Calcul des prix promotionnels en SQL pour cohérence avec la transaction.

Fonctions :
- `create({name,slug,description,status}, client)` : insert produit (status par défaut DRAFT), validation slug/enum.
- `findById(id, client)` / `findBySlug(slug, client)` : lectures simples.
- `list({status,categorySlug,size,search,page,limit}, client)` :  
  - WHERE construit dynamiquement.  
  - JOIN conditionnel catégories.  
  - COUNT DISTINCT produits.  
  - Sélection : starting_price (min variant), variant_count, categories agrégées, variants_preview (price, attrs, inventaire, promo active variant/produit avec discountedPrice).  
  - Pagination LIMIT/OFFSET.
- `update(id, {name,slug,description,status}, client)` : SET partiel + updated_at, validations ; NotFound si absent.
- `getUniqueSizes(client)` : tailles distinctes depuis les attributs variants.
- Variantes :  
  - `addVariant({productId, sku, price, attributes}, client)` ;  
  - `findVariantBySku(sku, client)` ;  
  - `listVariantsByProduct(productId, client)` ;  
  - `findVariantById(id)` ;  
  - `updateVariant(id, {sku,price,attributes})` ;  
  - `deleteVariantById(id, client)` ;  
  - `findExistingVariantIds(ids, client)` ;  
  - `validateVariants(ids, client)` : {id, stock}.  
- Produits :  
  - `deleteById(id, client)` : NotFound si aucun.  
  - `getFullDetails(identifier, column='slug', client)` : agrège catégories + variantes complètes (inventaire + promo active var/prod) en une requête.  
  - Stats : `count(client)`, `countLowStock(threshold, client)`.  
  - `findActivePromotionPrice(variantId, client)` : retourne basePrice, effectivePrice, flag hasPromotion.

---

### src/repositories/carts.repo.js
Rôle : persistance panier et items, guest ou user.

Principes :
- Validations UUID/quantity systématiques.
- Idempotence via `ON CONFLICT` pour add/set item.
- Contrôle d’appartenance des items par cartId.

Fonctions :
- Paniers : `create({userId?})`, `findById`, `findByIdOrFail`, `findByUserId`, `getOrCreate(userId)`, `delete(cartId)`.
- Items :  
  - `addItem({cartId, variantId, quantity})` : ON CONFLICT incrémente quantité + updated_at.  
  - `setItemQuantity({cartId, variantId, quantity})` : ON CONFLICT remplace quantité.  
  - `updateItemQuantity(id, quantity)` : update direct, NotFound si absent.  
  - `removeItem(id)` / `removeItemByVariant(cartId, variantId)` / `clearCart(cartId)`.  
  - `listItems(cartId)` : jointure variant + product + inventory pour exposer prix/stock/attrs.  
  - `calculateTotal(cartId)` : somme prix*qty.  
  - `countItems(cartId)` / `hasItems(cartId)`.

---

### src/repositories/users.repo.js
Rôle : comptes utilisateurs et secrets (hash/salt).

Principes :
- Normalisation email en DB (LOWER) pour unicité logique.
- Projection sans secrets pour les listings publics/admin.
- Séparation des requêtes avec/ sans credentials.

Fonctions :
- `create({email,passwordHash,salt,firstName,lastName,phone}, client)` : insert email lower.
- `findById(id)` / `findByEmail(email)` : lectures.
- `list(params)` : pagination + recherche sur prénom/nom/email ; COUNT encapsulé ; projection sans hash/salt.
- `findByEmailWithCredentials(email)` : champs nécessaires à l’auth (id,email,first_name,password_hash,salt,is_active).
- Mutations : `updateProfile(id,{firstName,lastName,phone})`, `setActive(id,isActive)`, `deleteById(id)`, `updateCredentials(userId,{passwordHash,salt})`.
- Stats/sécurité : `count()`, `getPasswordHistory(userId,limit)`, `addToHistory(userId,passwordHash,salt)`.

---

### src/repositories/roles.repo.js
Rôle : gouvernance RBAC (rôles et liaisons user_roles).

Fonctions :
- Catalogue : `list()`, `findAll()`, `findByName(name)`, `findById(id)`, `create({name,description})`, `delete(id)`.
- Sécurité : `countUsersByRole(roleId)` pour empêcher retrait du dernier admin.
- Seed : `seedDefaults()` : insère roles user/admin/visitor idempotent (ON CONFLICT).
- Liaisons :  
  - `addUserRole(userId, roleId, client)` (ON CONFLICT DO NOTHING) ;  
  - `assignRoleByName(userId, roleName, client)` ;  
  - `removeUserRole(userId, roleId)` ;  
  - `listUserRoles(userId)` : jointure user_roles→roles.

---

### src/repositories/promotions.repo.js
Rôle : promotions et associations produit/variante.

Fonctions :
- CRUD : `create(promotionData, client)`, `list({status,active,page,limit}, client)` (filtre actifs : status ACTIVE + dates), `findById(id, client)`, `update(id, updateData, client)`, `delete(id, client)`.
- Associations :  
  - `addToProduct(promotionId, productId, client)` / `addToVariant(promotionId, variantId, client)` (ON CONFLICT DO NOTHING).  
  - `removeFromProduct`, `removeFromVariant`.  
  - `getActiveByProduct(productId, client)` / `getActiveByVariant(variantId, client)` : meilleure promo active (status/date) limitée à 1.  
  - `incrementUsage(id, client)` : usage_count++.  
  - `getLinkedProducts(promotionId, client)`, `getLinkedVariants(promotionId, client)`.

---

### src/repositories/categories.repo.js
Rôle : taxonomie produits et liaison product_categories.

Fonctions :
- CRUD : `create({name,slug})` (renvoie null si 23505 pour laisser le service lever ConflictError), `findById`, `findBySlug`, `list`, `update(id,data)`, `delete(id)`.
- Associations : `addProductCategory(productId, categoryId, client)` / alias `linkProductToCategory` (ON CONFLICT DO NOTHING), `removeProductCategory(productId, categoryId)`, `removeAllFromProduct(productId, client)`.
- Consultation : `listByProductId(productId)` : catégories d’un produit.

---

### src/repositories/shipments.repo.js
Rôle : suivi logistique lié aux commandes.

Fonctions :
- `create({orderId,carrier,trackingNumber}, client)` : upsert sur order_id (ON CONFLICT) pour éviter doublons ; met à jour tracking/carrier + updated_at.
- `update(id, data)` : PATCH dynamique (status, currentLocation, carrier, trackingNumber, shippedAt, deliveredAt) ; NotFound si absent.
- `updateTracking(id,{carrier,trackingNumber})` : raccourci.
- `markShipped(id, shippedAt?, client)` / `markDelivered(id, deliveredAt?, client)` : timestamp default NOW.
- `findByOrderId(orderId)` / `findById(id)` : lectures.

---

### src/repositories/adresses.repo.js
Rôle : carnet d’adresses utilisateur.

Fonctions :
- `create(userId, data)` : si `isDefault` true, met les autres adresses user à false avant insert pour unicité fonctionnelle ; insère adresse complète.
- `findByUserId(userId)` : liste ordonnée par création.
- `delete(userId, addressId)` : suppression conditionnée à l’ownership.

---

### src/repositories/payments.repo.js
Rôle : journal des paiements.

Fonctions :
- `create({orderId,provider,paymentIntentId,status='PENDING',amount,currency='EUR',metadata={},client})` : enregistre tentative/transaction.
- `setStatus(id, status, client)` : met à jour statut paiement.
- `listByOrderId(orderId)` : historique par commande (ordre décroissant).

---

### src/repositories/passwordreset.repo.js
Rôle : tokens de réinitialisation (hashés).

Fonctions :
- `createToken(userId, tokenHash)` : transaction ; supprime les tokens existants du user puis insère le nouveau.
- `findValidToken(tokenHash)` : retourne token non expiré (`expires_at > NOW()`).
- `deleteToken(tokenHash)` : usage unique après consommation.

---

### src/repositories/refreshTokens.repo.js
Rôle : whitelist/ révocation des refresh tokens.

Fonctions :
- `create({userId,token,expiresAt})` : insertion d’un refresh valide.
- `findByToken(token)` : lookup pour validation refresh.
- `revokeById(id)` : suppression ciblée.
- `revokeByUserId(userId)` : purge de toutes les sessions d’un user (post-compromission).
- `deleteExpired()` : nettoyage maintenance.

---

### src/repositories/_mappers.js
Rôle : mapping snake_case (SQL) → camelCase (JS).
- `toCamel(key)` : regex `_x` → `X`.
- `mapRow(row)` : retourne null si row falsy ; transforme toutes les clés.
- `mapRows(rows)` : mapRow sur tableau.

### src/repositories/index.js
Rôle : point d’import unique des repositories pour réduire le couplage et faciliter les refactors de chemins/fichiers.


---

### src/controllers/auth.controller.js
- Imports : `authService`, `passwordResetService`, `asyncHandler`, `HTTP_STATUS`.
- Const `REFRESH_TOKEN_COOKIE_OPTIONS` : httpOnly, secure, sameSite none, maxAge 7j — protège le refresh en cookie.
- Méthodes (asyncHandler) :
  - `register` : délègue à authService.register ; place refreshToken en cookie ; retourne user, accessToken, stats de claim ; pourquoi — séparer transport (cookie) du métier (service).
  - `login` : idem register mais pour authentification.
  - `logout` : lit refreshToken cookie, appelle authService.logout, clear cookie ; pourquoi — révocation ciblée.
  - `refresh` : lit refreshToken cookie, appelle authService.refreshAccessToken ; retourne user + accessToken.
  - `requestPasswordReset` : appelle passwordResetService.requestReset ; réponse volontairement identique (anti‑énumération).
  - `resetPassword` : consomme token, clear cookie refresh, message succès ; garantit invalidation session.

### src/controllers/users.controller.js
- Imports : userService, orderService, asyncHandler, HTTP_STATUS.
- `getProfile` : cible `req.params.id` ou `req.user.id` pour /me ; pourquoi — réutiliser même handler user/admin.
- `updateProfile` : délègue userService.updateProfile ; message succès.
- `updatePassword` : contrôle old/new via service ; message succès.
- `getMyOrders` : récup historique paginé via orderService.getOrderHistory ; pour UX profil.
- Admin :
  - `getAllUsers` : listes/pagination ; projection safe.
  - `deleteUser` : call userService.deleteUser avec current admin id (anti auto‑suppression).
  - `updatePrivileges` : change rôle/statut, protège contre modifications illégitimes.

### src/controllers/admin.controller.js
- Imports : adminService, asyncHandler, HTTP_STATUS.
- `getStats` : agrégats dashboard.
- `getSalesHistory` : paramètre days validé dans service.
- `changeUserRole` : update rôle via adminService.

### src/controllers/product.controller.js
- Imports : productService, asyncHandler, HTTP_STATUS.
- `getAll` : liste catalogue paginé + pagination.
- `getOne` : détail produit (id ou slug).
- `create` : image Cloudinary depuis req.file, variant dans body ; appelle createProductWithVariant.
- `update` : peut inclure image ; update produit ; message succès.
- `delete` : supprime produit ; 204.
- `addVariant` : image facultative, attrs JSON ; ajoute variante avec stock initial.
- `getFilters` : retourne filtres produits (tailles).
- `deleteVariant` : supprime variante ; 204.

### src/controllers/categories.controller.js
- Imports : categoryService, asyncHandler, HTTP_STATUS, ValidationError.
- `getAllCategories` : liste publique.
- `createCategory` : valide présence nom/slug, crée et retourne 201.
- `updateCategory` : patch et retourne catégorie.
- `deleteCategory` : suppression ; 204.

### src/controllers/cart.controller.js
- Imports : cartService, asyncHandler, HTTP_STATUS.
- `getCart` : panier complet user.
- `addItem` : add puis re‑fetch panier ; message UX.
- `updateQuantity` : ajuste quantité, renvoie item.
- `removeItem` : delete item ; 204.
- `clear` : vide panier ; message UX.

### src/controllers/order.controller.js
- Imports : orderService, asyncHandler, HTTP_STATUS, ValidationError.
- `previewTotal` : simule totals (guest ou auth).
- `checkout` : valide items + shippingAddress ; crée commande, renvoie isGuest flag.
- `cancelOrder` : autorise guest (email) ou auth ; utilise optionalAuth au niveau route.
- `trackGuestOrder` : suivi par numéro+email ; active bannière conversion.
- `claimOrder` : rattache commande guest à user connecté.
- `getOrderDetail` : mode auth ou guest (email requis) ; isGuest flag pour front.
- `getMyOrders` : historique paginé user.
- Admin : `getAllOrders` liste filtrée ; `updateStatus` change statut.

### src/controllers/payment.controller.js
- Imports : paymentService, asyncHandler, HTTP_STATUS, AppError, ENV.
- Utilitaire `isValidStripeSessionId` : regex cs_(test|live) ; prévient injection dans HTML.
- `createCheckoutSession` : optionalAuth ; crée session pour commande ; renvoie URL+sessionId.
- `checkStatus` : polling statut (guest/email ou auth).
- Webhooks : `handleStripeWebhook`/`handlePayPalWebhook` : délègue au service ; Stripe nécessite `req.rawBody`.
- Redirections : `handleSuccess` / `handleCancel` : pages HTML minimalistes (loader ou message) + redirection vers frontend ; session_id validée pour éviter XSS.

### src/controllers/shipping.controller.js
- Imports : shippingService, asyncHandler, HTTP_STATUS, AppError, validateRequired.
- `getAddresses` : carnet user.
- `addAddress` : validate required fields, crée ; message succès.
- `deleteAddress` : 204 si OK.
- `calculateOptions` : pays, poids, subtotal ; renvoie options STANDARD/EXPRESS/RELAY ; BusinessError si poids négatif ou champs manquants.
- `getRates` : estimation legacy.
- `getTracking` : tracking par orderId ; NotFound si aucune expédition.
- Admin : `createShipment` (commande doit être payée), `updateTracking` (statut + localisation ; si DELIVERED → commande COMPLETE).

### src/controllers/inventory.controller.js
- Imports : inventoryService, asyncHandler, HTTP_STATUS.
- `getStock` : stock d’une variante (public).
- Admin : `adjustStock`, `getLowStockAlerts`, `addStock`, `getAllInventory` ; messages succès + données.

### src/controllers/promotions.controller.js
- Imports : promotionService, asyncHandler, HTTP_STATUS.
- `create` : payload {promotion, linkedItems}; renvoie promotion créée.
- `getAll` : filtrage/pagination via query (status, active, page, limit).
- `getOne` : detail promotion id.
- `update` : patch + linked items optionnels.
- `delete` : 204.
- `toggle` : bascule statut, renvoie promotion mise à jour.

### src/controllers/tax.controller.js
- Imports : taxService, asyncHandler, HTTP_STATUS, AppError.
- `calculate` : query amount/country/category, valide amount numérique ; retourne taxAmount/taxRate.
- `getCountryRates` : taux du pays.
- `getAllCountries` : liste référentiel.
- `checkExemption` : vérifie éligibilité (B2B intra‑UE) ; masque partiel du vatNumber pour logs.

### src/controllers/sitemap.controller.js
- Imports : productService, logger, ENV.
- Constantes FRONTEND_URL, limites, helpers escapeXml/formatDate.
- `generateProductsSitemap` (exporté comme `getSitemap`) : liste produits actifs (limit 10k), construit XML sitemap, envoie avec cache-control (1h browser, 24h CDN). Sur erreur : retourne XML minimal d’erreur pour ne pas perturber Google.

---

**Routes — Organisation et protections**

### src/routes/index.routes.js
- Point d’entrée `/api/v1`, applique `generalLimiter`.  
- Monte routeurs : auth, users, products, categories, promotions, cart, orders, shipping, payments, inventory, taxes, admin, sitemap.

### src/routes/auth.routes.js
- POST `/register` : authLimiter + validations email/password/required ; vers authController.register.
- POST `/login` : authLimiter + validations email/password.
- POST `/refresh`, `/logout` : session cycle.
- POST `/forgot-password` : passwordResetLimiter + validate email.
- POST `/reset-password` : passwordResetLimiter + validate token/newPassword.

### src/routes/users.routes.js
- `router.use(protect)` : toutes routes protégées.  
- `/me` GET/PATCH (profileGeneralLimiter) ; PATCH update-password (passwordChangeLimiter + validations).  
- `/me/orders` : historique user.  
- Admin (`restrictTo('ADMIN')`) : GET `/` (liste), GET `/:id`, PATCH `/:id` (privilèges), DELETE `/:id`.

### src/routes/admin.routes.js
- `router.use(protect, restrictTo('ADMIN'))`.  
- GET `/stats`, `/sales-history`.  
- Crons : GET `/crons/status`, POST `/crons/:name/execute|stop|restart` (exécution manuelle/contrôle).

### src/routes/products.routes.js
- Routes publiques : GET `/filters`, POST `/validate-variants` (validateVariants service), GET `/`, GET `/:idOrSlug`.
- Admin (protect + restrictTo('ADMIN')) :  
  - POST `/` (uploadCloud+handleUpload, validations variant) create produit+variante.  
  - PATCH `/ :id` update produit.  
  - DELETE `/ :id` delete produit.  
  - POST `/:productId/variants` (uploadCloud) add variante.  
  - PATCH `/variants/:id` update variante.  
  - DELETE `/variants/:id` delete variante.  
- Ordonnancement : routes statiques avant paramétriques pour éviter capture `filters`.

### src/routes/categories.routes.js
- Public : GET `/`.  
- Admin : POST `/`, PATCH `/:id`, DELETE `/:id` (protect + restrictTo ADMIN).

### src/routes/cart.routes.js
- `router.use(protect)` : tout panier authentifié.  
- GET `/` (getCart).  
- POST `/items` (validate quantity+UUID) add item.  
- PATCH `/items/:itemId` update qty.  
- DELETE `/items/:itemId` remove ; DELETE `/` clear.

### src/routes/order.routes.js
- Statiques avant paramétriques pour éviter collisions : POST `/preview` (optionalAuth), `/checkout` (optionalAuth), `/track-guest` (trackingGuestLimiter + validations), GET `/my-orders` (protect).  
- Admin : GET `/` (protect+ADMIN).  
- Paramétriques en dernier : GET `/:orderId` (trackingGuestLimiter + optionalAuth + validateUUID) ; POST `/:orderId/cancel` (optionalAuth) ; POST `/:orderId/claim` (protect + validations email/UUID) ; PATCH `/:orderId/status` (protect+ADMIN).

### src/routes/payment.routes.js
- optionalAuth sur create-session/status.  
- POST `/create-session/:orderId` (paymentController.createCheckoutSession).  
- GET `/status/:orderId` (checkStatus).  
- Webhooks publics : POST `/webhook/stripe`, `/webhook/paypal`.  
- Redirections HTML : GET `/success`, `/cancel`.

### src/routes/shipping.routes.js
- `router.use(protect)` : tout requiert auth.  
- Adresses : GET `/addresses`, POST `/addresses`, DELETE `/addresses/:addressId`.  
- Calcul : POST `/calculate`, POST `/rates`.  
- Tracking : GET `/track/:orderId`.  
- Admin : POST `/shipments/:orderId`, PATCH `/shipments/:shipmentId` (restrictTo ADMIN).

### src/routes/inventory.routes.js
- Admin : GET `/` (inventory list), GET `/alerts`, PATCH `/:variantId/adjust`, PATCH `/restock/:variantId` (protect+ADMIN).  
- Public : GET `/:variantId` (stock level).  
- Note ordre : `/alerts` avant `/:variantId` pour éviter capture.

### src/routes/promotions.routes.js
- Public : GET `/`.  
- Admin (protect+ADMIN) : GET `/:id`, POST `/`, PATCH `/:id`, PATCH `/:id/toggle`, DELETE `/:id` (validations UUID où nécessaire).

### src/routes/tax.routes.js
- Public : GET `/calculate`, `/rates/:country`, `/countries`, POST `/check-exemption`.  
- Aucun protect : données fiscales publiques.

### src/routes/sitemap.routes.js
- Public : GET `/sitemap.xml` → génération dynamique (sitemapController).
