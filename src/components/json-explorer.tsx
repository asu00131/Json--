
"use client";

import * as React from "react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react"; // Added useMemo
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ClipboardCopy, Search, Rows, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import JsonTreeNode from "./json-tree-node";
import { get, isObject, isArray, escapeRegExp } from 'lodash-es'; // Using lodash get for safe path access

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
    "Result Navigation"
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


// Helper function to find all matching paths in the JSON data
const findMatches = (value: any, searchTerm: string, currentPath: string, results: string[]): void => {
    if (!searchTerm) return;

    const safeSearchTerm = escapeRegExp(searchTerm.toLowerCase());
    const regex = new RegExp(safeSearchTerm, 'i'); // Case-insensitive search

    if (isObject(value)) {
        Object.entries(value).forEach(([key, childValue]) => {
            const newPath = isArray(value) ? `${currentPath}[${key}]` : `${currentPath ? currentPath + '.' : ''}${key}`;
            const displayPath = isArray(value) ? `${currentPath}[${key}]` : `${currentPath ? currentPath + '.' : '$'}${key}`; // Path used for display/internal logic might differ

             // Prepend '$' if currentPath is empty (for root object keys)
             const searchPath = currentPath === '$' ? displayPath : (isArray(value) ? `${currentPath}[${key}]` : `${currentPath}.${key}`);


            // Check if key matches
            if (regex.test(key)) {
                results.push(searchPath);
            }

            // Check if primitive value matches
            if (!isObject(childValue) && childValue !== null && regex.test(String(childValue))) {
                 // Only add if path is not already added via key match
                 if (!results.includes(searchPath)) {
                    results.push(searchPath);
                 }
            }

            // Recurse into children
            findMatches(childValue, searchTerm, searchPath, results);
        });
    } else if (isArray(value)) {
         value.forEach((item, index) => {
             const newPath = `${currentPath}[${index}]`;
             findMatches(item, searchTerm, newPath, results);
         });
    }
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
  const [matchPaths, setMatchPaths] = useState<string[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null); // Ref for the ScrollArea viewport

  // Effect for parsing JSON when input changes
  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonInput);
      setParsedJson(parsed);
      setError(null);
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
      setParsedJson(null);
      // Clear preview immediately on parse error
      setPreviewResult("");
      setMatchPaths([]); // Clear search results on parse error
      setCurrentMatchIndex(-1);
    }
  }, [jsonInput]); // Only depends on jsonInput

  // Effect for updating preview when path or parsed data changes
  useEffect(() => {
    if (error) {
        setPreviewResult("");
        return;
    }
    if (parsedJson === null) {
        setPreviewResult("");
        return;
    }
    try {
      // Adjust path for lodash 'get': remove '$' or '$.' prefix
      let adjustedPath = jsonPath;
      if (adjustedPath === '$') {
          adjustedPath = ''; // Root object
      } else if (adjustedPath.startsWith('$.')) {
          adjustedPath = adjustedPath.substring(2);
      } else if (adjustedPath.startsWith('$[')) {
          // Handle root arrays like $[0]
          adjustedPath = adjustedPath.substring(1);
      }

      const result = get(parsedJson, adjustedPath);
      setPreviewResult(result === undefined ? "undefined" : JSON.stringify(result, null, 2));
    } catch (e: any) {
       setPreviewResult(`Error accessing path: ${e.message}`);
    }
  }, [jsonPath, parsedJson, error]);


  // Debounce mechanism for search term
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms debounce delay
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Effect for performing search when debounced term or parsed data changes
   useEffect(() => {
    if (!debouncedSearchTerm || parsedJson === null) {
      setMatchPaths([]);
      setCurrentMatchIndex(-1);
      return;
    }

    const results: string[] = [];
    findMatches(parsedJson, debouncedSearchTerm, '$', results);
    // Ensure root matches are handled correctly, e.g., searching for the root key name
    if (isObject(parsedJson) && !isArray(parsedJson)) {
        Object.keys(parsedJson).forEach(key => {
            const safeSearchTerm = escapeRegExp(debouncedSearchTerm.toLowerCase());
            const regex = new RegExp(safeSearchTerm, 'i');
            if (regex.test(key) && !results.some(p => p === `$.${key}`)) {
                 // Add root key match if not already found deeper
                 // This check might be redundant depending on findMatches logic,
                 // but ensures root keys are considered.
            }
        });
    }

    // Sort results for consistent navigation (optional)
    // results.sort();

    setMatchPaths(results);
    setCurrentMatchIndex(results.length > 0 ? 0 : -1);
     // Automatically update JSON path and expand to the first match
    if (results.length > 0) {
        setJsonPath(results[0]);
    }


  }, [debouncedSearchTerm, parsedJson]);


  // Effect to scroll to the current match when index changes
  useEffect(() => {
    if (currentMatchIndex >= 0 && matchPaths.length > 0 && viewMode === 'tree') {
      const targetPath = matchPaths[currentMatchIndex];
      // Need a slight delay for the DOM to update, especially when nodes expand
      setTimeout(() => {
         const targetElement = scrollAreaRef.current?.querySelector(`[data-path="${targetPath}"]`);
         targetElement?.scrollIntoView({
           behavior: 'smooth',
           block: 'center', // 'start', 'center', 'end', or 'nearest'
         });
      }, 100); // Adjust delay if needed
    }
  }, [currentMatchIndex, matchPaths, viewMode]); // Run when index, paths or viewMode change


  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newJsonInput = event.target.value;
    setJsonInput(newJsonInput);
  };

  const handlePathChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newPath = event.target.value;
    setJsonPath(newPath);
  };

  const handleNodeClick = (path: string, value: any) => {
    setJsonPath(path); // Path from JsonTreeNode is already in '$...' format
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
     if (event.button === 0) { // Left click
         copyToClipboard(jsonPath, "JSON Path");
     }
  };

  const handleContextMenuCopy = (event: React.MouseEvent<HTMLButtonElement>) => {
     event.preventDefault(); // Prevent default context menu
     copyToClipboard(previewResult, "Preview Result");
  };

  const handleNextMatch = () => {
    if (matchPaths.length > 0) {
      const nextIndex = (currentMatchIndex + 1) % matchPaths.length;
      setCurrentMatchIndex(nextIndex);
      setJsonPath(matchPaths[nextIndex]); // Update JSON path to the current match
    }
  };

  const handlePrevMatch = () => {
    if (matchPaths.length > 0) {
      const prevIndex = (currentMatchIndex - 1 + matchPaths.length) % matchPaths.length;
      setCurrentMatchIndex(prevIndex);
      setJsonPath(matchPaths[prevIndex]); // Update JSON path to the current match
    }
  };

   // Get all ancestor paths for the current match to ensure they are expanded
   const getExpandedPaths = useCallback((currentMatchPath: string): Set<string> => {
        const paths = new Set<string>(['$']); // Always expand root
        if (!currentMatchPath || currentMatchPath === '$') return paths;

        // Improved path splitting to handle keys with dots or brackets correctly
        let current = '$';
        // Split path by '.' or '[' and filter out empty strings and ']'
        const parts = currentMatchPath.substring(1) // Remove leading '$'
            .split(/[\.\[]/) // Split by '.' or '['
            .filter(part => part && part !== ']'); // Remove empty strings and closing brackets

        parts.forEach((part, index) => {
            const isArrayIndex = /^\d+$/.test(part);
            if (isArrayIndex) {
                 // It's an array index - wrap in brackets
                 current = `${current}[${part}]`;
            } else {
                 // It's an object key - prepend with '.' if not the first part after '$'
                 current = index === 0 ? `$.${part}` : `${current}.${part}`;
            }

             // Add parent paths to the set for expansion
             if (index < parts.length -1) { // Only expand parents, not the leaf node itself
                 paths.add(current);
             }
        });

        return paths;
    }, []);


   const expandedPaths = useMemo(() => {
        return currentMatchIndex >= 0 && matchPaths.length > 0
            ? getExpandedPaths(matchPaths[currentMatchIndex])
            : new Set<string>(['$']); // Default to expanding root
    }, [currentMatchIndex, matchPaths, getExpandedPaths]);


  return (
    <TooltipProvider>
      <div className="flex flex-col md:flex-row h-screen p-4 gap-4 bg-background">
        {/* Left Panel */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex justify-between items-center mb-2">
                <CardTitle className="text-lg">JSON Input / Tree View</CardTitle>
                <div className="flex items-center space-x-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={viewMode === 'tree' ? 'secondary': 'ghost'}
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setViewMode('tree')}
                                disabled={error !== null} // Disable tree view if JSON is invalid
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
             {viewMode === 'tree' && !error && ( // Only show search if in tree view and no error
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
                    {parsedJson !== null && error === null ? ( // Only render tree if parsed and no error
                         <JsonTreeNode
                            nodeKey="$" // Root node key
                            value={parsedJson}
                            level={0}
                            path="$"
                            onNodeClick={handleNodeClick}
                            searchTerm={debouncedSearchTerm}
                            highlightPath={currentMatchIndex >= 0 ? matchPaths[currentMatchIndex] : undefined} // Pass the current match path
                            expandedPaths={expandedPaths} // Pass the set of paths to expand
                        />
                    ) : (
                        <div className="text-muted-foreground p-4 text-center">
                            {error ? 'Invalid JSON format. Please correct it in Edit mode.' : 'Enter JSON in Edit mode to view the tree.'}
                        </div>
                    )}
                </ScrollArea>
             )}

             {error && viewMode === 'edit' && ( // Show error only in edit mode
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
                placeholder="Enter JSON Path (e.g., $.users[0].name)"
                className="flex-1 font-mono text-sm h-10"
                aria-label="JSON Path Input"
                disabled={error !== null} // Disable path input on error
              />
                <Tooltip>
                    <TooltipTrigger asChild>
                         <Button
                            variant="outline"
                            size="icon"
                            onClick={handleCopy}
                            onContextMenu={handleContextMenuCopy}
                            aria-label="Copy Path or Result"
                            disabled={error !== null} // Disable copy on error
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

    