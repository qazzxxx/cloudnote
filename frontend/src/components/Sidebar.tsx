import React, { useState, useRef, useEffect } from 'react';
import { Dropdown, Modal, Input, message } from 'antd';
import type { InputRef, MenuProps } from 'antd';
import { createFile, deleteFile, renameFile, moveFile, updateFile } from '../api';
import type { FileNode } from '../api';
import FileTree from './FileTree/FileTree';

interface SidebarProps {
  files: FileNode[];
  onSelect: (path: string) => void;
  onRefresh: () => void;
  isDarkMode?: boolean;
  borderColor?: string;
  onMoveFile?: (oldPath: string, newPath: string) => Promise<void>;
}

const Sidebar: React.FC<SidebarProps> = ({ files, onSelect, onRefresh, isDarkMode, borderColor, onMoveFile }) => {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Context Menu State
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'createFile' | 'createFolder' | 'rename'>('createFile');
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<InputRef>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (modalVisible) {
      // Small timeout to ensure modal animation is done or input is mounted
      setTimeout(() => {
        inputRef.current?.focus({
          cursor: 'end',
        });
      }, 100);
    }
  }, [modalVisible]);

  const onExpand = (key: string) => {
    const newExpandedKeys = new Set(expandedKeys);
    if (newExpandedKeys.has(key)) {
      newExpandedKeys.delete(key);
    } else {
      newExpandedKeys.add(key);
    }
    setExpandedKeys(newExpandedKeys);
  };

  const handleSelect = (path: string) => {
    setSelectedPath(path);
    onSelect(path);
  };

  const onContextMenu = (e: React.MouseEvent, node: FileNode | null) => {
    e.preventDefault();
    setSelectedNode(node);
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuVisible(true);
  };

  const onDrop = async (dragKey: string, dropKey: string) => {
    if (dragKey === dropKey) return;

    // Determine target path
    // If dropping on a folder, move into it
    // If dropping on a file, we need to know if we are moving into its parent or what.
    // In our simplified FileTree component, we only trigger onDrop when dropping ON a node.
    // Let's assume dropping on a file means doing nothing or moving to its parent?
    // Usually file trees allow dropping on folder.
    // For files, we might need more complex logic (dropping between items).
    // For now, let's implement dropping ON folder = move into.

    // We need to find the drop node to check if it's a folder.
    // But we only have keys. We can infer from key or need to pass node.
    // The FileTree passes keys. Let's traverse to find node or just assume logic.
    // Actually, backend move handles the path.

    // If dropKey is a file, maybe we shouldn't allow dropping on it?
    // Or maybe we treat it as dropping into its parent?
    // Let's iterate files to find the node type? Or just try.

    // Better: check if dropKey ends with .md (file)
    let targetParentPath = dropKey;
    if (dropKey.endsWith('.md')) {
      // It's a file, so target parent is its directory
      const lastSlash = dropKey.lastIndexOf('/');
      targetParentPath = lastSlash > -1 ? dropKey.substring(0, lastSlash) : '';
    }

    // If dragging a file to its own parent, do nothing
    const dragFileName = dragKey.split('/').pop();
    const dragParentPath = dragKey.substring(0, dragKey.lastIndexOf('/'));

    // Normalize empty string for root
    const normalizedTargetParent = targetParentPath === '' ? '' : targetParentPath;
    const normalizedDragParent = dragParentPath === '' ? '' : dragParentPath;

    if (normalizedTargetParent === normalizedDragParent) return;

    // Handle case where dragging folder into itself or its children
    if (!dropKey.endsWith('.md') && (targetParentPath === dragKey || targetParentPath.startsWith(dragKey + '/'))) {
      return;
    }

    const newPath = targetParentPath ? `${targetParentPath}/${dragFileName}` : dragFileName;

    try {
      // Pre-move hook to handle save state
      if (onMoveFile) {
        await onMoveFile(dragKey, newPath as string);
      }

      await moveFile(dragKey, newPath as string);
      message.success('移动成功');
      onRefresh();
      // Expand the target folder if it was a folder drop
      if (!dropKey.endsWith('.md')) {
        const newExpanded = new Set(expandedKeys);
        newExpanded.add(dropKey);
        setExpandedKeys(newExpanded);
      }
    } catch (e: any) {
      // Suppress destination exists error since we are moving
      if (e.response?.data?.error === 'Destination already exists') {
        // If destination exists, maybe we can ignore it or show error.
        // But the user issue is "creates a new identical file".
        // This suggests that onDrop is called multiple times or logic is flawed.
        // Let's debounce or prevent multi-calls.
        message.error('目标位置已存在同名文件');
      } else {
        message.error('移动失败');
      }
    }
  };

  const handleFileUpload = async (files: FileList, targetKey: string | null) => {
    // Determine target directory
    let targetDir = '';
    if (targetKey) {
        if (targetKey.endsWith('.md')) {
             // If dropping on a file, upload to its parent directory
             const lastSlash = targetKey.lastIndexOf('/');
             targetDir = lastSlash > -1 ? targetKey.substring(0, lastSlash) : '';
        } else {
             // Dropping on a folder
             targetDir = targetKey;
        }
    }
    // If targetKey is null, targetDir is '' (root)

    const fileArray = Array.from(files);
    let successCount = 0;
    let lastUploadedPath = '';

    for (const file of fileArray) {
        if (!file.name.endsWith('.md')) {
            message.warning(`跳过非Markdown文件: ${file.name}`);
            continue;
        }

        try {
            const content = await file.text();
            const newPath = targetDir ? `${targetDir}/${file.name}` : file.name;
            
            // Create file (might fail if exists, but we can try to update or overwrite)
            // Ideally we should check existence or handle error
            try {
                await createFile(newPath, 'file');
            } catch (e: any) {
                if (e.response?.data?.error === 'File already exists') {
                    // It exists, we will overwrite it with updateFile
                } else {
                    throw e;
                }
            }
            
            // Write content
            await updateFile(newPath, content);
            successCount++;
            lastUploadedPath = newPath;
        } catch (e) {
            console.error(`上传失败: ${file.name}`, e);
            message.error(`上传失败: ${file.name}`);
        }
    }

    if (successCount > 0) {
        message.success(`成功上传 ${successCount} 个文件`);
        onRefresh();
        
        // Select the last uploaded file
        if (lastUploadedPath) {
            setSelectedPath(lastUploadedPath);
            onSelect(lastUploadedPath);
        }
    }
  };

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    setContextMenuVisible(false);

    if (key === 'delete') {
      if (!selectedNode) return;
      Modal.confirm({
        title: '确认删除',
        content: `确定要删除 ${selectedNode.title} 吗？`,
        okText: '确认',
        cancelText: '取消',
        onOk: async () => {
          try {
            await deleteFile(selectedNode.key);
            message.success('删除成功');
            // If the deleted file was selected, clear selection
            if (selectedPath === selectedNode.key) {
                onSelect(''); // Tell parent to clear selection
            }
            onRefresh();
          } catch (e) {
            message.error('删除失败');
          }
        }
      });
    } else if (key === 'rename') {
      if (!selectedNode) return;
      setModalType('rename');
      // Remove .md extension for display if it's a file
      setInputValue(selectedNode.isLeaf ? selectedNode.title.replace(/\.md$/, '') : selectedNode.title);
      setModalVisible(true);
    } else if (key === 'newFile') {
      setModalType('createFile');
      setInputValue('');
      setModalVisible(true);
    } else if (key === 'newFolder') {
      setModalType('createFolder');
      setInputValue('');
      setModalVisible(true);
    }
  };

  const handleModalOk = async () => {
    if (!inputValue) return;

    try {
      if (modalType === 'rename' && selectedNode) {
        const parentPath = selectedNode.key.substring(0, selectedNode.key.lastIndexOf('/'));
        // If it's a file, we need to append .md back
        const finalName = selectedNode.isLeaf ? `${inputValue}.md` : inputValue;
        const newPath = parentPath ? `${parentPath}/${finalName}` : finalName;
        await renameFile(selectedNode.key, newPath);
      } else if (modalType === 'createFile') {
        let parentPath = '';
        if (selectedNode) {
          // If selected is file, create in its parent. If folder, create inside.
          parentPath = selectedNode.isLeaf
            ? selectedNode.key.substring(0, selectedNode.key.lastIndexOf('/'))
            : selectedNode.key;
        }
        const newPath = parentPath ? `${parentPath}/${inputValue}.md` : `${inputValue}.md`;
        await createFile(newPath, 'file');
        setSelectedPath(newPath);
        onSelect(newPath);
      } else if (modalType === 'createFolder') {
        let parentPath = '';
        if (selectedNode) {
          parentPath = selectedNode.isLeaf
            ? selectedNode.key.substring(0, selectedNode.key.lastIndexOf('/'))
            : selectedNode.key;
        }
        const newPath = parentPath ? `${parentPath}/${inputValue}` : inputValue;
        await createFile(newPath, 'folder');
      }
      message.success('操作成功');
      setModalVisible(false);
      onRefresh();
    } catch (e) {
      message.error('操作失败: ' + (e as Error).message);
    }
  };

  const menuItems: MenuProps['items'] = [
    { key: 'newFile', label: '新建笔记' },
    { key: 'newFolder', label: '新建文件夹' },
    { type: 'divider' },
    { key: 'rename', label: '重命名', disabled: !selectedNode },
    { key: 'delete', label: '删除', danger: true, disabled: !selectedNode },
  ];

  const handleRootDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only handle file drops
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files, null);
    }
  };

  return (
    <div 
        style={{ display: 'flex', flexDirection: 'column', height: '100%', background: isDarkMode ? '#1f1f1f' : '#fcfcfc', color: isDarkMode ? '#fff' : 'inherit' }}
        onDragOver={handleRootDragOver}
        onDrop={handleRootDrop}
    >
      <div className="sidebar-logo" style={{
        height: '64px',
        padding: '0 20px',
        fontSize: '16px',
        fontWeight: '600',
        color: isDarkMode ? '#fff' : '#333',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        borderBottom: borderColor ? `1px solid ${borderColor}` : (isDarkMode ? '1px solid #424242' : '1px solid rgba(0,0,0,0.06)'),
        overflow: 'hidden',
        whiteSpace: 'nowrap'
      }}>
        <img src="/logo.svg" alt="Logo" style={{ width: '32px', height: '32px', flexShrink: 0 }} />
        <span style={{ letterSpacing: '0.5px', overflow: 'hidden', textOverflow: 'ellipsis' }}>云简 - 墨染云间，书尽简意</span>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <FileTree
          files={files}
          expandedKeys={expandedKeys}
          selectedPath={selectedPath}
          onExpand={onExpand}
          onSelect={handleSelect}
          onContextMenu={onContextMenu}
          onDrop={onDrop}
          onUpload={handleFileUpload}
          isDarkMode={isDarkMode}
        />
      </div>

      <Dropdown
        menu={{ items: menuItems, onClick: handleMenuClick }}
        trigger={['contextMenu']}
        open={contextMenuVisible}
        onOpenChange={setContextMenuVisible}
        overlayStyle={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
      >
        <div style={{ display: 'none' }}></div>
      </Dropdown>

      <Modal
        title={modalType === 'rename' ? '重命名' : (modalType === 'createFile' ? '新建笔记' : '新建文件夹')}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        okText="确定"
        cancelText="取消"
        destroyOnClose
        centered
      >
        <div style={{ paddingTop: '12px' }}>
            <Input 
                ref={inputRef}
                value={inputValue} 
                onChange={(e) => setInputValue(e.target.value)}  
                addonAfter={(modalType === 'createFile' || (modalType === 'rename' && selectedNode?.isLeaf)) ? '.md' : ''}
                onPressEnter={handleModalOk}
                placeholder={modalType === 'createFile' ? '请输入笔记名称' : (modalType === 'createFolder' ? '请输入文件夹名称' : '请输入新名称')}
                autoFocus
            />
        </div>
      </Modal>
    </div>
  );
};

export default Sidebar;
