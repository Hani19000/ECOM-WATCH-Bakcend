/**
 * @module Controller/Product
 *
 * Orchestre les opérations du catalogue produits et de leurs variantes.
 * La logique métier (prix, stock, images) est déléguée au service.
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
                pagination: result.pagination,
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
     * L'URL image est fournie par le middleware handleUpload via req.file.path.
     */
    create = asyncHandler(async (req, res) => {
        const imageUrl = req.file ? req.file.path : null;
        const { variant, ...productData } = req.body;

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
        const { size, sku, price, attributes, initialStock } = req.body;

        const variantData = {
            sku,
            price,
            size,
            initialStock,
            attributes,
            image: imageUrl,
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
            data: filters,
        });
    });

    deleteVariant = asyncHandler(async (req, res) => {
        await productService.deleteVariant(req.params.id);
        res.status(HTTP_STATUS.NO_CONTENT).send();
    });
}

export const productController = new ProductController();