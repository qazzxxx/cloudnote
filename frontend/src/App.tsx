import React, { useState, useEffect, useCallback } from 'react';
import { Layout, message, Input, Spin } from 'antd';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import Login from './components/Login';
import { getFiles, renameFile, getAuthStatus } from './api';
import type { FileNode } from './api';
import './App.css';

const { Sider, Content } = Layout;

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const fetchFiles = useCallback(async () => {
    try {
      const data = await getFiles();
      setFiles(data);
      // If successful, we are authenticated
      setIsAuthenticated(true);
    } catch (error: any) {
      // If 401, handled by interceptor (reload), but we can also catch here
      if (error.response?.status !== 401) {
          message.error('无法加载文件列表');
      }
      console.error(error);
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
        try {
            const status = await getAuthStatus();
            if (!status.requiresAuth) {
                setIsAuthenticated(true);
                fetchFiles();
            } else {
                const token = localStorage.getItem('token');
                if (token) {
                    // Validate token by fetching files
                    await fetchFiles();
                    // If fetchFiles fails with 401, interceptor reloads, so we are good.
                    // If fetchFiles succeeds, isAuthenticated set to true in fetchFiles.
                    // However, if fetchFiles fails with other error, we might still be authenticated?
                    // Let's assume if we have token we try.
                    // Actually fetchFiles sets isAuthenticated=true on success.
                    // If it fails, isAuthenticated remains false.
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsCheckingAuth(false);
        }
    };
    initAuth();
  }, [fetchFiles]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Optional: Poll for changes or use WebSocket for real-time sync
    const interval = setInterval(fetchFiles, 5000);
    return () => clearInterval(interval);
  }, [fetchFiles, isAuthenticated]);

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

  if (isCheckingAuth) {
      return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Spin size="large" /></div>;
  }

  if (!isAuthenticated) {
      return <Login onLoginSuccess={() => {
          setIsAuthenticated(true);
          fetchFiles();
      }} />;
  }

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
