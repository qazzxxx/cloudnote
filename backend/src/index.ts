import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs-extra';
import fileRoutes from './routes/files';
import authRoutes from './routes/auth';
import { authMiddleware } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Support large files

// Serve uploaded images (Public for now, or use cookie auth if strict privacy needed)
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../data');
app.use('/upload', express.static(path.join(DATA_DIR, 'upload')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', authMiddleware, fileRoutes);

// Serve frontend static files in production
const frontendPath = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Data directory: ${path.resolve(__dirname, '../../data')}`);
});
