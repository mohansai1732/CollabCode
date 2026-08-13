// const fileRoutes = require('./fileRoutes');
const express = require('express');
const roomRoutes = require('./roomRoutes');
// const executeRoute = require('./executeRoute');

const router = express.Router();

// router.use('/files', fileRoutes);
// router.use('/execute', executeRoute);
router.use('/rooms', roomRoutes);

module.exports = router;
