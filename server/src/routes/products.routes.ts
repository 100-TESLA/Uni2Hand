import { requireVerifiedStudent } from '../middleware/student-trade.middlewares.js';
import { Router } from 'express'
import { createProductValidator } from '../middleware/products.middlewares.js'
import { accessTokenValidator } from '../middleware/auth.middlewares.js'
import { createProductController, getSellerProductsController, getProductsController, getProductByIdController, updateProductsStatusController, updateProductController, deleteProductController } from '../controllers/products.controllers.js'
export const productRouter= Router()
productRouter.post('/', accessTokenValidator, requireVerifiedStudent, createProductValidator, createProductController )
productRouter.get('/',  getProductsController)
productRouter.get('/me', accessTokenValidator, getSellerProductsController)
productRouter.get('/:id', getProductByIdController)
productRouter.put('/:id', accessTokenValidator, requireVerifiedStudent, updateProductController)
productRouter.delete('/:id', accessTokenValidator, requireVerifiedStudent, deleteProductController)
productRouter.patch('/status', accessTokenValidator, requireVerifiedStudent, updateProductsStatusController)