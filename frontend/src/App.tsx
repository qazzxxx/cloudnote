import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Layout, message, Input, Spin, Button, theme, ConfigProvider, Drawer, Grid } from 'antd';
import { BulbOutlined, BulbFilled, MenuOutlined } from '@ant-design/icons';
import Sidebar from './components/Sidebar';
import Editor, { type EditorRef } from './components/Editor';
import Login from './components/Login';
import { getFiles, renameFile, getAuthStatus } from './api';
import { StorageService } from './services/StorageService';
import type { FileNode } from './api';
import './App.css';

const { Sider, Content } = Layout;
const { useBreakpoint } = Grid;

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });
  
  // Sidebar state
  const screens = useBreakpoint();
  const [siderVisible, setSiderVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
      // If screens.md is false, it means width < 768px (mobile)
      // screens object is empty on first render sometimes
      const mobile = screens.md === false;
      setIsMobile(mobile);
      if (mobile) {
          setSiderVisible(false);
      } else {
          setSiderVisible(true);
      }
  }, [screens.md]);
  
  const editorRef = useRef<EditorRef>(null);

  const { defaultAlgorithm, darkAlgorithm } = theme;

  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
  };

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

  const handleMoveFile = useCallback(async (oldPath: string, newPath: string) => {
      try {
          // If the moved file is currently open, we need to handle the state
          const isCurrentFile = oldPath === selectedFile;
          
          if (isCurrentFile && editorRef.current) {
              // 1. Force save current content
              await editorRef.current.forceSave();
          } else {
              // If not open, check if we have draft for it and move it too
              await StorageService.moveDraft(oldPath, newPath);
          }
          
          // 2. Refresh files list happens in Sidebar, but we need to update selectedFile if needed
          if (isCurrentFile) {
              setSelectedFile(newPath);
              // Also update filename display
              const name = newPath.split('/').pop() || '';
              setFileName(name.replace(/\.md$/, ''));
          }
      } catch (error) {
          console.error('Error handling move:', error);
      }
  }, [selectedFile]);

  // Handle file select wrapper to close drawer on mobile
  const handleFileSelect = (path: string) => {
      setSelectedFile(path);
      if (isMobile) {
          setSiderVisible(false);
      }
  };

  // Handle Ctrl+S
  useEffect(() => {
      const handleKeyDown = async (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              if (selectedFile && editorRef.current) {
                  await editorRef.current.forceSave();
              }
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
      };
  }, [selectedFile]);

  if (isCheckingAuth) {
      return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Spin size="large" /></div>;
  }

  if (!isAuthenticated) {
      return <Login onLoginSuccess={() => {
          setIsAuthenticated(true);
          fetchFiles();
      }} />;
  }

  const bgStyle = isDarkMode ? { background: '#141414', color: '#fff' } : { background: '#fff', color: '#000' };
  const borderColor = isDarkMode ? 'rgba(253, 253, 253, 0.12)' : 'rgba(5, 5, 5, 0.06)';
  const siderStyle = isDarkMode ? { background: '#1f1f1f', borderRight: `1px solid ${borderColor}` } : { background: '#fcfcfc', borderRight: `1px solid ${borderColor}` };

  return (
    <ConfigProvider
      theme={{
        algorithm: isDarkMode ? darkAlgorithm : defaultAlgorithm,
        token: {
            colorPrimary: '#1890ff',
            colorBgContainer: isDarkMode ? '#1f1f1f' : '#ffffff',
        }
      }}
    >
    <Layout style={{ height: '100vh', ...bgStyle }}>
      <Layout style={bgStyle}>
        {!isMobile && (
            <Sider 
                width={300} 
                theme={isDarkMode ? 'dark' : 'light'} 
                style={siderStyle}
                collapsible
                collapsed={!siderVisible}
                onCollapse={(collapsed) => setSiderVisible(!collapsed)}
                trigger={null}
                collapsedWidth={0}
            >
              <Sidebar 
                files={files} 
                onSelect={handleFileSelect} 
                onRefresh={fetchFiles} 
                isDarkMode={isDarkMode} 
                borderColor={borderColor}
                onMoveFile={handleMoveFile}
              />
            </Sider>
        )}
        
        {isMobile && (
             <Drawer
                placement="left"
                onClose={() => setSiderVisible(false)}
                open={siderVisible}
                width={300}
                bodyStyle={{ padding: 0, background: isDarkMode ? '#1f1f1f' : '#fcfcfc' }}
                headerStyle={{ display: 'none' }} // Hide default header, Sidebar has its own logo
             >
                  <Sidebar 
                    files={files} 
                    onSelect={handleFileSelect} 
                    onRefresh={fetchFiles} 
                    isDarkMode={isDarkMode} 
                    borderColor={borderColor}
                    onMoveFile={handleMoveFile}
                  />
             </Drawer>
        )}

        <Content style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', ...bgStyle }}>
          {selectedFile && (
              <div style={{ 
                  height: '64px',
                  padding: '0 20px', 
                  borderBottom: `1px solid ${borderColor}`, 
                  flexShrink: 0, 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  background: isDarkMode ? '#1f1f1f' : '#fff' // Match header bg
              }}>
                  <Button
                    type="text"
                    icon={<MenuOutlined />}
                    onClick={() => setSiderVisible(!siderVisible)}
                    style={{ marginRight: 12 }}
                  />
                  {/* Key prop ensures input re-mounts when fileName changes externally (like on delete) */}
                  <Input 
                    key={selectedFile}
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    onBlur={handleTitleChange}
                    onPressEnter={(e) => {
                        (e.target as HTMLInputElement).blur();
                    }}
                    variant="borderless"
                    style={{ fontSize: '20px', fontWeight: 'bold', padding: 0, flex: 1, minWidth: 0, color: isDarkMode ? '#fff' : '#000' }}
                  />
                  <Button 
                    type="text" 
                    icon={isDarkMode ? <BulbFilled style={{ color: '#FFC857' }} /> : <BulbOutlined />} 
                    onClick={toggleTheme}
                    style={{ marginLeft: '10px' }}
                  />
              </div>
          )}
          {!selectedFile && (
             <div style={{ position: 'absolute', top: 20, right: 20 }}>
                <Button
                    type="text"
                    icon={<MenuOutlined />}
                    onClick={() => setSiderVisible(!siderVisible)}
                    style={{ marginRight: 12 }}
                />
                <Button 
                    type="text" 
                    icon={isDarkMode ? <BulbFilled style={{ color: '#FFC857' }} /> : <BulbOutlined />} 
                    onClick={toggleTheme}
                />
             </div>
          )}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Editor ref={editorRef} filePath={selectedFile} isDarkMode={isDarkMode} />
          </div>
        </Content>
      </Layout>
    </Layout>
    </ConfigProvider>
  );
};

export default App;
