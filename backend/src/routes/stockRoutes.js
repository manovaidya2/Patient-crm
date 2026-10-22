const express = require('express');
const { STOCK_ROLES, listStocks, createStock, updateStock, addStockTransaction, listLedger } = require('../controllers/stockController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(protect, authorize(...STOCK_ROLES));
router.get('/', listStocks);
router.get('/ledger', listLedger);
router.post('/', createStock);
router.patch('/:id', updateStock);
router.post('/:id/transactions', addStockTransaction);

module.exports = router;
