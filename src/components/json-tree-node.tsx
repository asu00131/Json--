"use client";

import * as React from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface JsonTreeNodeProps {
  nodeKey: string;
  value: any;
  level: number;
  path: string;
  onNodeClick: (path: string, value: any) => void;
  searchTerm: string;
  isInitiallyExpanded?: boolean;
}

const JsonTreeNode: React.FC<JsonTreeNodeProps> = ({
  nodeKey,
  value,
  level,
  path,
  onNodeClick,
  searchTerm,
  isInitiallyExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(isInitiallyExpanded || level < 1); // Expand root level by default
  const isObject = typeof value === "object" && value !== null;
  const isArray = Array.isArray(value);
  const hasChildren = isObject && Object.keys(value).length > 0;

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onNodeClick
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleNodeClick = () => {
    onNodeClick(path, value);
  };

  const highlightText = (text: string) => {
    if (!searchTerm) return text;
    const regex = new RegExp(`(${searchTerm})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, index) =>
      regex.test(part) ? (
        <span key={index} className="bg-yellow-300">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  const nodeKeyDisplay = highlightText(nodeKey);
  const valueDisplay = !isObject ? highlightText(JSON.stringify(value)) : null;

  const nodeKeyMatches = searchTerm && nodeKey.toLowerCase().includes(searchTerm.toLowerCase());
  const valueMatches = searchTerm && !isObject && JSON.stringify(value).toLowerCase().includes(searchTerm.toLowerCase());

  return (
    <div className="font-mono text-sm">
      <div
        className={cn(
          "flex items-center cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5",
          (nodeKeyMatches || valueMatches) && "bg-accent/30"
        )}
        style={{ paddingLeft: `${level * 1.5}rem` }}
        onClick={handleNodeClick}
      >
        {hasChildren && (
          <button
            onClick={toggleExpand}
            className="mr-1 text-muted-foreground hover:text-foreground focus:outline-none"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
          </button>
        )}
        {!hasChildren && <span className="w-5 mr-1"></span>} {/* Placeholder for alignment */}
        <span className="text-foreground font-semibold mr-1">{nodeKeyDisplay}:</span>
        {isObject ? (
          <span className="text-muted-foreground">
            {isArray ? "[" : "{"}
            {!isExpanded && Object.keys(value).length > 0 && "..."}
            {isArray ? "]" : "}"}
            <span className="ml-1 text-xs">({Object.keys(value).length} items)</span>
          </span>
        ) : (
          <span
            className={cn(
              typeof value === "string" ? "text-green-700" :
              typeof value === "number" ? "text-blue-700" :
              typeof value === "boolean" ? "text-purple-700" :
              value === null ? "text-gray-500" : ""
            )}
          >
            {valueDisplay}
          </span>
        )}
      </div>
      {isExpanded && hasChildren && (
        <div className="mt-1">
          {Object.entries(value).map(([key, childValue], index) => {
            const childPath = isArray ? `${path}[${key}]` : `${path}.${key}`;
            return (
              <JsonTreeNode
                key={key}
                nodeKey={key}
                value={childValue}
                level={level + 1}
                path={childPath}
                onNodeClick={onNodeClick}
                searchTerm={searchTerm}
                // isInitiallyExpanded={level < 1} // Expand children of the root level
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default JsonTreeNode;
