import React from 'react';
import { FileMarkdownOutlined, FolderFilled, FolderOpenFilled } from '@ant-design/icons';
import type { FileNode } from '../../api';

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  expandedKeys: Set<string>;
  selectedPath: string | null;
  onExpand: (key: string) => void;
  onSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onDrop: (dragNodeKey: string, targetNodeKey: string) => void;
  isDarkMode?: boolean;
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  node,
  depth,
  expandedKeys,
  selectedPath,
  onExpand,
  onSelect,
  onContextMenu,
  onDrop,
  isDarkMode
}) => {
  const isExpanded = expandedKeys.has(node.key);
  const isSelected = selectedPath === node.key;

  const handleDragStart = (e: React.DragEvent) => {
    // Do NOT set text/plain to avoid rich text editors (like BlockNote) capturing it as text insertion
    // e.dataTransfer.setData('text/plain', node.key); 
    e.dataTransfer.setData('application/x-cloudnote-file', JSON.stringify(node));
    e.dataTransfer.effectAllowed = 'all';
    // Add a custom drag image or styling if needed
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent bubbling
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    // Check if it's our custom file drag
    const cloudNoteData = e.dataTransfer.getData('application/x-cloudnote-file');
    if (cloudNoteData) {
        try {
            const dragNode = JSON.parse(cloudNoteData);
            const dragKey = dragNode.key;
            if (dragKey && dragKey !== node.key) {
                onDrop(dragKey, node.key);
            }
        } catch (err) {
            console.error('Failed to parse drag data', err);
        }
    }
    // If no custom data, it might be external file or something else, ignore it here
  };

  return (
    <div>
      <div
        className={`file-tree-node ${isSelected ? 'selected' : ''} ${isDarkMode ? 'dark-mode' : ''}`}
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
        onClick={() => {
          if (!node.isLeaf) {
            onExpand(node.key);
          } else {
            onSelect(node.key);
          }
        }}
        onContextMenu={(e) => onContextMenu(e, node)}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="file-tree-icon">
          {node.isLeaf ? (
            <FileMarkdownOutlined style={{ color: '#1890ff' }} />
          ) : (
            isExpanded ? <FolderOpenFilled style={{ color: '#FFC857' }} /> : <FolderFilled style={{ color: '#FFD666' }} />
          )}
        </span>
        <span className="file-tree-title">{node.title.replace(/\.md$/, '')}</span>
      </div>
      {node.children && isExpanded && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.key}
              node={child}
              depth={depth + 1}
              expandedKeys={expandedKeys}
              selectedPath={selectedPath}
              onExpand={onExpand}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              onDrop={onDrop}
              isDarkMode={isDarkMode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default FileTreeNode;
