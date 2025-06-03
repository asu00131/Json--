
"use client";

import * as React from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { escapeRegExp, isObject, isArray } from 'lodash-es'; // Import isObject and isArray

interface JsonTreeNodeProps {
  nodeKey: string;
  value: any;
  level: number;
  path: string;
  onNodeInteraction: (path: string, value: any, isToggle: boolean) => void;
  searchTerm: string;
  highlightPath?: string;
  expandedPaths: Set<string>;
  getElementRef: (path: string) => React.RefObject<HTMLDivElement>; // Function to get ref
}

const JsonTreeNode: React.FC<JsonTreeNodeProps> = ({
  nodeKey,
  value,
  level,
  path,
  onNodeInteraction,
  searchTerm,
  highlightPath,
  expandedPaths,
  getElementRef, // Use the passed function
}) => {
  const elementRef = getElementRef(path); // Get the ref for this node

  const isExpanded = expandedPaths.has(path);
  const isObjectType = isObject(value); // true for objects and arrays if not using lodash's isPlainObject
  const isArrayType = isArray(value);
  const hasChildren = (isObjectType && Object.keys(value).length > 0) || (isArrayType && value.length > 0);


  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      onNodeInteraction(path, value, true);
    }
  };

  const handleNodeClick = () => {
     onNodeInteraction(path, value, false);
  };

  const safeSearchTerm = searchTerm ? escapeRegExp(searchTerm.toLowerCase()) : '';
  const regex = safeSearchTerm ? new RegExp(`(${safeSearchTerm})`, "gi") : null;

  const highlightText = (text: string): React.ReactNode => {
      if (!regex || !text) return text;
      const stringText = String(text);
      if (!safeSearchTerm) return stringText;

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
  // For value display, only stringify if it's not an object/array (primitives, null)
  const valueString = !isObjectType && !isArrayType ? JSON.stringify(value) : '';
  const valueDisplay = !isObjectType && !isArrayType ? highlightText(valueString) : null;


  const nodeKeyMatches = regex && regex.test(String(nodeKey).toLowerCase());
  // Ensure valueString is not empty for matching, and that value is not an object/array
  const valueMatches = regex && !isObjectType && !isArrayType && value !== null && valueString && regex.test(valueString.toLowerCase());
  const isGeneralMatch = nodeKeyMatches || valueMatches;


  const isCurrentHighlight = path === highlightPath;

  const getBackgroundColor = () => {
      if (isCurrentHighlight) {
          return "bg-primary/20";
      } else if (isGeneralMatch && searchTerm) { // Only apply accent if there's an active search term
           return "bg-accent/30";
      }
      return "";
  };


  return (
    <div className="font-mono text-sm" data-path={path} ref={elementRef}>
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
                    onClick={handleToggleClick}
                    className="mr-1 text-muted-foreground hover:text-foreground focus:outline-none flex-shrink-0"
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                    tabIndex={-1}
                >
                    {isExpanded ? (
                    <ChevronDown size={16} />
                    ) : (
                    <ChevronRight size={16} />
                    )}
                </button>
                )}
                {!hasChildren && <span className="w-[1.25rem] mr-1 flex-shrink-0"></span>}

                <span className="text-foreground font-semibold mr-1 truncate">{nodeKeyDisplay}:</span>

                {isObjectType || isArrayType ? ( // Check both object and array for brackets
                <span className="text-muted-foreground truncate">
                    {isArrayType ? "[" : "{"}
                    {!isExpanded && hasChildren && "..."}
                    {isArrayType ? "]" : "}"}
                    {hasChildren && <span className="ml-1 text-xs opacity-80">({isArrayType ? value.length : Object.keys(value).length} items)</span>}
                </span>
                ) : (
                <span
                    className={cn(
                    "truncate",
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
                 {/* Display value in tooltip only for non-objects/arrays, or show type for complex */}
                {!(isObjectType || isArrayType) && value !== null ? (
                    <p>Value: {JSON.stringify(value)}</p>
                ) : isArrayType ? (
                    <p>Type: Array</p>
                ) : isObjectType ? (
                    <p>Type: Object</p>
                ) : null }
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>


      {isExpanded && hasChildren && (
        <div className="mt-0.5">
          {(isArrayType ? value : Object.entries(value)).map((entryOrItem: any, indexOrKey: any) => {
            let key: string;
            let childValue: any;
            let actualIndex: number | string; // Used for path construction

            if (isArrayType) {
                key = String(indexOrKey); // indexOrKey is the index here
                childValue = entryOrItem;   // entryOrItem is the item itself
                actualIndex = indexOrKey;
            } else {
                // For objects, entryOrItem is [key, value] pair, indexOrKey is the numeric index of the entry in Object.entries
                key = entryOrItem[0];
                childValue = entryOrItem[1];
                actualIndex = key; // Use actual key for object path
            }

            const childPath = isArrayType ? `${path}[${actualIndex}]` : (path === '$' ? `$.${actualIndex}` : `${path}.${actualIndex}`);
            const uniqueReactKey = `${childPath}-${(typeof actualIndex === 'number' ? actualIndex : key)}`; // Ensure unique key for React

            return (
              <JsonTreeNode
                key={uniqueReactKey}
                nodeKey={key}
                value={childValue}
                level={level + 1}
                path={childPath}
                onNodeInteraction={onNodeInteraction}
                searchTerm={searchTerm}
                highlightPath={highlightPath}
                expandedPaths={expandedPaths}
                getElementRef={getElementRef} // Pass function down
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

// No React.memo here, let the parent handle memoization of this component if needed.
// Using React.memo here without a custom comparator can be tricky with complex props like `value` or `getElementRef`.
export default JsonTreeNode;
