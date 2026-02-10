/**
 * @module Controller/Product
 *
 * Gère les interactions HTTP pour le catalogue de produits et les variantes.
 * Les opérations d'écriture (create, update, delete) sont réservées aux admins
 * via le middleware de rôle appliqué sur les routes.
 */
import { productService } from '../services/products.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class ProductController {
    /** Liste tous les produits du catalogue avec filtres optionnels (category, price, search...) */
    getAll = asyncHandler(async (req, res) => {
        // req.query peut maintenant contenir { categorySlug: 'montres-luxe', status: 'ACTIVE' }
        const result = await productService.listCatalog(req.query);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            results: result.data.length,
            data: {
                products: result.data,
                pagination: result.pagination
            },
        });
    });

    /** Récupère un produit par son slug (SEO) ou son ID (accès direct) */
    getOne = asyncHandler(async (req, res) => {
        const { idOrSlug } = req.params;
        const product = await productService.getProductDetails(idOrSlug);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { product },
        });
    });

    /**
     * Crée un produit avec sa première variante.
     * La variante est séparée du reste du body pour que le service
     * puisse les persister dans deux tables distinctes atomiquement.
     */
    create = asyncHandler(async (req, res) => {
        const { variant, ...productData } = req.body;
        const product = await productService.createProductWithVariant(productData, variant);

        res.status(HTTP_STATUS.CREATED).json({
            status: 'success',
            data: { product },
        });
    });

    /** Met à jour les informations d'un produit existant */
    update = asyncHandler(async (req, res) => {
        const product = await productService.updateProduct(req.params.id, req.body);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Produit mis à jour avec succès',
            data: { product },
        });
    });

    /** Supprime un produit du catalogue */
    delete = asyncHandler(async (req, res) => {
        await productService.deleteProduct(req.params.id);

        res.status(HTTP_STATUS.NO_CONTENT).send();
    });

    /** Ajoute une variante (taille, couleur...) à un produit existant */
    addVariant = asyncHandler(async (req, res) => {
        const variant = await productService.addVariantToProduct(req.params.productId, req.body);

        res.status(HTTP_STATUS.CREATED).json({
            status: 'success',
            data: { variant },
        });
    });
}

export const productController = new ProductController();