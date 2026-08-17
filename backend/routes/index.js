import express from 'express';

// 1. Import Sub-Routers (Ensure relative paths include the .js extension)
import roomRoutes from './roomRoutes.js';
// import fileRoutes from './fileRoutes.js';
// import executeRoute from './executeRoute.js';

const router = express.Router();

// 2. Health Check / Root Diagnostics Endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 3. Mount Routes
router.use('/rooms', roomRoutes);
// router.use('/files', fileRoutes);
// router.use('/execute', executeRoute);

// 4. Catch Unmatched Endpoints inside this router namespace
router.use('*', (req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

export default router;