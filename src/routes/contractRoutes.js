const express = require('express');
const router = express.Router();
const {
    getContracts,
    getContract,
    createContract,
    updateContract,
    deleteContract,
    signContract,
    getContractStats
} = require('../controllers/contractController');
const { protect, authorize, logActivity } = require('../middleware/auth');

router.use(protect); // All routes require authentication

router.get('/', getContracts);
router.get('/stats/summary', authorize('admin', 'manager'), getContractStats);
router.get('/:id', getContract);

// Admin/Manager only
router.post('/', authorize('admin', 'manager'), logActivity, createContract);
router.put('/:id', authorize('admin', 'manager'), logActivity, updateContract);
router.post('/:id/sign', authorize('admin', 'manager'), logActivity, signContract);

// Admin only
router.delete('/:id', authorize('admin'), logActivity, deleteContract);

module.exports = router;
