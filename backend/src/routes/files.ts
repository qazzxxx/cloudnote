import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import multer from 'multer';

const router = express.Router();

// Define data directory
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
const IMAGES_DIR = path.join(DATA_DIR, 'upload');

// Ensure data directory exists
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(IMAGES_DIR);

// Configure Multer
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dir = path.join(IMAGES_DIR, String(year), month, day);
    await fs.ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Keep original extension, generate unique name or keep original name
    // To avoid conflicts, maybe append timestamp?
    // User wants "images/YYYY/MM/DD/"
    // Let's use timestamp + original name
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Helper to get absolute path and validate it's inside DATA_DIR
const getSafePath = (reqPath: string) => {
  const safePath = path.resolve(DATA_DIR, reqPath.replace(/^\/+/, ''));
  if (!safePath.startsWith(DATA_DIR)) {
    throw new Error('Invalid path');
  }
  return safePath;
};

// Type for file tree node
interface FileNode {
  key: string;
  title: string;
  isLeaf: boolean;
  children?: FileNode[];
}

// Recursive function to build file tree
const buildFileTree = async (dir: string, relativePath: string = ''): Promise<FileNode[]> => {
  const items = await fs.readdir(dir, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const item of items) {
    if (item.name.startsWith('.') || item.name === 'upload') continue; // Skip hidden files and upload folder

    const itemRelativePath = path.join(relativePath, item.name);
    const fullPath = path.join(dir, item.name);
    
    if (item.isDirectory()) {
      nodes.push({
        key: itemRelativePath,
        title: item.name,
        isLeaf: false,
        children: await buildFileTree(fullPath, itemRelativePath)
      });
    } else if (item.isFile() && item.name.endsWith('.md')) {
      nodes.push({
        key: itemRelativePath,
        title: item.name,
        isLeaf: true
      });
    }
  }
  
  // Sort: Folders first, then files
  return nodes.sort((a, b) => {
    if (a.isLeaf === b.isLeaf) return a.title.localeCompare(b.title);
    return a.isLeaf ? 1 : -1;
  });
};

// GET /api/files - Get file tree
router.get('/', async (req, res) => {
  try {
    const tree = await buildFileTree(DATA_DIR);
    res.json(tree);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/files/content - Get file content
router.get('/content', async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });
    
    const fullPath = getSafePath(filePath);
    if (!await fs.pathExists(fullPath)) return res.status(404).json({ error: 'File not found' });
    
    const content = await fs.readFile(fullPath, 'utf-8');
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/files - Create file or folder
router.post('/', async (req, res) => {
  try {
    const { path: reqPath, type } = req.body;
    if (!reqPath || !type) return res.status(400).json({ error: 'Path and type are required' });
    
    const fullPath = getSafePath(reqPath);
    if (await fs.pathExists(fullPath)) return res.status(400).json({ error: 'Path already exists' });
    
    if (type === 'folder') {
      await fs.ensureDir(fullPath);
    } else {
      await fs.writeFile(fullPath, '');
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// PUT /api/files - Update file content
router.put('/', async (req, res) => {
  try {
    const { path: reqPath, content } = req.body;
    if (!reqPath) return res.status(400).json({ error: 'Path is required' });
    
    const fullPath = getSafePath(reqPath);
    await fs.writeFile(fullPath, content || '');
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// DELETE /api/files - Delete file or folder
router.delete('/', async (req, res) => {
  try {
    const reqPath = req.query.path as string;
    if (!reqPath) return res.status(400).json({ error: 'Path is required' });
    
    const fullPath = getSafePath(reqPath);
    await fs.remove(fullPath);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/files/rename - Rename file or folder
router.post('/rename', async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: 'Old path and new path are required' });
    
    const fullOldPath = getSafePath(oldPath);
    // newPath might be just the name, or relative path. Let's assume it's the full relative path from root
    // But usually rename is just changing the name in the same directory.
    // Let's handle if newPath is a full relative path.
    const fullNewPath = getSafePath(newPath);
    
    if (await fs.pathExists(fullNewPath)) return res.status(400).json({ error: 'Destination already exists' });
    
    await fs.rename(fullOldPath, fullNewPath);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/files/move - Move file or folder
router.post('/move', async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: 'Old path and new path are required' });
    
    const fullOldPath = getSafePath(oldPath);
    const fullNewPath = getSafePath(newPath);
    
    // Check if destination exists
    // If we are moving a folder, and destination exists and is a folder, move INTO it?
    // No, newPath is the full path of the moved item.
    // E.g. move /a/file.md to /b/file.md. newPath is /b/file.md.
    
    if (await fs.pathExists(fullNewPath)) {
        return res.status(400).json({ error: 'Destination already exists' });
    }
    
    // Ensure parent directory exists
    await fs.ensureDir(path.dirname(fullNewPath));
    
    await fs.move(fullOldPath, fullNewPath);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/files/upload - Upload file
router.post('/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        // Calculate relative path for URL
        // req.file.path is absolute path
        const relativePath = path.relative(IMAGES_DIR, req.file.path);
        // Ensure forward slashes for URL
        const urlPath = relativePath.split(path.sep).join('/');
        
        // Return absolute URL path (relative to domain root)
        res.json({ url: `/upload/${urlPath}` });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
