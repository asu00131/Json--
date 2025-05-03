
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
  onNodeInteraction: (path: string, value: any, isToggle: boolean) => void; // Updated handler
  searchTerm: string;
  highlightPath?: string;
  expandedPaths: Set<string>; // Directly use the external state
  elementRef: React.RefObject<HTMLDivElement>; // Ref for this specific node element
  nodeElementRefs: React.MutableRefObject<Map<string, React.RefObject<HTMLDivElement>>>; // Map of all node refs
}

const JsonTreeNode: React.FC<JsonTreeNodeProps> = ({
  nodeKey,
  value,
  level,
  path,
  onNodeInteraction, // Use the new handler
  searchTerm,
  highlightPath,
  expandedPaths, // Use the passed set
  elementRef, // Receive the ref
  nodeElementRefs, // Receive the map
}) => {
  const isExpanded = expandedPaths.has(path); // Determine expansion based on the prop
  // Use lodash-es functions for type checking
  const isObjectType = isObject(value);
  const isArrayType = isArray(value);
  const hasChildren = isObjectType && Object.keys(value).length > 0;

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering node click
    if (hasChildren) {
      onNodeInteraction(path, value, true); // Signal a toggle interaction
    }
  };

  const handleNodeClick = () => {
     // Only trigger path update if not clicking the expand/collapse icon area implicitly
     // This logic might need refinement depending on exact desired behavior,
     // but generally, clicking the main body updates the path.
     onNodeInteraction(path, value, false); // Signal a node click (not toggle)
  };

  const safeSearchTerm = searchTerm ? escapeRegExp(searchTerm.toLowerCase()) : '';
  const regex = safeSearchTerm ? new RegExp(`(${safeSearchTerm})`, "gi") : null;

  const highlightText = (text: string): React.ReactNode => {
      if (!regex || !text) return text;
      const stringText = String(text); // Ensure text is a string
      // Check if regex is valid and not empty before splitting
      if (!regex || !safeSearchTerm) return stringText;

      const parts = stringText.split(regex);
      return parts.map((part, index) =>
          regex.test(part) ? ( // Test the part itself against the original regex
              <span key={index} className="bg-yellow-300 dark:bg-yellow-600">
                  {part}
              </span>
          ) : (
              part
          )
      );
  };


  const nodeKeyDisplay = highlightText(nodeKey);
  const valueString = !isObjectType ? JSON.stringify(value) : '';
  const valueDisplay = !isObjectType ? highlightText(valueString) : null;

  const nodeKeyMatches = regex && regex.test(String(nodeKey).toLowerCase()); // Ensure nodeKey is string
  const valueMatches = regex && !isObjectType && value !== null && valueString && regex.test(valueString.toLowerCase());
  const isGeneralMatch = nodeKeyMatches || valueMatches;


  const isCurrentHighlight = path === highlightPath;

  // Determine background color based on highlight and match status
  const getBackgroundColor = () => {
      if (isCurrentHighlight) {
          return "bg-primary/20"; // Highlighted match
      } else if (isGeneralMatch) {
           return "bg-accent/30"; // Other match (not currently focused)
      }
      return ""; // No match or highlight
  };

  // Ensure ref exists for child nodes before rendering them
  const getOrCreateRef = (childPath: string): React.RefObject<HTMLDivElement> => {
    if (!nodeElementRefs.current.has(childPath)) {
      nodeElementRefs.current.set(childPath, React.createRef<HTMLDivElement>());
    }
    return nodeElementRefs.current.get(childPath)!;
  };


  return (
    <div className="font-mono text-sm" data-path={path} ref={elementRef}> {/* Assign ref here */}
     <TooltipProvider delayDuration={100}>
       <Tooltip>
         <TooltipTrigger asChild>
            <div
                className={cn(
                "flex items-center cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5",
                 getBackgroundColor() // Apply background color class
                )}
                style={{ paddingLeft: `${level * 1.5}rem` }}
                onClick={handleNodeClick} // Click on the div triggers path update
            >
                {hasChildren && (
                <button
                    onClick={handleToggleClick} // Click on button triggers toggle
                    className="mr-1 text-muted-foreground hover:text-foreground focus:outline-none flex-shrink-0"
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                    tabIndex={-1} // Ensure button is not focusable by default, handle focus management if needed
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

                {isObjectType ? (
                <span className="text-muted-foreground truncate">
                    {isArrayType ? "[" : "{"}
                    {!isExpanded && Object.keys(value).length > 0 && "..."}
                    {isArrayType ? "]" : "}"}
                    {Object.keys(value).length > 0 && <span className="ml-1 text-xs opacity-80">({Object.keys(value).length} items)</span>}
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
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>


      {isExpanded && hasChildren && (
        <div className="mt-0.5">
          {Object.entries(value).map(([key, childValue], index) => {
            const childPath = isArrayType ? `${path}[${index}]` : (path === '$' ? `$.${key}` : `${path}.${key}`); // Correct index usage for arrays
            const uniqueKey = `${childPath}-${index}`; // Use index for better key stability
            const childRef = getOrCreateRef(childPath); // Get or create ref for child
            return (
              <JsonTreeNode
                key={uniqueKey}
                nodeKey={key}
                value={childValue}
                level={level + 1}
                path={childPath}
                onNodeInteraction={onNodeInteraction} // Pass handler down
                searchTerm={searchTerm}
                highlightPath={highlightPath}
                expandedPaths={expandedPaths} // Pass expanded set down
                elementRef={childRef} // Pass the specific ref for the child
                nodeElementRefs={nodeElementRefs} // Pass the map down
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default JsonTreeNode;

    