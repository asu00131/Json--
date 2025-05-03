"use client";

import * as React from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { escapeRegExp } from 'lodash-es';

interface JsonTreeNodeProps {
  nodeKey: string;
  value: any;
  level: number;
  path: string;
  onNodeClick: (path: string, value: any) => void;
  searchTerm: string;
  highlightPath?: string; // Path of the currently selected search result
  expandedPaths: Set<string>; // Set of paths that should be expanded
}

const JsonTreeNode: React.FC<JsonTreeNodeProps> = ({
  nodeKey,
  value,
  level,
  path,
  onNodeClick,
  searchTerm,
  highlightPath,
  expandedPaths,
}) => {
  const isInitiallyExpanded = expandedPaths.has(path);
  const [isExpanded, setIsExpanded] = React.useState(isInitiallyExpanded);
  const isObject = typeof value === "object" && value !== null;
  const isArray = Array.isArray(value);
  const hasChildren = isObject && Object.keys(value).length > 0;

  // Update expansion state if expandedPaths changes externally (e.g., search navigation)
   React.useEffect(() => {
       const shouldBeExpanded = expandedPaths.has(path);
       if (shouldBeExpanded !== isExpanded) {
           setIsExpanded(shouldBeExpanded);
       }
       // Keep isInitiallyExpanded in dependencies to handle initial expansion correctly if path changes
   }, [expandedPaths, path, isExpanded, isInitiallyExpanded]);


  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onNodeClick
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleNodeClick = () => {
    onNodeClick(path, value);
  };

  const safeSearchTerm = searchTerm ? escapeRegExp(searchTerm.toLowerCase()) : '';
  const regex = safeSearchTerm ? new RegExp(`(${safeSearchTerm})`, "gi") : null;

  const highlightText = (text: string): React.ReactNode => {
      if (!regex || !text) return text;
      // Ensure text is a string before splitting
      const stringText = String(text);
      const parts = stringText.split(regex);
      return parts.map((part, index) =>
          regex.test(part) ? (
              <span key={index} className="bg-yellow-300 dark:bg-yellow-600">
                  {part}
              </span>
          ) : (
              part
          )
      );
  };


  const nodeKeyDisplay = highlightText(nodeKey);
  const valueString = !isObject ? JSON.stringify(value) : '';
  const valueDisplay = !isObject ? highlightText(valueString) : null;

  // Determine if the node itself should be highlighted based on search term
  const nodeKeyMatches = regex && regex.test(nodeKey.toLowerCase());
  // Ensure valueString is checked only if it exists and regex is not null
  const valueMatches = regex && !isObject && value !== null && valueString && regex.test(valueString.toLowerCase());
  const isGeneralMatch = nodeKeyMatches || valueMatches;


  // Determine if this node is the specifically highlighted search result
  const isCurrentHighlight = path === highlightPath;

  // Determine background color based on match type
  const getBackgroundColor = () => {
    if (isCurrentHighlight) return "bg-primary/20"; // Specific highlight for current match
    if (isGeneralMatch && !isCurrentHighlight) return "bg-accent/30"; // General highlight for other matches
    return ""; // No highlight
  };

  return (
    <div className="font-mono text-sm" data-path={path}> {/* Add data-path for targeting */}
     <TooltipProvider delayDuration={100}>
       <Tooltip>
         <TooltipTrigger asChild>
            <div
                className={cn(
                "flex items-center cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5",
                 getBackgroundColor()
                )}
                style={{ paddingLeft: `${level * 1.5}rem` }}
                onClick={handleNodeClick}
            >
                {hasChildren && (
                <button
                    onClick={toggleExpand}
                    className="mr-1 text-muted-foreground hover:text-foreground focus:outline-none flex-shrink-0"
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                    tabIndex={-1} // Prevent button from being focusable via tab
                >
                    {isExpanded ? (
                    <ChevronDown size={16} />
                    ) : (
                    <ChevronRight size={16} />
                    )}
                </button>
                )}
                {!hasChildren && <span className="w-[1.25rem] mr-1 flex-shrink-0"></span>} {/* Placeholder for alignment */}

                <span className="text-foreground font-semibold mr-1 truncate">{nodeKeyDisplay}:</span>

                {isObject ? (
                <span className="text-muted-foreground truncate">
                    {isArray ? "[" : "{"}
                    {!isExpanded && Object.keys(value).length > 0 && "..."}
                    {isArray ? "]" : "}"}
                    <span className="ml-1 text-xs opacity-80">({Object.keys(value).length} items)</span>
                </span>
                ) : (
                <span
                    className={cn(
                    "truncate", // Add truncate to value span as well
                    typeof value === "string" ? "text-green-700 dark:text-green-400" :
                    typeof value === "number" ? "text-blue-700 dark:text-blue-400" :
                    typeof value === "boolean" ? "text-purple-700 dark:text-purple-400" :
                    value === null ? "text-gray-500" : ""
                    )}
                >
                    {valueDisplay}
                </span>
                )}
            </div>
           </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
                <p>Path: {path}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>


      {isExpanded && hasChildren && (
        <div className="mt-0.5"> {/* Reduced margin slightly */}
          {Object.entries(value).map(([key, childValue], index) => { // Added index for unique key generation
            const childPath = isArray ? `${path}[${key}]` : (path === '$' ? `$.${key}` : `${path}.${key}`);
             // Use a combination of path and index for a more robust unique key
             const uniqueKey = `${childPath}-${index}`;
            return (
              <JsonTreeNode
                key={uniqueKey} // Use uniqueKey for React list rendering
                nodeKey={key}
                value={childValue}
                level={level + 1}
                path={childPath}
                onNodeClick={onNodeClick}
                searchTerm={searchTerm}
                highlightPath={highlightPath}
                expandedPaths={expandedPaths}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default JsonTreeNode;