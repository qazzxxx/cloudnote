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
  isDarkMode
}) => {
  return (
    <div 
        className="file-tree-container" 
        onContextMenu={(e) => {
            // If clicked on empty space
            if (e.target === e.currentTarget) {
                onContextMenu(e, null);
            }
        }}
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
          isDarkMode={isDarkMode}
        />
      ))}
    </div>
  );
};

export default FileTree;
