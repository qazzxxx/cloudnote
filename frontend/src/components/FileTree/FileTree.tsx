import React from 'react';
import type { FileNode } from '../../api';
import FileTreeNode from './FileTreeNode';
import './FileTree.css';

interface FileTreeProps {
  files: FileNode[];
  expandedKeys: Set<string>;
  selectedPath: string | null;
  onExpand: (key: string) => void;
  onSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode | null) => void;
  onDrop: (dragNodeKey: string, targetNodeKey: string) => void;
  onUpload?: (files: FileList, targetKey: string | null) => void;
  isDarkMode?: boolean;
}

const FileTree: React.FC<FileTreeProps> = ({
  files,
  expandedKeys,
  selectedPath,
  onExpand,
  onSelect,
  onContextMenu,
  onDrop,
  onUpload,
  isDarkMode
}) => {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy'; // Indicates copy (upload)
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only handle external files here (dropping on empty space)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        if (onUpload) {
            onUpload(e.dataTransfer.files, null); // null means root
        }
    }
  };

  return (
    <div 
        className="file-tree-container" 
        onContextMenu={(e) => {
            // If clicked on empty space
            if (e.target === e.currentTarget) {
                onContextMenu(e, null);
            }
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
    >
      {files.map((node) => (
        <FileTreeNode
          key={node.key}
          node={node}
          depth={0}
          expandedKeys={expandedKeys}
          selectedPath={selectedPath}
          onExpand={onExpand}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          onDrop={onDrop}
          onUpload={onUpload ? (files, key) => onUpload(files, key) : undefined}
          isDarkMode={isDarkMode}
        />
      ))}
    </div>
  );
};

export default FileTree;
