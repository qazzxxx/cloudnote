import fs from 'fs-extra';
import path from 'path';
import cron from 'node-cron';

// Define directories
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
const IMAGES_DIR = path.join(DATA_DIR, 'upload');
const TRASH_DIR = path.join(DATA_DIR, '_trash');

// Helper to scan directory recursively for .md files
async function getMarkdownFiles(dir: string): Promise<string[]> {
    let results: string[] = [];
    const list = await fs.readdir(dir);
    for (const file of list) {
        if (file.startsWith('.') || file === '_trash' || file === 'upload') continue;
        
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(await getMarkdownFiles(filePath));
        } else if (file.endsWith('.md')) {
            results.push(filePath);
        }
    }
    return results;
}

// Helper to scan directory recursively for all files (physical assets)
async function getAllFiles(dir: string): Promise<string[]> {
    let results: string[] = [];
    // Ensure dir exists
    if (!await fs.pathExists(dir)) return [];
    
    const list = await fs.readdir(dir);
    for (const file of list) {
        if (file.startsWith('.')) continue;
        
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(await getAllFiles(filePath));
        } else {
            results.push(filePath);
        }
    }
    return results;
}

// GC Logic
async function runGarbageCollection() {
    console.log('[GC] Starting Mark-and-Sweep...');
    
    try {
        // 1. Mark: Build Reference Set
        const usedFiles = new Set<string>();
        const mdFiles = await getMarkdownFiles(DATA_DIR);
        
        // Regex for Markdown images: ![alt](url)
        // Regex for HTML img tags: <img src="url">
        // URL might be relative like /upload/2023/01/01/xxx.png or full url
        // We only care about /upload/... paths
        
        const mdImageRegex = /!\[.*?\]\((.*?)\)/g;
        const htmlImageRegex = /<img[^>]+src=["'](.*?)["']/g;
        
        for (const file of mdFiles) {
            const content = await fs.readFile(file, 'utf-8');
            
            // Extract MD images
            let match;
            while ((match = mdImageRegex.exec(content)) !== null) {
                const url = match[1];
                if (url && url.includes('/upload/')) {
                    usedFiles.add(decodeURIComponent(url));
                }
            }
            
            // Extract HTML images
            while ((match = htmlImageRegex.exec(content)) !== null) {
                const url = match[1];
                if (url && url.includes('/upload/')) {
                    usedFiles.add(decodeURIComponent(url));
                }
            }
        }
        
        console.log(`[GC] Found ${usedFiles.size} referenced assets.`);
        
        // 2. Physical List
        const allAssets = await getAllFiles(IMAGES_DIR);
        
        // 3. Sweep: Find Orphans
        let orphanedCount = 0;
        
        for (const assetPath of allAssets) {
            // Convert absolute path to URL path for comparison
            // Asset path: /app/data/upload/2023/01/01/img.png
            // URL path: /upload/2023/01/01/img.png
            
            // Get relative path from DATA_DIR
            const relPath = path.relative(DATA_DIR, assetPath);
            // Ensure forward slashes and leading slash
            const urlPath = '/' + relPath.split(path.sep).join('/');
            
            // Check if used
            // Note: usedFiles contains decoded URLs. 
            // If URL is /upload/2023/01/01/img.png, it matches.
            // If URL has query params, we might need to strip them, but standard upload doesn't have them.
            
            if (!usedFiles.has(urlPath)) {
                // Orphan found!
                // 4. Quarantine
                const fileName = path.basename(assetPath);
                const trashPath = path.join(TRASH_DIR, `orphaned_${Date.now()}_${fileName}`);
                
                await fs.move(assetPath, trashPath);
                orphanedCount++;
            }
        }
        
        if (orphanedCount > 0) {
            console.log(`[GC] Moved ${orphanedCount} orphaned files to trash.`);
        }
        
        // 5. Final Delete (Clean Trash)
        // Delete files older than 30 days in _trash
        const trashFiles = await fs.readdir(TRASH_DIR);
        const now = Date.now();
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        
        let deletedCount = 0;
        for (const file of trashFiles) {
            const filePath = path.join(TRASH_DIR, file);
            const stat = await fs.stat(filePath);
            
            if (now - stat.mtimeMs > THIRTY_DAYS) {
                await fs.remove(filePath);
                deletedCount++;
            }
        }
        
        if (deletedCount > 0) {
            console.log(`[GC] Permanently deleted ${deletedCount} old files from trash.`);
        }
        
        console.log('[GC] Completed.');
        
    } catch (error) {
        console.error('[GC] Error:', error);
    }
}

// Schedule: Run every day at 3:00 AM
export const initGC = () => {
    // Cron format: Second (optional) Minute Hour DayofMonth Month DayofWeek
    cron.schedule('0 3 * * *', () => {
        runGarbageCollection();
    });
    console.log('[GC] Scheduler initialized (Daily at 3:00 AM).');
};
