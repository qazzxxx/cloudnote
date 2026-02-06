import React, { useEffect, useState, useRef } from 'react';
import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import * as locales from "@blocknote/core/locales";
import { getFileContent, updateFile, uploadFile } from '../api';
import { message, Spin } from 'antd';

interface EditorProps {
  filePath: string | null;
  isDarkMode?: boolean;
}

const Editor: React.FC<EditorProps> = ({ filePath, isDarkMode }) => {
  const [loading, setLoading] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useCreateBlockNote({
    dictionary: locales.zh,
    uploadFile: uploadFile,
  });

  useEffect(() => {
      // Toggle theme
      // BlockNote doesn't support dynamic theme change easily via hook props update?
      // Actually BlockNoteView supports theme prop.
  }, [isDarkMode]);

  // Load content when filePath changes
  useEffect(() => {
    if (!filePath) return;

    // Clear editor content immediately to avoid showing old content
    editor.replaceBlocks(editor.document, []);

    const loadContent = async () => {
      setLoading(true);
      try {
        const content = await getFileContent(filePath);
        
        // Convert Markdown to Blocks
        const blocks = await editor.tryParseMarkdownToBlocks(content);
        
        // Post-process to remove NBSP used for preserving empty lines
        // AND convert Image blocks with video extensions to Video blocks
        const cleanBlocks = blocks.map(block => {
            // Fix empty lines
            if (block.type === 'paragraph' && block.content && block.content.length === 1) {
                const firstContent = block.content[0];
                if (firstContent.type === 'text' && firstContent.text === '\u00A0') {
                    return {
                        ...block,
                        content: []
                    } as any;
                }
            }

            // Fix Video blocks detected as Images
            if (block.type === 'image' && block.props.url) {
                const url = block.props.url.toLowerCase();
                if (url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.ogg') || url.endsWith('.mov')) {
                    return {
                        ...block,
                        type: 'video',
                        props: {
                            ...block.props,
                            // Ensure properties are compatible. Video block also uses 'url'
                        }
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
  }, [filePath, editor]);

  // Helper to prepare blocks for save (preserve empty lines)
  const prepareBlocksForSave = (blocks: typeof editor.document) => {
      return blocks.map(block => {
          if (block.type === 'paragraph' && (!block.content || (Array.isArray(block.content) && block.content.length === 0))) {
              return {
                  ...block,
                  content: [{ type: "text", text: "\u00A0", styles: {} }]
              } as any;
          }
          return block;
      });
  };

  // Save content listener
  useEffect(() => {
      if (loading || !filePath) return;

      const cleanupListener = editor.onEditorContentChange(() => {
          // Clear any pending save
          if (saveTimerRef.current) {
              clearTimeout(saveTimerRef.current);
          }
          
          // Schedule new save
          saveTimerRef.current = setTimeout(async () => {
              saveTimerRef.current = null; // Mark as fired
              try {
                  const blocksToSave = prepareBlocksForSave(editor.document);
                  const markdown = await editor.blocksToMarkdownLossy(blocksToSave);
                  await updateFile(filePath, markdown);
              } catch (error) {
                  console.error('Save failed', error);
              }
          }, 1000); // 1s debounce
      });

      return () => {
          if (typeof cleanupListener === 'function') {
            (cleanupListener as Function)();
          }
          // If there's a pending save when unmounting or changing files, force save immediately
          if (saveTimerRef.current) {
              clearTimeout(saveTimerRef.current);
              saveTimerRef.current = null;
              
              // Capture current blocks synchronously to ensure we save the correct state
              const currentBlocks = editor.document;
              const blocksToSave = prepareBlocksForSave(currentBlocks);
              
              // Handle both sync and async return just in case, but linter suggests sync
              Promise.resolve(editor.blocksToMarkdownLossy(blocksToSave)).then(markdown => {
                 updateFile(filePath, markdown).catch(e => console.error('Force save failed', e));
              });
          }
      };
  }, [editor, filePath, loading]);

  if (!filePath) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>请选择一个文件</div>;
  }

  return (
    <div style={{ height: '100%', width: '100%', overflowY: 'auto', padding: '16px', background: isDarkMode ? '#141414' : '#fff' }}>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Spin /></div>
      ) : (
        <BlockNoteView editor={editor} theme={isDarkMode ? "dark" : "light"} />
      )}
    </div>
  );
};

export default Editor;
