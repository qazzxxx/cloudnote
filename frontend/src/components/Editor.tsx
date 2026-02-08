import React, { useEffect, useState, useRef, useCallback } from 'react';
import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import * as locales from "@blocknote/core/locales";
import { getFileContent, uploadFile } from '../api';
import { StorageService } from '../services/StorageService';
import { message, Spin } from 'antd';

interface EditorProps {
  filePath: string | null;
  isDarkMode?: boolean;
}

export interface EditorRef {
    forceSave: () => Promise<void>;
}

type SaveStatus = 'saved' | 'saving' | 'dirty' | 'offline';

const Editor = React.forwardRef<EditorRef, EditorProps>(({ filePath, isDarkMode }, ref) => {
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  
  // Debounce refs
  const saveDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useCreateBlockNote({
    dictionary: locales.zh,
    uploadFile: uploadFile,
  });

  // Expose forceSave
  React.useImperativeHandle(ref, () => ({
      forceSave: async () => {
          if (!filePath) return;
          // Clear timers
          if (saveDraftTimerRef.current) clearTimeout(saveDraftTimerRef.current);
          if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
          
          // Force save draft and sync
          const markdown = await getMarkdown(editor.document);
          await StorageService.forceSync(filePath, markdown);
      }
  }));

  // Theme effect
  useEffect(() => {
     // No-op for now, handled by css
  }, [isDarkMode]);

  // Helper to convert blocks to markdown
  const getMarkdown = async (blocks: typeof editor.document) => {
      // Post-process to preserve empty lines logic can be added here if needed
      // For now we use default lossy
      
      // We need to inject NBSP for empty paragraphs to preserve them
      const blocksToSave = blocks.map(block => {
          if (block.type === 'paragraph' && (!block.content || (Array.isArray(block.content) && block.content.length === 0))) {
              return {
                  ...block,
                  content: [{ type: "text", text: "\u00A0", styles: {} }]
              } as any;
          }
          return block;
      });
      
      return await editor.blocksToMarkdownLossy(blocksToSave);
  };

  // Sync logic
  const triggerSync = useCallback(async (path: string) => {
      setSaveStatus('saving');
      const result = await StorageService.syncFile(path);
      if (result.success) {
          setSaveStatus('saved');
      } else {
          setSaveStatus('offline');
      }
  }, []);

  // Content change handler
  const handleContentChange = useCallback(() => {
      if (!filePath || loading) return;

      // 1. Clear existing timers
      if (saveDraftTimerRef.current) clearTimeout(saveDraftTimerRef.current);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

      // 2. Set status to dirty immediately
      if (saveStatus !== 'dirty' && saveStatus !== 'saving') {
          setSaveStatus('dirty');
      }

      // 3. Schedule Draft Save (500ms) - Fast
      saveDraftTimerRef.current = setTimeout(async () => {
          const markdown = await getMarkdown(editor.document);
          await StorageService.saveDraft(filePath, markdown);
          // Don't change status to 'saved' yet, only 'dirty' (saved locally)
          // But we can update last saved time for local save?
          
          // 4. Schedule Cloud Sync (2000ms after stop typing) - Slow
          syncTimerRef.current = setTimeout(() => {
              triggerSync(filePath);
          }, 2000);
          
      }, 500);

  }, [filePath, loading, editor, saveStatus, triggerSync]);

  // Cleanup timers when switching files
  useEffect(() => {
    if (!filePath) return;

    return () => {
      if (saveDraftTimerRef.current) clearTimeout(saveDraftTimerRef.current);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [filePath]);

  // Load content logic (Double Buffering)
  useEffect(() => {
    if (!filePath) return;

    // Clear editor content immediately
    editor.replaceBlocks(editor.document, []);
    
    // Reset state
    setSaveStatus('saved');
    setLoading(true);

    const loadContent = async () => {
      try {
        // Parallel fetch: Server + Local Draft
        const [serverData, localDraft] = await Promise.all([
            getFileContent(filePath).catch(() => null), // If server fails, we might still have local
            StorageService.getDraft(filePath)
        ]);

        let contentToLoad = '';

        // Decision Logic
        if (!serverData && !localDraft) {
            throw new Error('File not found');
        }

        if (!serverData && localDraft) {
            // Server error or offline, but we have draft
            contentToLoad = localDraft.content;
            message.warning('无法连接服务器，已加载本地草稿');
        } else if (serverData && !localDraft) {
            // No draft, use server
            contentToLoad = serverData.content;
            // Init Shadow
            if (serverData.checksum) {
                StorageService.initShadow(filePath, serverData.content, serverData.checksum);
            }
        } else if (serverData && localDraft) {
            // Both exist
            
            if (localDraft.dirty) {
                // If local is dirty, it means we have unsaved changes. 
                contentToLoad = localDraft.content;
                
                // Trigger sync since we have dirty draft
                setTimeout(() => triggerSync(filePath), 1000);
            } else {
                // Local is clean. 
                contentToLoad = serverData.content;
                // Update Shadow
                if (serverData.checksum) {
                    StorageService.initShadow(filePath, serverData.content, serverData.checksum);
                }
            }
        }
        if (contentToLoad) {
            contentToLoad = contentToLoad.replace(/^([^\n\r]*?)\\\s*(\r?\n|$)/gm, (_match, p1) => {
                if (!p1 || p1.trim().length === 0) {
                    return '\u00A0\n\n';
                }
                return p1 + '\n\n';
            });
        }

        // Parse and set content
        const blocks = await editor.tryParseMarkdownToBlocks(contentToLoad);
        
        // Fix empty lines & video blocks (same logic as before)
        const cleanBlocks = blocks.map(block => {
            if (block.type === 'paragraph' && block.content && block.content.length === 1) {
                const firstContent = block.content[0];
                if (firstContent.type === 'text' && firstContent.text === '\u00A0') {
                    return { ...block, content: [] } as any;
                }
            }
            if (block.type === 'image' && block.props.url) {
                const url = block.props.url.toLowerCase();
                if (url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.ogg') || url.endsWith('.mov')) {
                    return {
                        ...block,
                        type: 'video',
                        props: { ...block.props }
                    } as any;
                }
            }
            return block;
        });
        
        editor.replaceBlocks(editor.document, cleanBlocks);

      } catch (error) {
        message.error('加载文件失败');
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [filePath, editor, triggerSync]); // Removed handleContentChange from dependencies

  // Separate effect for listener binding to prevent load loop
  useEffect(() => {
    if (!filePath) return;

    const cleanup = editor.onEditorContentChange(handleContentChange);
    return () => {
        if (typeof cleanup === 'function') {
            (cleanup as Function)();
        }
    };
  }, [filePath, editor, handleContentChange]);

  // Online/Offline listener
  useEffect(() => {
      const handleOnline = () => {
          message.success('网络已恢复，正在同步...');
          StorageService.syncAll().then(() => {
             if (filePath) {
                 // Refresh status if current file was dirty
                 StorageService.getDraft(filePath).then(d => {
                     if (d && !d.dirty) setSaveStatus('saved');
                 });
             }
          });
      };
      const handleOffline = () => {
          setSaveStatus('offline');
      };
      
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
      };
  }, [filePath]);

  if (!filePath) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>请选择一个文件</div>;
  }

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', background: isDarkMode ? '#1f1f1f' : '#fff' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Spin /></div>
        ) : (
            <BlockNoteView editor={editor} theme={isDarkMode ? "dark" : "light"} />
        )}
      </div>
    </div>
  );
});

export default Editor;
