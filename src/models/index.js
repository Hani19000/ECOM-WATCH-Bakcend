// Typedefs JSDoc pour l’autocompletion (SQL pur)

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} email
 * @property {string} passwordHash
 * @property {string|null} firstName
 * @property {string|null} lastName
 * @property {string|null} phone
 * @property {boolean} isActive
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} Role
 * @property {number} id
 * @property {'USER'|'ADMIN'} name
 */

/**
 * @typedef {Object} RefreshToken
 * @property {number} id
 * @property {string} userId
 * @property {string} token
 * @property {string} expiresAt
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} name
 * @property {string} slug
 * @property {string|null} description
 * @property {'DRAFT'|'ACTIVE'|'ARCHIVED'} status
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} ProductVariant
 * @property {string} id
 * @property {string} productId
 * @property {string} sku
 * @property {string} price
 * @property {Object|null} attributes
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Inventory
 * @property {string} variantId
 * @property {number} availableStock
 * @property {number} reservedStock
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {string} slug
 */

/**
 * @typedef {Object} Cart
 * @property {string} id
 * @property {string|null} userId
 * @property {string} createdAt
 */

/**
 * @typedef {Object} CartItem
 * @property {number} id
 * @property {string} cartId
 * @property {string} variantId
 * @property {number} quantity
 */

/**
 * @typedef {Object} Order
 * @property {string} id
 * @property {number} orderNumber
 * @property {string|null} userId
 * @property {'PENDING'|'PAID'|'SHIPPED'|'DELIVERED'|'CANCELLED'} status
 * @property {string} subtotalAmount
 * @property {string} taxAmount
 * @property {string} shippingAmount
 * @property {string} discountAmount
 * @property {string} totalAmount
 * @property {Object} shippingAddress
 * @property {Object|null} billingAddress
 * @property {string} createdAt
 */

/**
 * @typedef {Object} OrderItem
 * @property {number} id
 * @property {string} orderId
 * @property {string|null} variantId
 * @property {string} productName
 * @property {Object|null} variantAttributes
 * @property {string} unitPrice
 * @property {number} quantity
 */

/**
 * @typedef {Object} Payment
 * @property {number} id
 * @property {string} orderId
 * @property {string|null} provider
 * @property {string|null} paymentIntentId
 * @property {'PENDING'|'SUCCESS'|'FAILED'} status
 * @property {string} amount
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Shipment
 * @property {number} id
 * @property {string} orderId
 * @property {string|null} carrier
 * @property {string|null} trackingNumber
 * @property {string|null} shippedAt
 * @property {string|null} deliveredAt
 */
export {};