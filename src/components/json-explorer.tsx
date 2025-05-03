
"use client";

import * as React from "react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ClipboardCopy, Search, Rows, Pencil, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, Binary } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import JsonTreeNode from "./json-tree-node";
import { isObject, isArray, escapeRegExp } from 'lodash-es';

type ViewMode = "tree" | "edit";
type PreviewDisplayMode = "json" | "tree";

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
            return undefined; // Cannot traverse further
        }

        const segment = segments[i];
        // const isLastSegment = i === segments.length - 1;

        if (segment.endsWith('[*]')) {
            const arrayKey = segment.substring(0, segment.length - 3);
            // Get the array, handling root array case (arrayKey might be empty)
            const targetArray = arrayKey ? (isObject(currentData) ? currentData[arrayKey] : undefined) : (isArray(currentData) ? currentData : undefined);

            if (!isArray(targetArray)) {
                 // If it's not an array, it's an error or undefined, depending on context
                 return undefined;
            }

            // Remaining segments to apply to each array element
            const remainingSegments = segments.slice(i + 1);

            // If no more segments, return the whole array
            if (remainingSegments.length === 0) {
                return targetArray;
            }

            // Apply remaining segments to each element and collect results
            const results = targetArray.map(item => evaluatePathSegments(item, remainingSegments));

             // Filter out undefined results ONLY if the entire result for an item is undefined
            // If the sub-path resolves to null or an empty object/array, keep it
            const validResults = results.filter(res => res !== undefined);

            // If no valid results found after applying sub-path, return undefined
            // Otherwise, return the array of valid results
            return validResults.length > 0 ? validResults : undefined;


        } else if (segment.includes('[')) { // Handle specific array index like [0] or key[0]
             const match = segment.match(/^(.+?)\[(\d+)]$/);
             if (match) {
                 const key = match[1];
                 const index = parseInt(match[2], 10);

                 // Key access before index
                 const intermediateData = isObject(currentData) ? currentData[key] : undefined;
                 if (!isArray(intermediateData) || index >= intermediateData.length) {
                     return undefined; // Array not found or index out of bounds
                 }
                 currentData = intermediateData[index];

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
         // Keep the brackets for root array access like $[0] or $[*]
         adjustedPath = adjustedPath.substring(1);
    } else if (adjustedPath.startsWith('$')) {
         // Should not happen with valid paths, but handle just in case
         return undefined;
     }


    // Split path carefully, handling array indices and wildcards within brackets
    const segments: string[] = [];
    let currentSegment = '';
    let inBrackets = false;
    let bracketContent = '';

    for (let i = 0; i < adjustedPath.length; i++) {
        const char = adjustedPath[i];

        if (char === '.' && !inBrackets) {
            // End of an object key segment
            if (currentSegment) segments.push(currentSegment);
            currentSegment = '';
        } else if (char === '[' && !inBrackets) {
            // Start of bracket notation (index or wildcard)
             if (currentSegment) {
                 // Store the object key segment preceding the bracket
                 segments.push(currentSegment);
                 currentSegment = '';
             }
             inBrackets = true;
             bracketContent = '['; // Start collecting bracket content
        } else if (char === ']' && inBrackets) {
             // End of bracket notation
             bracketContent += ']';
             inBrackets = false;
              // Special handling for '[*]' segment combined with a preceding key
              // Check if the last pushed segment is an object key (doesn't start with '[')
              if (segments.length > 0 && !segments[segments.length - 1].includes('[')) {
                  // Combine key with bracket, e.g., 'key' + '[*]' -> 'key[*]'
                  segments[segments.length - 1] += bracketContent;
              } else {
                  // Push standalone bracket segment (e.g., '[0]', '[*]', or root '[*]')
                  segments.push(bracketContent);
              }
             bracketContent = ''; // Reset bracket content
        } else if (inBrackets) {
            // Inside brackets, collect content
            bracketContent += char;
        } else {
            // Part of an object key segment
            currentSegment += char;
        }
    }

     // Add the last segment if any (could be object key)
    if (currentSegment) {
        segments.push(currentSegment);
    }


    // Process segments (no need for combination logic here, handled during splitting)
    const processedSegments = segments;


    return evaluatePathSegments(data, processedSegments);
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
                ? `${currentPath}[${key}]` // Array element path
                : (isRootObject ? `$.${key}` : `${currentPath}.${key}`); // Object property path

            // Ensure ref exists for this path
             const refKey = newPath; // Use the generated path as the key
            if (!elementRefs.current.has(refKey)) {
                elementRefs.current.set(refKey, React.createRef<HTMLDivElement>());
            }
            const currentRef = elementRefs.current.get(refKey)!;


            // Check if key matches
            if (regex.test(key)) {
                 // Avoid duplicates
                 if (!results.some(r => r.path === newPath)) {
                    results.push({ path: newPath, elementRef: currentRef });
                 }
            }

            // Check if primitive value matches
             // Only test primitives, null, or empty strings
            if ((!isObject(childValue) && !isArray(childValue)) || childValue === null) {
                const stringValue = String(childValue); // Convert null or primitives to string
                if (regex.test(stringValue)) {
                    // Avoid duplicates and only add if path is not already added via key match
                     if (!results.some(r => r.path === newPath)) {
                         results.push({ path: newPath, elementRef: currentRef });
                     }
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
    const isExpandable = (isObject(value) && Object.keys(value).length > 0) || (isArray(value) && value.length > 0);

    if (isExpandable) {
        paths.add(currentPath); // Add current path if it's an expandable node
        if (isObject(value) && !isArray(value)) {
             Object.entries(value).forEach(([key, childValue]) => {
                const newPath = currentPath === '$' ? `$.${key}` : `${currentPath}.${key}`;
                getAllExpandablePaths(childValue, newPath, paths);
            });
        } else if (isArray(value)) {
             value.forEach((item, index) => {
                const newPath = `${currentPath}[${index}]`;
                getAllExpandablePaths(item, newPath, paths);
            });
        }
    }
    return paths;
};


// Helper to get all ancestor paths for a given path
const getAncestorPaths = (targetPath: string): Set<string> => {
    const ancestors = new Set<string>(['$']); // Always include root
    if (!targetPath || targetPath === '$') return ancestors;

     // Reuse the path splitting logic from evaluateJsonPath for consistency
     let adjustedPath = targetPath;
     if (adjustedPath.startsWith('$.')) adjustedPath = adjustedPath.substring(2);
     else if (adjustedPath.startsWith('$[')) adjustedPath = adjustedPath.substring(1);
     else if (adjustedPath.startsWith('$')) return ancestors; // Invalid start

    const segments: string[] = [];
    let currentSegment = '';
    let inBrackets = false;
    let bracketContent = '';

    for (let i = 0; i < adjustedPath.length; i++) {
        const char = adjustedPath[i];

        if (char === '.' && !inBrackets) {
            // End of an object key segment
            if (currentSegment) segments.push(currentSegment);
            currentSegment = '';
        } else if (char === '[' && !inBrackets) {
            // Start of bracket notation (index or wildcard)
             if (currentSegment) {
                 // Store the object key segment preceding the bracket
                 segments.push(currentSegment);
                 currentSegment = '';
             }
             inBrackets = true;
             bracketContent = '['; // Start collecting bracket content
        } else if (char === ']' && inBrackets) {
             // End of bracket notation
             bracketContent += ']';
             inBrackets = false;
              // Combine key with bracket or push standalone bracket
              if (segments.length > 0 && !segments[segments.length - 1].includes('[')) {
                  segments[segments.length - 1] += bracketContent;
              } else {
                  segments.push(bracketContent);
              }
             bracketContent = '';
        } else if (inBrackets) {
            bracketContent += char;
        } else {
            currentSegment += char;
        }
    }
     if (currentSegment) segments.push(currentSegment);

    // The segments are already combined correctly during splitting
    const combinedSegments = segments;

    let currentBuiltPath = '$';
    // Iterate through combined segments, building up the path and adding ancestors
    for (let i = 0; i < combinedSegments.length - 1; i++) { // Stop before the last segment
        const segment = combinedSegments[i];
         if (segment.startsWith('[')) {
            currentBuiltPath += segment; // Append bracket notation directly
         } else if (segment.includes('[')) {
             // Handle combined key[index/wildcard]
             const parts = segment.match(/^(.+?)(\[.*])$/);
             if (parts) {
                 const keyPart = parts[1];
                 const bracketPart = parts[2];
                 // Decide whether to add '.' based on whether the current path is just '$'
                 currentBuiltPath += (currentBuiltPath === '$' ? '.' : '.') + keyPart + bracketPart;
             } else {
                  // Fallback for unexpected format, treat as key
                  currentBuiltPath += (currentBuiltPath === '$' ? '.' : '.') + segment;
             }

         } else {
             // Handle simple object key
             currentBuiltPath += (currentBuiltPath === '$' ? '.' : '.') + segment;
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
  const [previewResult, setPreviewResult] = useState<any>(undefined); // Store raw result
  const [previewDisplayMode, setPreviewDisplayMode] = useState<PreviewDisplayMode>('tree'); // Default to 'tree'
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>("");
  const [matchPaths, setMatchPaths] = useState<{ path: string; elementRef: React.RefObject<HTMLDivElement> }[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['$'])); // State for expanded paths
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const nodeElementRefs = useRef<Map<string, React.RefObject<HTMLDivElement>>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null); // Ref for the search input


  // Effect for parsing JSON
  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonInput);
      setParsedJson(parsed);
      setError(null);
      setExpandedPaths(new Set(['$'])); // Reset expansion on new JSON
      nodeElementRefs.current = new Map(); // Reset refs
      // Set initial preview mode based on root type
      setPreviewDisplayMode(isArray(parsed) ? 'tree' : 'json');
       // Re-run search if needed after JSON updates
       setDebouncedSearchTerm(searchTerm);
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
      setParsedJson(null);
      setPreviewResult(undefined);
      setMatchPaths([]);
      setCurrentMatchIndex(-1);
      setExpandedPaths(new Set(['$']));
      nodeElementRefs.current = new Map();
      setPreviewDisplayMode('json'); // Reset preview mode on error
    }
  }, [jsonInput]); // Removed searchTerm dependency

 // Effect for updating preview using the custom path evaluation
 useEffect(() => {
    if (error || parsedJson === null) {
        setPreviewResult(undefined);
        return;
    }
    try {
        const result = evaluateJsonPath(parsedJson, jsonPath);
        setPreviewResult(result);
        // Automatically switch to JSON view if the result is not an array or object
        // Keep tree view for arrays
        if (!isArray(result) && !isObject(result)) {
            setPreviewDisplayMode('json');
        } else if (isArray(result)) {
            setPreviewDisplayMode('tree');
        }
        // If it's an object but not an array, default to JSON (could be changed)
        else if (isObject(result)) {
             setPreviewDisplayMode('json');
        }

    } catch (e: any) {
        setPreviewResult(`Error accessing path: ${e.message}`);
        setPreviewDisplayMode('json'); // Reset on error
    }
}, [jsonPath, parsedJson, error]); // Removed previewDisplayMode dependency


  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);


  // Scroll to the current match element
   const scrollToMatch = useCallback((matchIndex: number) => {
       if (matchIndex < 0 || matchIndex >= matchPaths.length || viewMode !== 'tree') {
           return;
       }

       const currentMatch = matchPaths[matchIndex];
       const targetPath = currentMatch.path;
       const targetElementRef = currentMatch.elementRef;

       // Expand ancestors first
       const ancestors = getAncestorPaths(targetPath);
       setExpandedPaths(prevPaths => new Set([...prevPaths, ...ancestors]));

       // Use requestAnimationFrame to ensure expansion happens before scrolling
       requestAnimationFrame(() => {
           const targetElement = targetElementRef.current;
           if (targetElement && scrollAreaRef.current?.contains(targetElement)) {
               targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
           } else {
               // If still not found, try again after a small delay
               setTimeout(() => {
                   const elementAgain = targetElementRef.current;
                   if (elementAgain && scrollAreaRef.current?.contains(elementAgain)) {
                       elementAgain.scrollIntoView({ behavior: 'smooth', block: 'center' });
                   }
               }, 100); // Shorter delay
           }
       });
   }, [matchPaths, viewMode]); // Removed expandedPaths dependency


  // Effect for performing search and setting initial state
  useEffect(() => {
      if (parsedJson === null || error) {
          setMatchPaths([]);
          setCurrentMatchIndex(-1);
          return;
      }

      const results: { path: string; elementRef: React.RefObject<HTMLDivElement> }[] = [];
      nodeElementRefs.current = new Map(); // Clear refs before finding matches
      findMatches(parsedJson, debouncedSearchTerm, '$', results, nodeElementRefs);

      if (!debouncedSearchTerm) {
          setMatchPaths([]);
          setCurrentMatchIndex(-1);
          return; // Exit if search term is empty
      }

      // Sort results naturally
      results.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));

      setMatchPaths(results);
      const firstMatchIndex = results.length > 0 ? 0 : -1;
      setCurrentMatchIndex(firstMatchIndex);

      if (firstMatchIndex !== -1) {
          const firstMatchPath = results[firstMatchIndex].path;
          setJsonPath(firstMatchPath); // Update path input to the first match
          scrollToMatch(firstMatchIndex); // Scroll to the first match
      } else {
          // No results found
          if (searchTerm) { // Only toast if user actually searched for something
              toast({
                  title: "Search",
                  description: "No matches found.",
                  variant: "default",
                  duration: 3000
              });
          }
      }
  }, [debouncedSearchTerm, parsedJson, error, toast, scrollToMatch, searchTerm]); // Added scrollToMatch and searchTerm


  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonInput(event.target.value);
    // Reset search state when JSON input changes significantly
    setSearchTerm("");
    setDebouncedSearchTerm("");
    setMatchPaths([]);
    setCurrentMatchIndex(-1);
  };

  const handlePathChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newPath = event.target.value;
    setJsonPath(newPath);
     // Re-evaluate preview mode based on the potential result type
    try {
        const result = evaluateJsonPath(parsedJson, newPath);
        if (isArray(result)) {
            setPreviewDisplayMode('tree');
        } else {
             setPreviewDisplayMode('json');
        }
    } catch {
        setPreviewDisplayMode('json'); // Default to JSON on path error
    }
  };

  // Unified handler for node click and toggle expansion
  const handleNodeInteraction = useCallback((path: string, value: any, isToggle: boolean) => {
    if (isToggle) {
        setExpandedPaths(prevPaths => {
            const newPaths = new Set(prevPaths);
            if (newPaths.has(path)) {
                newPaths.delete(path);
            } else {
                 // Ensure node exists and has children before expanding
                 const canExpand = (isObject(value) && Object.keys(value).length > 0) || (isArray(value) && value.length > 0);
                 if (canExpand) {
                    newPaths.add(path);
                 }
            }
            return newPaths;
        });
    } else {
        // Node click (not toggle icon) - update path preview
        setJsonPath(path);
        // Set preview mode based on the clicked node's value type
        // Keep tree view for arrays, otherwise JSON
         if (isArray(value)) {
             setPreviewDisplayMode('tree');
         } else {
             setPreviewDisplayMode('json');
         }
    }
  }, []); // Removed parsedJson dependency as evaluateJsonPath handles it


  const copyToClipboard = useCallback((text: string, type: string) => {
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
  }, [toast]);

  const handleCopy = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
     if (event.button === 0) copyToClipboard(jsonPath, "JSON Path");
  }, [jsonPath, copyToClipboard]);

  const handleContextMenuCopy = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
     event.preventDefault();
     let textToCopy: string;
     try {
         if (previewResult === undefined) {
             textToCopy = "undefined";
         } else if (previewDisplayMode === 'tree' && isArray(previewResult)) {
             textToCopy = previewResult.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join('\n');
         } else {
             textToCopy = JSON.stringify(previewResult, null, 2);
         }
         copyToClipboard(textToCopy, "Preview Result");
     } catch (e) {
         copyToClipboard(String(previewResult), "Preview Result (Raw)"); // Fallback for complex non-JSON types
     }
  }, [previewResult, previewDisplayMode, copyToClipboard]);

  // Function to navigate matches
  const navigateMatches = useCallback((direction: 'next' | 'prev') => {
      if (matchPaths.length <= 0) return;

      let nextIndex;
      if (direction === 'next') {
          nextIndex = (currentMatchIndex + 1) % matchPaths.length;
      } else {
          nextIndex = (currentMatchIndex - 1 + matchPaths.length) % matchPaths.length;
      }

      setCurrentMatchIndex(nextIndex);
      const nextPath = matchPaths[nextIndex].path;
      setJsonPath(nextPath); // Update path input

      // Update preview mode based on the new path's result type
       try {
           const result = evaluateJsonPath(parsedJson, nextPath);
            if (isArray(result)) {
                setPreviewDisplayMode('tree');
            } else {
                 setPreviewDisplayMode('json');
            }
       } catch {
           setPreviewDisplayMode('json');
       }

      scrollToMatch(nextIndex); // Scroll to the newly selected match
  }, [matchPaths, currentMatchIndex, scrollToMatch, parsedJson]); // Added parsedJson


  const handleNextMatch = useCallback(() => navigateMatches('next'), [navigateMatches]);
  const handlePrevMatch = useCallback(() => navigateMatches('prev'), [navigateMatches]);

   // Handle Enter key in search input
   const handleSearchKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
       if (event.key === 'Enter') {
           event.preventDefault(); // Prevent form submission if applicable
           if (debouncedSearchTerm) { // Only navigate if there's a search term
                navigateMatches('next');
           }
       }
   }, [debouncedSearchTerm, navigateMatches]);


  const handleExpandAll = useCallback(() => {
      if (parsedJson) {
          setExpandedPaths(getAllExpandablePaths(parsedJson));
      }
  }, [parsedJson]);

  const handleCollapseAll = useCallback(() => {
      // Keep only the root '$' expanded, and potentially the direct children if root is array
      const initialPaths = new Set(['$']);
       if (isArray(parsedJson)) {
            // If root is array, keep direct children paths like $[0], $[1] etc., if they exist
            parsedJson.forEach((_, index) => {
                initialPaths.add(`$[${index}]`); // This assumes root is '$' which might not be strictly true if path starts differently
                 // Maybe more robust: Check if paths like $[0] are actually expandable
                 try {
                     const childPath = `$[${index}]`;
                     const childValue = evaluateJsonPath(parsedJson, childPath);
                     if ((isObject(childValue) && Object.keys(childValue).length > 0) || (isArray(childValue) && childValue.length > 0)) {
                         // initialPaths.add(childPath); // Re-add if expandable? Or just keep '$'? Decide based on desired UX.
                         // Let's stick to just '$' for simplicity of 'Collapse All'
                     }
                 } catch {}
            });
       }
      setExpandedPaths(initialPaths);
      // Scroll back to the top
      scrollAreaRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [parsedJson]); // Add dependency

  const togglePreviewDisplayMode = useCallback(() => {
      setPreviewDisplayMode(prev => prev === 'json' ? 'tree' : 'json');
  }, []);

  const handlePreviewItemDoubleClick = useCallback((item: any) => {
      const textToCopy = typeof item === 'object' ? JSON.stringify(item) : String(item);
      copyToClipboard(textToCopy, "Preview Item");
  }, [copyToClipboard]);

  // Memoize the JsonTreeNode to prevent unnecessary re-renders
  const memoizedJsonTree = useMemo(() => {
      if (parsedJson !== null && error === null) {
           // Ensure root ref exists
           if (!nodeElementRefs.current.has('$')) {
               nodeElementRefs.current.set('$', React.createRef<HTMLDivElement>());
           }
           const rootRef = nodeElementRefs.current.get('$')!;

          return (
              <JsonTreeNode
                  nodeKey="$"
                  value={parsedJson}
                  level={0}
                  path="$"
                  onNodeInteraction={handleNodeInteraction}
                  searchTerm={debouncedSearchTerm}
                  highlightPath={currentMatchIndex >= 0 ? matchPaths[currentMatchIndex].path : undefined}
                  expandedPaths={expandedPaths}
                  elementRef={rootRef} // Pass root ref
                  nodeElementRefs={nodeElementRefs} // Pass the map
              />
          );
      }
      return (
          <div className="text-muted-foreground p-4 text-center">
              {error ? 'Invalid JSON format. Please correct it in Edit mode.' : 'Enter JSON in Edit mode to view the tree.'}
          </div>
      );
  }, [parsedJson, error, handleNodeInteraction, debouncedSearchTerm, currentMatchIndex, matchPaths, expandedPaths]);



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
                        ref={searchInputRef} // Assign ref
                        type="text"
                        placeholder="Search key or value (Enter for next)..." // Updated placeholder
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={handleSearchKeyDown} // Add keydown handler
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
                    {memoizedJsonTree}
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
                placeholder="Enter JSON Path (e.g., $.users[*].name)"
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
                 <Tooltip>
                    <TooltipTrigger asChild>
                         <Button
                            variant="outline"
                            size="icon"
                            onClick={togglePreviewDisplayMode}
                            aria-label="Toggle Preview Display Mode"
                            disabled={error !== null || (!isArray(previewResult) && !isObject(previewResult))} // Disable if not array or object
                         >
                            {previewDisplayMode === 'json' ? <Rows className="h-4 w-4" /> : <Binary className="h-4 w-4" />}
                         </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        {previewDisplayMode === 'json' ? "Show as List" : "Show as JSON"} {/* Updated tooltip */}
                    </TooltipContent>
                </Tooltip>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0 px-4 pb-4">
            <ScrollArea className="h-full border rounded-md p-2 bg-card">
              {error ? (
                <span className="text-destructive">Invalid JSON</span>
              ) : previewResult === undefined ? (
                <span className="text-muted-foreground">Preview will appear here</span>
              ) : previewDisplayMode === 'tree' && (isArray(previewResult) || isObject(previewResult)) ? (
                // Render array/object items as a list for tree-like view
                 <div className="flex flex-col space-y-1">
                    {(isArray(previewResult) ? previewResult : Object.entries(previewResult)).map((item, index) => {
                       const displayValue = isArray(previewResult) ? item : `${item[0]}: ${JSON.stringify(item[1])}`;
                       const key = isArray(previewResult) ? index : item[0];
                       const valueToCopy = isArray(previewResult) ? item : item[1];
                       return (
                           <div
                               key={key}
                               className="text-sm font-mono p-1 rounded hover:bg-muted/50 cursor-pointer break-words" // Added break-words
                               onDoubleClick={() => handlePreviewItemDoubleClick(valueToCopy)}
                           >
                               {typeof displayValue === 'object' ? JSON.stringify(displayValue) : String(displayValue)}
                           </div>
                       );
                    })}
                 </div>
              ) : (
                // Render as JSON string
                <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                  {JSON.stringify(previewResult, null, 2)}
                </pre>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};

export default JsonExplorer;

    