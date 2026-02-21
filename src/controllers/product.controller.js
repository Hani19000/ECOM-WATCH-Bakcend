/**
 * @module Controller/Product
 */
import { productService } from '../services/products.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class ProductController {
    getAll = asyncHandler(async (req, res) => {
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

    getOne = asyncHandler(async (req, res) => {
        const { idOrSlug } = req.params;
        const product = await productService.getProductDetails(idOrSlug);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { product },
        });
    });

    /**
     * Crée un produit avec sa première variante et son image Cloudinary.
     */
    create = asyncHandler(async (req, res) => {
        // 1. Extraction de l'URL Cloudinary ajoutée par ton middleware handleUpload
        const imageUrl = req.file ? req.file.path : null;

        // 2. Récupération des données (rappel : gère le JSON.parse si envoyé via FormData)
        const { variant, ...productData } = req.body;

        // 3. On passe l'imageUrl au service pour qu'il l'insère dans la transaction
        const product = await productService.createProductWithVariant(
            productData,
            variant,
            imageUrl
        );

        res.status(HTTP_STATUS.CREATED).json({
            status: 'success',
            data: { product },
        });
    });

    update = asyncHandler(async (req, res) => {
        // Optionnel : Gérer la mise à jour de l'image ici aussi si req.file existe
        const updateData = { ...req.body };
        if (req.file) updateData.image = req.file.path;

        const product = await productService.updateProduct(req.params.id, updateData);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Produit mis à jour avec succès',
            data: { product },
        });
    });

    delete = asyncHandler(async (req, res) => {
        await productService.deleteProduct(req.params.id);
        res.status(HTTP_STATUS.NO_CONTENT).send();
    });

    addVariant = asyncHandler(async (req, res) => {
        const imageUrl = req.file ? req.file.path : null;

        // On récupère 'size' depuis le body
        const { size, sku, price, attributes, initialStock } = req.body;

        const variantData = {
            sku,
            price,
            size,
            initialStock, // On passe la taille explicitement
            attributes,
            image: imageUrl
        };

        const variant = await productService.addVariantToProduct(req.params.productId, variantData);

        res.status(HTTP_STATUS.CREATED).json({
            status: 'success',
            data: { variant },
        });
    });

    getFilters = asyncHandler(async (_req, res) => {
        const filters = await productService.getProductFilters();

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: filters
        });
    });

    deleteVariant = asyncHandler(async (req, res) => {
        await productService.deleteVariant(req.params.id);
        res.status(HTTP_STATUS.NO_CONTENT).send();
    });
}

export const productController = new ProductController();