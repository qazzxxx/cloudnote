import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import multer from 'multer';
import DiffMatchPatch from 'diff-match-patch';
import crypto from 'crypto';

const router = express.Router();
const dmp = new DiffMatchPatch();

// In-memory cache for file content
interface CacheEntry {
  mtimeMs: number;
  content: string;
}
const fileCache: Record<string, CacheEntry> = {};

// Concurrency limiter utility
const pLimit = (concurrency: number) => {
  const queue: (() => Promise<void>)[] = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      queue.shift()!();
    }
  };

  const run = async (fn: () => Promise<void>, resolve: (value: any) => void, reject: (reason?: any) => void) => {
    activeCount++;
    const result = (async () => fn())();
    try {
      const res = await result;
      resolve(res);
    } catch (err) {
      reject(err);
    } finally {
      next();
    }
  };

  const enqueue = (fn: () => Promise<void>, resolve: (value: any) => void, reject: (reason?: any) => void) => {
    queue.push(run.bind(null, fn, resolve, reject));
    if (activeCount < concurrency && queue.length > 0) {
      queue.shift()!();
    }
  };

  const generator = (fn: () => Promise<void>) => new Promise((resolve, reject) => {
    enqueue(fn, resolve, reject);
  });

  return generator;
};

// Helper to calculate MD5
const md5 = (text: string) => crypto.createHash('md5').update(text).digest('hex');

// Define data directory
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
const IMAGES_DIR = path.join(DATA_DIR, 'upload');
const TRASH_DIR = path.join(DATA_DIR, '_trash');

// Ensure data directory exists
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(IMAGES_DIR);
fs.ensureDirSync(TRASH_DIR);

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
    if (item.name.startsWith('.') || item.name === 'upload' || item.name === '_trash') continue; // Skip hidden files, upload and _trash folder

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
    const stats = await fs.stat(fullPath);
    res.json({ content, lastModified: stats.mtimeMs, checksum: md5(content) });
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
    const stats = await fs.stat(fullPath);

    res.json({ success: true, lastModified: stats.mtimeMs, checksum: md5(content || '') });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// PATCH /api/files - Patch file content
router.patch('/', async (req, res) => {
  try {
    const { path: reqPath, patch, checksum } = req.body;
    if (!reqPath || typeof patch !== 'string' || !checksum) {
      return res.status(400).json({ error: 'Path, patch and checksum are required' });
    }

    // Sometimes patch can be empty string if only whitespace changed or something weird, but dmp usually produces something.
    // However, req.body.patch might be undefined if not sent.
    // Let's ensure strict check.

    const fullPath = getSafePath(reqPath);
    if (!await fs.pathExists(fullPath)) return res.status(404).json({ error: 'File not found' });

    const currentContent = await fs.readFile(fullPath, 'utf-8');

    // Check checksum
    if (md5(currentContent) !== checksum) {
      return res.status(409).json({ error: 'Version mismatch', currentContent });
    }

    // Apply patch
    const patches = dmp.patch_fromText(patch);
    const [newText, results] = dmp.patch_apply(patches, currentContent);

    // Check if patch applied successfully
    // results is array of booleans
    const success = results.every(s => s);
    if (!success) {
      return res.status(422).json({ error: 'Patch failed to apply cleanly', currentContent });
    }

    await fs.writeFile(fullPath, newText);
    const stats = await fs.stat(fullPath);

    res.json({ success: true, lastModified: stats.mtimeMs, checksum: md5(newText) });

  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// DELETE /api/files - Soft Delete file or folder
router.delete('/', async (req, res) => {
  try {
    const reqPath = req.query.path as string;
    if (!reqPath) return res.status(400).json({ error: 'Path is required' });

    const fullPath = getSafePath(reqPath);

    // Check if it exists
    if (!await fs.pathExists(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Move to trash with timestamp
    const fileName = path.basename(fullPath);
    const trashPath = path.join(TRASH_DIR, `${Date.now()}_${fileName}`);

    await fs.move(fullPath, trashPath);

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

// GET /api/files/search - Search files
// GET /api/files/search - Search files
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q) return res.json([]);

    const query = q.toLowerCase();
    const results: { key: string; title: string; matches: string[] }[] = [];

    // 1. Collect all markdown files first (fast recursive scan)
    const filesToScan: { fullPath: string; relativePath: string; name: string }[] = [];

    const collectFiles = async (dir: string, relativePath: string = '') => {
      const items = await fs.readdir(dir, { withFileTypes: true });

      for (const item of items) {
        if (item.name.startsWith('.') || item.name === 'upload' || item.name === '_trash') continue;

        const itemRelativePath = path.join(relativePath, item.name);
        const fullPath = path.join(dir, item.name);

        if (item.isDirectory()) {
          await collectFiles(fullPath, itemRelativePath);
        } else if (item.isFile() && item.name.endsWith('.md')) {
          filesToScan.push({ fullPath, relativePath: itemRelativePath, name: item.name });
        }
      }
    };

    await collectFiles(DATA_DIR);

    // 2. Process files in parallel with concurrency limit
    const limit = pLimit(50); // Process 50 files concurrently

    await Promise.all(filesToScan.map(file => limit(async () => {
      let content = '';
      let isMatch = false;
      let matches: string[] = [];

      // Check filename match
      if (file.name.toLowerCase().includes(query)) {
        isMatch = true;
      }

      // Get content (from cache or disk)
      try {
        const stats = await fs.stat(file.fullPath);

        // Skip content search for large files (> 100MB)
        if (stats.size > 100 * 1024 * 1024) {
          if (isMatch) {
            results.push({
              key: file.relativePath,
              title: file.name,
              matches: []
            });
          }
          return;
        }

        const cached = fileCache[file.fullPath];

        if (cached && cached.mtimeMs === stats.mtimeMs) {
          content = cached.content;
        } else {
          content = await fs.readFile(file.fullPath, 'utf-8');
          fileCache[file.fullPath] = { mtimeMs: stats.mtimeMs, content };
        }
      } catch (err) {
        // e.g. file deleted during scan
        return;
      }

      // Check content match
      const lowerContent = content.toLowerCase();
      let index = lowerContent.indexOf(query);

      // Find all matches or just the first few? 
      // Original code found only the first one. Let's stick to that for now, 
      // or maybe iterate if we want multiple snippets. 
      // optimizing: just find first for now to keep it fast, or maybe regex.
      // String.indexOf is fast.

      if (index > -1) {
        isMatch = true;
        const start = Math.max(0, index - 20);
        const end = Math.min(content.length, index + query.length + 50);
        matches.push('...' + content.substring(start, end).replace(/\n/g, ' ') + '...');
      }

      if (isMatch) {
        results.push({
          key: file.relativePath,
          title: file.name,
          matches: matches.length > 0 ? matches : []
        });
      }
    })));

    res.json(results);

  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
