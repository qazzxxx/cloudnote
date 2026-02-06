import React, { useState, useEffect, useCallback } from 'react';
import { Layout, message, Input } from 'antd';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import { getFiles, renameFile } from './api';
import type { FileNode } from './api';
import './App.css';

const { Sider, Content } = Layout;

const App: React.FC = () => {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const fetchFiles = useCallback(async () => {
    try {
      const data = await getFiles();
      setFiles(data);
    } catch (error) {
      message.error('无法加载文件列表');
      console.error(error);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
    // Optional: Poll for changes or use WebSocket for real-time sync
    const interval = setInterval(fetchFiles, 5000);
    return () => clearInterval(interval);
  }, [fetchFiles]);

  useEffect(() => {
    if (selectedFile) {
        // Extract filename from path
        const name = selectedFile.split('/').pop() || '';
        // Remove .md extension for display
        setFileName(name.replace(/\.md$/, ''));
    } else {
        setFileName('');
    }
  }, [selectedFile]);

  const handleTitleChange = async (e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
      if (!selectedFile) return;
      const newName = (e.currentTarget as HTMLInputElement).value.trim();
      
      const oldName = selectedFile.split('/').pop() || '';
      const oldNameNoExt = oldName.replace(/\.md$/, '');
      
      if (!newName || newName === oldNameNoExt) return; // No change

      const directory = selectedFile.substring(0, selectedFile.lastIndexOf('/'));
      const newPath = directory ? `${directory}/${newName}.md` : `${newName}.md`;

      try {
          await renameFile(selectedFile, newPath);
          setSelectedFile(newPath); // Update selected file path
          setFileName(newName);
          message.success('重命名成功');
          await fetchFiles();
      } catch (error) {
          message.error('重命名失败');
          // Revert
          setFileName(oldNameNoExt);
      }
  };

  return (
    <Layout style={{ height: '100vh' }}>
      <Layout>
        <Sider width={300} theme="light" style={{ borderRight: '1px solid #f0f0f0', background: '#fcfcfc' }}>
          <Sidebar files={files} onSelect={setSelectedFile} onRefresh={fetchFiles} />
        </Sider>
        <Content style={{ background: '#fff', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {selectedFile && (
              <div style={{ padding: '10px 20px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
                  <Input 
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    onBlur={handleTitleChange}
                    onPressEnter={(e) => {
                        (e.target as HTMLInputElement).blur();
                    }}
                    variant="borderless"
                    style={{ fontSize: '24px', fontWeight: 'bold', padding: 0 }}
                  />
              </div>
          )}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Editor filePath={selectedFile} />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
