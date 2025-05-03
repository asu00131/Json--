
"use client";

import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ClipboardCopy, Search, Rows, Pencil, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import JsonTreeNode from "./json-tree-node";
import { isObject, isArray, escapeRegExp } from 'lodash-es';

type ViewMode = "tree" | "edit";

// Example JSON for initial state
const exampleJson = `{
  "name": "JSON Explorer",
  "version": "1.0.0",
  "description": "A tool to explore JSON data, including nested objects and arrays.",
  "author": "AI",
  "features": [
    "JSON Input",
    "Tree View",
    "Path Preview",
    "Search with Highlighting",
    "Result Navigation",
    "Expand/Collapse All"
  ],
  "settings": {
    "theme": "light",
    "fontSize": 14,
    "isValid": true,
    "nested": {
      "level1": {
        "level2": {
          "value": null,
          "anotherValue": "Search Me"
        }
      }
    },
    "emptyArray": [],
    "arrayOfObjects": [
      { "id": 1, "name": "Item 1" },
      { "id": 2, "name": "Item 2 - Search Me" }
    ]
  }
}`;


// Helper function for recursive evaluation of path segments
function evaluatePathSegments(data: any, segments: string[]): any {
    let currentData = data;

    for (let i = 0; i < segments.length; i++) {
        if (currentData === undefined || currentData === null) {
            return undefined;
        }

        const segment = segments[i];

        if (segment.endsWith('[*]')) {
            const arrayKey = segment.substring(0, segment.length - 3);
            const targetArray = isObject(currentData) ? currentData[arrayKey] : undefined;

            if (!isArray(targetArray)) {
                 // If it's not an array, but we have more segments, it's an error or undefined
                 return segments.length -1 > i ? undefined : `Error: Path segment "${arrayKey}" does not resolve to an array at ${segments.slice(0, i + 1).join('.')}`;
            }

            // Remaining segments to apply to each array element
            const remainingSegments = segments.slice(i + 1);

            // If no more segments, return the whole array
            if (remainingSegments.length === 0) {
                return targetArray;
            }

            // Apply remaining segments to each element and collect results
            const results = targetArray.map(item => evaluatePathSegments(item, remainingSegments));

             // Filter out undefined results if not all elements match the subsequent path
            const validResults = results.filter(res => res !== undefined);

            // If no valid results found after applying sub-path, return undefined
             // Otherwise, return the array of valid results
            return validResults.length > 0 ? validResults : undefined;


        } else if (segment.includes('[')) { // Handle specific array index like [0]
             const match = segment.match(/^(.+)\[(\d+)]$/);
             if (match) {
                 const arrayKey = match[1];
                 const index = parseInt(match[2], 10);
                 const targetArray = isObject(currentData) ? currentData[arrayKey] : undefined;
                 if (!isArray(targetArray) || index >= targetArray.length) {
                     return undefined; // Array not found or index out of bounds
                 }
                 currentData = targetArray[index];
             } else if (segment.match(/^\[(\d+)]$/)) { // Handle root array index like [0]
                  const indexMatch = segment.match(/^\[(\d+)]$/);
                   if (indexMatch && isArray(currentData)) {
                       const index = parseInt(indexMatch[1], 10);
                       if (index >= currentData.length) {
                           return undefined; // Index out of bounds
                       }
                       currentData = currentData[index];
                   } else {
                     return undefined; // Invalid format or not an array
                   }
             } else {
                return undefined; // Invalid array access format
            }

        } else { // Handle object property access
            if (!isObject(currentData) || !(segment in currentData)) {
                return undefined;
            }
            currentData = currentData[segment];
        }
    }

    return currentData;
}


// Custom function to evaluate JSON path with wildcard support
const evaluateJsonPath = (data: any, path: string): any => {
    if (path === '$') {
        return data;
    }

    let adjustedPath = path;
     // Normalize path: remove leading '$.' or '$['
     if (adjustedPath.startsWith('$.')) {
        adjustedPath = adjustedPath.substring(2);
    } else if (adjustedPath.startsWith('$[')) {
         // Keep the brackets for root array access like $[0]
         adjustedPath = adjustedPath.substring(1);
    } else if (adjustedPath.startsWith('$')) {
         // Should not happen with valid paths, but handle just in case
         return undefined;
     }


    // Split path carefully, handling array indices within brackets
    const segments: string[] = [];
    let currentSegment = '';
    let inBrackets = false;
    let bracketContent = '';

    for (let i = 0; i < adjustedPath.length; i++) {
        const char = adjustedPath[i];

        if (char === '.' && !inBrackets) {
            if (currentSegment) segments.push(currentSegment);
            currentSegment = '';
        } else if (char === '[' && !inBrackets) {
             if (currentSegment) {
                 // This segment part before the bracket is the key/property name
                 segments.push(currentSegment);
                 currentSegment = ''; // Reset for the bracket part
             }
             inBrackets = true;
             bracketContent = '['; // Start collecting bracket content
        } else if (char === ']' && inBrackets) {
             bracketContent += ']';
             inBrackets = false;
              // Check if the previous segment exists and append bracket content, or push as new segment
             if (segments.length > 0 && !segments[segments.length - 1].includes('[')) {
                 // Append bracket to the last property segment if it makes sense
                 // e.g., 'arrayOfObjects' + '[*]' becomes 'arrayOfObjects[*]'
                 // Need to be careful not to merge if it's root access like [0]
                  if (adjustedPath.startsWith(segments[segments.length - 1] + bracketContent)) {
                     segments[segments.length - 1] += bracketContent;
                 } else {
                     segments.push(bracketContent); // Push as separate segment, e.g., for root array $[0]
                 }

             } else {
                  segments.push(bracketContent); // Push as separate segment, e.g., for root array $[0]
             }

             bracketContent = ''; // Reset bracket content
        } else if (inBrackets) {
            bracketContent += char;
        } else {
            currentSegment += char;
        }
    }

     // Add the last segment if any
    if (currentSegment) {
        segments.push(currentSegment);
    }

    return evaluatePathSegments(data, segments);
};


// Helper function to find all matching paths in the JSON data
const findMatches = (value: any, searchTerm: string, currentPath: string, results: { path: string; elementRef: React.RefObject<HTMLDivElement> }[], elementRefs: React.MutableRefObject<Map<string, React.RefObject<HTMLDivElement>>>): void => {
    if (!searchTerm) return;

    const safeSearchTerm = escapeRegExp(searchTerm.toLowerCase());
    const regex = new RegExp(safeSearchTerm, 'i'); // Case-insensitive search

    if (isObject(value)) {
        Object.entries(value).forEach(([key, childValue]) => {
             // Handle root object keys correctly (prepend '$') vs. nested keys/indices
            const isRootObject = currentPath === '$' && !isArray(value);
            const newPath = isArray(value)
                ? `${currentPath}[${key}]`
                : (isRootObject ? `$.${key}` : `${currentPath}.${key}`);

            // Ensure ref exists for this path
            if (!elementRefs.current.has(newPath)) {
                elementRefs.current.set(newPath, React.createRef<HTMLDivElement>());
            }
            const currentRef = elementRefs.current.get(newPath)!;


            // Check if key matches
            if (regex.test(key)) {
                 // Avoid duplicates
                 if (!results.some(r => r.path === newPath)) {
                    results.push({ path: newPath, elementRef: currentRef });
                 }
            }

            // Check if primitive value matches
            if (!isObject(childValue) && childValue !== null && regex.test(String(childValue))) {
                 // Avoid duplicates and only add if path is not already added via key match
                 if (!results.some(r => r.path === newPath)) {
                    results.push({ path: newPath, elementRef: currentRef });
                 }
            }

            // Recurse into children
            findMatches(childValue, searchTerm, newPath, results, elementRefs);
        });
    } else if (isArray(value)) {
         value.forEach((item, index) => {
             const newPath = `${currentPath}[${index}]`;
             // Ensure ref exists for this path
            if (!elementRefs.current.has(newPath)) {
                elementRefs.current.set(newPath, React.createRef<HTMLDivElement>());
            }
             findMatches(item, searchTerm, newPath, results, elementRefs);
         });
    }
};

// Helper function to get all paths that represent expandable nodes (objects/arrays with content)
const getAllExpandablePaths = (value: any, currentPath: string = '$', paths: Set<string> = new Set()): Set<string> => {
    if (isObject(value) && Object.keys(value).length > 0) {
        paths.add(currentPath); // Add current path if it's an expandable node
        Object.entries(value).forEach(([key, childValue]) => {
            const isRootObject = currentPath === '$' && !isArray(value);
            const newPath = isArray(value)
                ? `${currentPath}[${key}]`
                : (isRootObject ? `$.${key}` : `${currentPath}.${key}`);
            getAllExpandablePaths(childValue, newPath, paths);
        });
    } else if (isArray(value) && value.length > 0) {
        paths.add(currentPath);
        value.forEach((item, index) => {
            const newPath = `${currentPath}[${index}]`;
            getAllExpandablePaths(item, newPath, paths);
        });
    }
    return paths;
};


// Helper to get all ancestor paths for a given path
const getAncestorPaths = (targetPath: string): Set<string> => {
    const ancestors = new Set<string>(['$']); // Always include root
    if (!targetPath || targetPath === '$') return ancestors;

    // Split path intelligently considering bracket notation for arrays and dot notation for objects
    const segments: string[] = [];
    let currentSegment = '';
    let inBrackets = false;
    // Start from index 1 to skip the initial '$'
    for (let i = 1; i < targetPath.length; i++) {
        const char = targetPath[i];
        if (char === '.' && !inBrackets) {
            if (currentSegment) segments.push(currentSegment);
            currentSegment = '';
        } else if (char === '[' && !inBrackets) {
            if (currentSegment) segments.push(currentSegment);
            currentSegment = '[';
            inBrackets = true;
        } else if (char === ']' && inBrackets) {
            currentSegment += ']';
            segments.push(currentSegment);
            currentSegment = '';
            inBrackets = false;
        } else {
            currentSegment += char;
        }
    }
    // Add the last segment if any
    if (currentSegment) segments.push(currentSegment);


    let currentBuiltPath = '$';
    // Iterate through segments, building up the path and adding ancestors
    for (let i = 0; i < segments.length - 1; i++) { // Stop before the last segment
        const segment = segments[i];
        if (segment.startsWith('[')) {
            currentBuiltPath += segment;
        } else {
             // Handle root object case correctly ($.key vs .key)
             currentBuiltPath += (currentBuiltPath === '$' && !segment.startsWith('.') ? '.' : (segment.startsWith('.') ? '' : '.')) + segment;
        }
        ancestors.add(currentBuiltPath);
    }


    return ancestors;
};


const JsonExplorer: React.FC = () => {
  const [jsonInput, setJsonInput] = useState<string>(exampleJson);
  const [parsedJson, setParsedJson] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonPath, setJsonPath] = useState<string>("$"); // Default to root
  const [previewResult, setPreviewResult] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>("");
  const [matchPaths, setMatchPaths] = useState<{ path: string; elementRef: React.RefObject<HTMLDivElement> }[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['$'])); // State for expanded paths
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const nodeElementRefs = useRef<Map<string, React.RefObject<HTMLDivElement>>>(new Map());


  // Effect for parsing JSON
  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonInput);
      setParsedJson(parsed);
      setError(null);
      setExpandedPaths(new Set(['$'])); // Reset expansion on new JSON
      nodeElementRefs.current = new Map(); // Reset refs
      // Pre-populate refs for the initial structure
      const initialRefs: { path: string; elementRef: React.RefObject<HTMLDivElement> }[] = [];
      findMatches(parsed, '', '$', initialRefs, nodeElementRefs);
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
      setParsedJson(null);
      setPreviewResult("");
      setMatchPaths([]);
      setCurrentMatchIndex(-1);
      setExpandedPaths(new Set(['$']));
      nodeElementRefs.current = new Map();
    }
  }, [jsonInput]);

 // Effect for updating preview using the custom path evaluation
 useEffect(() => {
    if (error || parsedJson === null) {
        setPreviewResult("");
        return;
    }
    try {
        const result = evaluateJsonPath(parsedJson, jsonPath);
        setPreviewResult(result === undefined ? "undefined" : JSON.stringify(result, null, 2));
    } catch (e: any) {
        // Catch errors from evaluateJsonPath specifically if needed
        setPreviewResult(`Error accessing path: ${e.message}`);
    }
}, [jsonPath, parsedJson, error]);


  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Effect for performing search
   useEffect(() => {
    if (parsedJson === null || error) {
      setMatchPaths([]);
      setCurrentMatchIndex(-1);
      return;
    }
    // Always re-run findMatches to ensure refs are populated/updated
    const results: { path: string; elementRef: React.RefObject<HTMLDivElement> }[] = [];
    findMatches(parsedJson, debouncedSearchTerm, '$', results, nodeElementRefs);

    if (!debouncedSearchTerm) {
        setMatchPaths([]);
        setCurrentMatchIndex(-1);
        return;
    }

    // Sort results naturally (optional, but good for consistency)
    results.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));

    setMatchPaths(results);
    const firstMatchIndex = results.length > 0 ? 0 : -1;
    setCurrentMatchIndex(firstMatchIndex);

    if (firstMatchIndex !== -1) {
      const firstMatchPath = results[firstMatchIndex].path;
      setJsonPath(firstMatchPath); // Update path input
      // Expand all ancestors of the first match
      setExpandedPaths(prevPaths => new Set([...prevPaths, ...getAncestorPaths(firstMatchPath)]));
    } else {
        // If no results found, maybe reset path or keep current? Keeping current for now.
        // Optionally provide feedback that no results were found
    }

  }, [debouncedSearchTerm, parsedJson, error]); // Added error dependency


  // Effect to scroll to the current match
  useEffect(() => {
    if (currentMatchIndex >= 0 && matchPaths.length > 0 && viewMode === 'tree') {
      const currentMatch = matchPaths[currentMatchIndex];
      const targetPath = currentMatch.path;
      const targetElementRef = currentMatch.elementRef;

      // Expand ancestors of the target path
       setExpandedPaths(prevPaths => {
           const ancestors = getAncestorPaths(targetPath);
           const newPaths = new Set([...prevPaths, ...ancestors]);
           // If the target itself is expandable, make sure it's expanded
           // Check if the corresponding node value is an object or array before adding
            try {
                const nodeValue = evaluateJsonPath(parsedJson, targetPath); // Use evaluateJsonPath here too
                 if ((isObject(nodeValue) || isArray(nodeValue)) && Object.keys(nodeValue).length > 0) {
                     newPaths.add(targetPath);
                 }
            } catch (e) {
                // Ignore errors during this check, path might be invalid temporarily
            }

           return newPaths;
       });


       // Scroll after a short delay to allow for expansion
       const scrollTimer = setTimeout(() => {
          const targetElement = targetElementRef.current;
          // Check if the element exists in the DOM before scrolling
          if (targetElement && scrollAreaRef.current?.contains(targetElement)) {
            targetElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
              // Element might not be rendered yet (if parents were collapsed)
              // Retry scroll after another delay
              const retryScrollTimer = setTimeout(() => {
                    const elementAgain = targetElementRef.current;
                    if (elementAgain && scrollAreaRef.current?.contains(elementAgain)) {
                        elementAgain.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
              }, 300); // Longer delay for retry
               return () => clearTimeout(retryScrollTimer);
          }
      }, 150); // Initial delay

       return () => clearTimeout(scrollTimer);
    }
  }, [currentMatchIndex, matchPaths, viewMode, parsedJson]); // Added parsedJson dependency for evaluateJsonPath


  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonInput(event.target.value);
  };

  const handlePathChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setJsonPath(event.target.value);
  };

  // Unified handler for node click and toggle expansion
  const handleNodeInteraction = (path: string, value: any, isToggle: boolean) => {
    if (isToggle) {
        setExpandedPaths(prevPaths => {
            const newPaths = new Set(prevPaths);
            if (newPaths.has(path)) {
                newPaths.delete(path);
            } else {
                 // Ensure node exists and has children before expanding
                 // Use lodash-es functions directly
                 if ((isObject(value) || isArray(value)) && Object.keys(value).length > 0) {
                    newPaths.add(path);
                 }
            }
            return newPaths;
        });
    } else {
        // Node click (not toggle icon) - update path preview
        setJsonPath(path);
    }
  };


  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        toast({
          title: `${type} Copied!`,
          description: `${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
        });
      })
      .catch(err => {
        toast({
          title: "Copy Failed",
          description: `Could not copy ${type}: ${err}`,
          variant: "destructive",
        });
      });
  };

  const handleCopy = (event: React.MouseEvent<HTMLButtonElement>) => {
     if (event.button === 0) copyToClipboard(jsonPath, "JSON Path");
  };

  const handleContextMenuCopy = (event: React.MouseEvent<HTMLButtonElement>) => {
     event.preventDefault();
     copyToClipboard(previewResult, "Preview Result");
  };

  const handleNextMatch = () => {
    if (matchPaths.length > 0) {
      const nextIndex = (currentMatchIndex + 1) % matchPaths.length;
      setCurrentMatchIndex(nextIndex);
      setJsonPath(matchPaths[nextIndex].path); // Update path from the match object
      // Expansion and scrolling are handled by the useEffect for currentMatchIndex
    }
  };

  const handlePrevMatch = () => {
    if (matchPaths.length > 0) {
      const prevIndex = (currentMatchIndex - 1 + matchPaths.length) % matchPaths.length;
      setCurrentMatchIndex(prevIndex);
      setJsonPath(matchPaths[prevIndex].path); // Update path from the match object
       // Expansion and scrolling are handled by the useEffect for currentMatchIndex
    }
  };

  const handleExpandAll = () => {
      if (parsedJson) {
          setExpandedPaths(getAllExpandablePaths(parsedJson));
      }
  };

  const handleCollapseAll = () => {
      setExpandedPaths(new Set(['$'])); // Only keep root expanded
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col md:flex-row h-screen p-4 gap-4 bg-background">
        {/* Left Panel */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex justify-between items-center mb-2">
                <CardTitle className="text-lg">JSON Input / Tree View</CardTitle>
                <div className="flex items-center space-x-1">
                     {/* Expand/Collapse Buttons - only in Tree view and no error */}
                    {viewMode === 'tree' && !error && parsedJson !== null && (
                         <>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={handleExpandAll}
                                        aria-label="Expand All Nodes"
                                    >
                                        <ChevronsUpDown className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Expand All</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={handleCollapseAll}
                                        aria-label="Collapse All Nodes"
                                    >
                                        <ChevronsDownUp className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Collapse All</TooltipContent>
                            </Tooltip>
                         </>
                     )}
                    {/* Tree/Edit View Toggle Buttons */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={viewMode === 'tree' ? 'secondary': 'ghost'}
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setViewMode('tree')}
                                disabled={error !== null}
                                aria-label="Switch to Tree View"
                            >
                                <Rows className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Tree View</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={viewMode === 'edit' ? 'secondary': 'ghost'}
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setViewMode('edit')}
                                aria-label="Switch to Edit JSON View"
                            >
                                <Pencil className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit JSON</TooltipContent>
                    </Tooltip>
                </div>
            </div>
             {viewMode === 'tree' && !error && (
                <div className="flex items-center space-x-2">
                    <Search className="h-4 w-4 text-muted-foreground"/>
                    <Input
                        type="text"
                        placeholder="Search key or value..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-8 text-sm flex-1"
                        aria-label="Search JSON Tree"
                    />
                     {matchPaths.length > 0 && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap" aria-live="polite">
                            {currentMatchIndex + 1} / {matchPaths.length}
                        </span>
                    )}
                    <Tooltip>
                        <TooltipTrigger asChild>
                             <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={handlePrevMatch}
                                disabled={matchPaths.length <= 1}
                                aria-label="Previous match"
                            >
                               <ChevronLeft className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                         <TooltipContent>Previous Match</TooltipContent>
                    </Tooltip>
                     <Tooltip>
                        <TooltipTrigger asChild>
                             <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={handleNextMatch}
                                disabled={matchPaths.length <= 1}
                                aria-label="Next match"
                            >
                               <ChevronRight className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Next Match</TooltipContent>
                    </Tooltip>
                </div>
             )}
          </CardHeader>
          <CardContent className="flex-1 flex flex-col overflow-hidden p-0 px-4 pb-4">

            {viewMode === 'edit' && (
                 <Textarea
                    value={jsonInput}
                    onChange={handleInputChange}
                    placeholder="Paste your JSON here"
                    className="flex-1 resize-none font-mono text-sm bg-card border rounded-md p-2"
                    aria-label="JSON Input"
                />
            )}
             {viewMode === 'tree' && (
                 <ScrollArea className="flex-1 border rounded-md p-2 bg-card" viewportRef={scrollAreaRef}>
                    {parsedJson !== null && error === null ? (
                         <JsonTreeNode
                            nodeKey="$"
                            value={parsedJson}
                            level={0}
                            path="$"
                            onNodeInteraction={handleNodeInteraction} // Pass the interaction handler
                            searchTerm={debouncedSearchTerm}
                            highlightPath={currentMatchIndex >= 0 ? matchPaths[currentMatchIndex].path : undefined}
                            expandedPaths={expandedPaths} // Pass the managed expansion state
                             // Ensure ref exists for root node
                            elementRef={nodeElementRefs.current.get('$') || (nodeElementRefs.current.set('$', React.createRef<HTMLDivElement>()), nodeElementRefs.current.get('$'))!}
                            nodeElementRefs={nodeElementRefs} // Pass the refs map
                        />
                    ) : (
                        <div className="text-muted-foreground p-4 text-center">
                            {error ? 'Invalid JSON format. Please correct it in Edit mode.' : 'Enter JSON in Edit mode to view the tree.'}
                        </div>
                    )}
                </ScrollArea>
             )}

             {error && viewMode === 'edit' && (
                <p className="text-destructive text-xs mt-1 px-1">{error}</p>
             )}
          </CardContent>
        </Card>

        {/* Right Panel */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-lg mb-2">JSON Path & Preview</CardTitle>
            <div className="flex items-center space-x-2">
              <Input
                type="text"
                value={jsonPath}
                onChange={handlePathChange}
                placeholder="Enter JSON Path (e.g., $.users[*].name)" // Updated placeholder
                className="flex-1 font-mono text-sm h-10"
                aria-label="JSON Path Input"
                disabled={error !== null}
              />
                <Tooltip>
                    <TooltipTrigger asChild>
                         <Button
                            variant="outline"
                            size="icon"
                            onClick={handleCopy}
                            onContextMenu={handleContextMenuCopy}
                            aria-label="Copy Path or Result"
                            disabled={error !== null}
                         >
                           <ClipboardCopy className="h-4 w-4" />
                         </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        <p>Left Click: Copy Path</p>
                        <p>Right Click: Copy Result</p>
                    </TooltipContent>
                </Tooltip>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0 px-4 pb-4">
            <ScrollArea className="h-full border rounded-md p-2 bg-card">
              <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                {error ? <span className="text-destructive">Invalid JSON</span> : (previewResult || <span className="text-muted-foreground">Preview will appear here</span>)}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};

export default JsonExplorer;

