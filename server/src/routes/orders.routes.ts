import { accessTokenValidator } from '../middleware/auth.middlewares.js';
import { requireVerifiedStudent } from '../middleware/student-trade.middlewares.js';
import { Router } from 'express';
import { 
  createOrderController, 
  getMyPurchasesController, 
  getMySalesController, 
  updateOrderStatusController 
} from '../controllers/orders.controllers.js';

const orderRouter = Router();

// Order APIs
orderRouter.post('/', accessTokenValidator, requireVerifiedStudent, createOrderController);
orderRouter.get('/buyer/:user_id', getMyPurchasesController);
orderRouter.get('/seller/:user_id', getMySalesController);
orderRouter.put('/:order_id/status', accessTokenValidator, requireVerifiedStudent, updateOrderStatusController);

export default orderRouter;
