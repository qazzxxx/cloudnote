import localforage from 'localforage';
import { updateFile, patchFile } from '../api';
import DiffMatchPatch from 'diff-match-patch';
// @ts-ignore
import md5 from 'md5'; // You might need to install md5 or use crypto-js

const dmp = new DiffMatchPatch();

// Initialize storage
let noteStorage: LocalForage;
try {
  noteStorage = localforage.createInstance({
    name: 'CloudNote',
    storeName: 'drafts'
  });
} catch (e) {
  console.error('Failed to initialize localforage', e);
  // Fallback or just re-throw? 
  // If it fails, the app is broken anyway regarding this feature.
  // But we can try to use default instance or mock.
  noteStorage = localforage;
}

export interface Draft {
  content: string;
  timestamp: number; // When the draft was last modified locally
  dirty: boolean;    // True if changes haven't been synced to server
  shadowContent?: string; // The content we believe is on the server (for diff)
  shadowChecksum?: string; // MD5 of shadowContent
}

export const StorageService = {
  // Get draft for a specific file
  getDraft: async (path: string): Promise<Draft | null> => {
    return noteStorage.getItem<Draft>(path);
  },

  // Save draft locally
  saveDraft: async (path: string, content: string): Promise<void> => {
    // We need to preserve shadow info if it exists
    const existing = await noteStorage.getItem<Draft>(path);
    await noteStorage.setItem(path, {
      content,
      timestamp: Date.now(),
      dirty: true,
      shadowContent: existing?.shadowContent,
      shadowChecksum: existing?.shadowChecksum
    });
  },

  // Initialize shadow copy (when loading from server)
  initShadow: async (path: string, content: string, checksum: string): Promise<void> => {
      // If we are initing shadow, it means we just fetched fresh content from server.
      // We should update our draft to match this content (clean state)
      await noteStorage.setItem(path, {
          content,
          timestamp: Date.now(),
          dirty: false,
          shadowContent: content,
          shadowChecksum: checksum
      });
  },

  // Mark draft as clean (synced)
  markClean: async (path: string, lastModified: number, newChecksum: string, newContent: string): Promise<void> => {
    const draft = await noteStorage.getItem<Draft>(path);
    if (draft) {
      await noteStorage.setItem(path, {
        ...draft,
        dirty: false,
        timestamp: lastModified,
        shadowContent: newContent,
        shadowChecksum: newChecksum
      });
    }
  },

  // Remove draft
  removeDraft: async (path: string): Promise<void> => {
    await noteStorage.removeItem(path);
  },

  // Sync draft to server
  syncFile: async (path: string): Promise<{ success: boolean; lastModified?: number; error?: any }> => {
    try {
      const draft = await noteStorage.getItem<Draft>(path);
      if (!draft || !draft.dirty) {
        return { success: true }; // Nothing to sync
      }

      // Incremental Update Strategy
      if (draft.shadowContent && draft.shadowChecksum) {
          try {
              // 1. Calculate Patch
              const patches = dmp.patch_make(draft.shadowContent, draft.content);
              const patchText = dmp.patch_toText(patches);

              // 2. Send Patch
              const response = await patchFile(path, patchText, draft.shadowChecksum);
              
              // 3. Update Shadow (Success)
              await StorageService.markClean(path, response.lastModified, response.checksum, draft.content);
              return { success: true, lastModified: response.lastModified };

          } catch (patchError: any) {
              // Fallback to Full Update if patch fails (409 or 422)
              console.warn('Patch failed, falling back to full update', patchError);
              
              // If 409 (Conflict), we might want to reload content first?
              // But requirements say "Force Full Upload" or "Merge".
              // Let's try Force Full Upload for now as per "Scenario B".
              // If it's a conflict (409), usually we should fetch and merge.
              // But here we implement simple overwrite fallback for robustness first.
              
              const response = await updateFile(path, draft.content);
              await StorageService.markClean(path, response.lastModified, response.checksum, draft.content);
              return { success: true, lastModified: response.lastModified };
          }
      } else {
          // No shadow copy (first time save or legacy), do Full Update
          const response = await updateFile(path, draft.content);
          // We assume response.checksum is MD5 of saved content
          // If backend updateFile doesn't return checksum, we might need to calc it locally or fetch it.
          // Backend updateFile updated to return checksum.
          await StorageService.markClean(path, response.lastModified, response.checksum, draft.content);
          return { success: true, lastModified: response.lastModified };
      }

    } catch (error) {
      console.error('Sync failed', error);
      return { success: false, error };
    }
  },

  // Force sync immediately
  forceSync: async (path: string, content: string): Promise<{ success: boolean }> => {
      try {
          await StorageService.saveDraft(path, content);
          const result = await StorageService.syncFile(path);
          return { success: result.success };
      } catch (error) {
          return { success: false };
      }
  },

  // Move draft to new path
  moveDraft: async (oldPath: string, newPath: string): Promise<void> => {
      const draft = await noteStorage.getItem<Draft>(oldPath);
      if (draft) {
          await noteStorage.setItem(newPath, draft);
          await noteStorage.removeItem(oldPath);
      }
  },

  // Sync all dirty files (e.g. on online)
  syncAll: async (): Promise<void> => {
    const keys = await noteStorage.keys();
    for (const key of keys) {
      const draft = await noteStorage.getItem<Draft>(key);
      if (draft && draft.dirty) {
        await StorageService.syncFile(key);
      }
    }
  }
};
