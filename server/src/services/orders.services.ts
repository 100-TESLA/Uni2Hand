import { ObjectId } from 'mongodb';
import databaseService from './database.services.js';
import { OrderStatus, PaymentStatus } from '../models/orders.schemas.js';
import { canTrade } from '../middleware/student-trade.middlewares.js';

class OrderService {
  async createOrder(data: any) {
    try {
      if (!ObjectId.isValid(data.buyer_id) || !ObjectId.isValid(data.seller_id) ||
        !Array.isArray(data.product_ids) || !data.product_ids.length ||
        !data.product_ids.every((id: unknown) => typeof id === 'string' && ObjectId.isValid(id))) {
        throw Object.assign(new Error('Thông tin sản phẩm hoặc tài khoản không hợp lệ.'), { status: 400 });
      }
      const [buyer, seller] = await Promise.all([
        databaseService.users.findOne({ _id: new ObjectId(data.buyer_id) }),
        databaseService.users.findOne({ _id: new ObjectId(data.seller_id) }),
      ]);
      if (!canTrade(buyer) || !canTrade(seller)) {
        throw Object.assign(new Error('Người mua và người bán đều phải xác thực thẻ sinh viên trước khi giao dịch.'), { status: 403 });
      }
      const ids = [...new Set<string>(data.product_ids)].map(id => new ObjectId(id));
      const products = await databaseService.products.find({ _id: { $in: ids } }).toArray();
      if (products.length !== ids.length || products.some(product => String(product.seller_id) !== String(seller!._id))) {
        throw Object.assign(new Error('Sản phẩm không thuộc người bán đã chọn.'), { status: 400 });
      }

      const result = await databaseService.orders.insertOne({
        ...data,
        buyer_id: new ObjectId(data.buyer_id),
        seller_id: new ObjectId(data.seller_id),
        product_ids: data.product_ids.map((id: string) => new ObjectId(id)),
        vnp_txn_ref: data.vnp_txn_ref,
        created_at: new Date(),
        updated_at: new Date()
      });
      
      console.log('Order Created in DB:', result.insertedId)

      const updateResult = await databaseService.products.updateMany(
        { _id: { $in: data.product_ids.map((id: string) => new ObjectId(id)) } },
        { $set: { status: 0 } }
      );

      console.log('Products status updated:', updateResult.modifiedCount)

      await databaseService.transactions.insertOne({
        user_id: new ObjectId(data.buyer_id),
        order_id: result.insertedId, 
        amount: data.total_amount,
        type: 'PAYMENT',
        payment_method: data.payment_method,
        status: data.payment_method === 'cod' ? 'PENDING' : (data.payment_method === 'vnpay' ? 'PENDING' : 'SUCCESS'), 
        order_status: data.status || 'Pending',
        vnp_txn_ref: data.vnp_txn_ref,
        created_at: new Date()
      });
      console.log('Transaction Created for Order:', result.insertedId);

      console.log('--- END CREATE ORDER SUCCESS ---');
      return result;
    } catch (error: any) {
      console.error('CRITICAL ERROR IN CREATE ORDER:', error);
      throw error;
    }
  }

  async getMyPurchases(buyer_id: string) {
    // Join with products to show info
    return await databaseService.orders.aggregate([
      { $match: { buyer_id: new ObjectId(buyer_id) } },
      { $lookup: {
          from: 'products',
          localField: 'product_ids',
          foreignField: '_id',
          as: 'products'
      }},
      { $sort: { created_at: -1 } }
    ]).toArray();
  }

  async getMySales(seller_id: string) {
    return await databaseService.orders.aggregate([
      { $match: { seller_id: new ObjectId(seller_id) } },
      { $lookup: {
          from: 'products',
          localField: 'product_ids',
          foreignField: '_id',
          as: 'products'
      }},
      { $sort: { created_at: -1 } }
    ]).toArray();
  }

  async updateOrderStatus(order_id: string, status: OrderStatus, user_id: string) {
      // Find order to check permissions
      const order = await databaseService.orders.findOne({ _id: new ObjectId(order_id) });
      if (!order) throw new Error('Order not found');
      if (String(order.buyer_id) !== user_id && String(order.seller_id) !== user_id) {
        throw new Error('Bạn không có quyền cập nhật đơn hàng này.');
      }

      // Logic: 
      // Seller can move Pending -> Shipping / Cancel
      // Buyer can move Shipping -> Completed / Cancel (if Pending)
      
      const updateData: any = { status, updated_at: new Date() };
      
      // If completed, set payment to paid (mostly for COD)
      if (status === OrderStatus.Completed) {
          updateData.payment_status = PaymentStatus.Paid;
      }

      await databaseService.orders.updateOne(
          { _id: new ObjectId(order_id) },
          { $set: updateData }
      );

      // Sync order_status to transactions
      await databaseService.transactions.updateMany(
          { order_id: new ObjectId(order_id) },
          { $set: { order_status: status } }
      );

      return true;
  }
}

const orderService = new OrderService();
export default orderService;
