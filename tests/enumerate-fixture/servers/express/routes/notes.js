const { Router } = require('express');
const router = Router();
router.get('/:id', (req, res) => res.json({}));
router.delete('/:id', (req, res) => res.status(204).end());
router.all('/export', (req, res) => res.json([]));
module.exports = router;
