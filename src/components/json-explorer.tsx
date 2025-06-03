
"use client";

import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
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
type PreviewDisplayMode = "tree" | "json";

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

    // Handle simple $..keyName case START
    if (path.startsWith('$..')) {
        const keyToFind = path.substring(3);
        // Check if keyToFind is a simple identifier (no dots, no brackets, not empty)
        if (keyToFind && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(keyToFind)) {
            const foundValues: any[] = [];
            // Inner recursive function to find values
            function findValuesRecursively(currentValue: any) {
                if (isArray(currentValue)) {
                    currentValue.forEach(item => findValuesRecursively(item));
                } else if (isObject(currentValue)) { // isObject checks for null and not array
                    if (keyToFind in currentValue) {
                        foundValues.push(currentValue[keyToFind]);
                    }
                    // Important: Recurse on values even if key is found at current level,
                    // as `..` means any descendant.
                    Object.values(currentValue).forEach(val => findValuesRecursively(val));
                }
            }

            findValuesRecursively(data); // Start search from the root data

            if (foundValues.length === 0) return undefined;
            // If multiple distinct values are found, JSONPath would return an array.
            // If a single value is found, often it's returned directly.
            // Ensure single-item arrays from recursive descent are not flattened unless it's the only distinct value.
            // This behavior is closer to some JSONPath implementations.
            // However, for $..theme where theme is unique, returning the value directly is common.
            // If multiple objects had "theme":"light" and "theme":"dark", it would be ["light", "dark"].
            // If one object had "theme":["light", "dark"], it would be [["light", "dark"]].
            // The current logic might need adjustment based on desired specificity for $.. on arrays vs single values.
            // For now, matching existing simple $.. behavior:
            return foundValues.length === 1 && !isArray(foundValues[0]) ? foundValues[0] : foundValues;
        }
    }
    // Handle simple $..keyName case END

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
              if (segments.length > 0 && !segments[segments.length - 1].startsWith('[')) {
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
const findMatches = (value: any, searchTerm: string, currentPath: string, results: { path: string }[], elementRefs: React.MutableRefObject<Map<string, React.RefObject<HTMLDivElement>>>): void => {
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


            // Check if key matches
            if (regex.test(key)) {
                 // Avoid duplicates
                 if (!results.some(r => r.path === newPath)) {
                    results.push({ path: newPath });
                 }
            }

            // Check if primitive value matches
             // Only test primitives, null, or empty strings
            if ((!isObject(childValue) && !isArray(childValue)) || childValue === null) {
                const stringValue = String(childValue); // Convert null or primitives to string
                if (regex.test(stringValue)) {
                    // Avoid duplicates and only add if path is not already added via key match
                     if (!results.some(r => r.path === newPath)) {
                         results.push({ path: newPath });
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
    const isExpandableNode = (isObject(value) && Object.keys(value).length > 0) || (isArray(value) && value.length > 0);

    if (isExpandableNode) {
        paths.add(currentPath); // Add current path if it's an expandable node
        if (isObject(value) && !isArray(value)) { // Check it's an object, not an array
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
              if (segments.length > 0 && !segments[segments.length - 1].startsWith('[')) {
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
  const [matchPaths, setMatchPaths] = useState<{ path: string }[]>([]); // Only store paths
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['$'])); // State for expanded paths
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const nodeElementRefs = useRef<Map<string, React.RefObject<HTMLDivElement>>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null); // Ref for the search input
  const isScrollingRef = useRef<number | null>(null); // Track scroll timeout ID
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);


  // Effect for parsing JSON
  useEffect(() => {
    if (!isClient) return;
    try {
      const parsed = JSON.parse(jsonInput);
      setParsedJson(parsed);
      setError(null);
      setExpandedPaths(new Set(['$'])); // Reset expansion on new JSON
      nodeElementRefs.current = new Map(); // Reset refs
      // Set initial preview mode based on root type
      setPreviewDisplayMode(isArray(parsed) || isObject(parsed) ? 'tree' : 'json'); // Default to tree if object/array
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
  }, [jsonInput, isClient]);

 // Effect for updating preview using the custom path evaluation
 useEffect(() => {
    if (!isClient || error || parsedJson === null) {
        setPreviewResult(undefined);
        return;
    }
    try {
        const result = evaluateJsonPath(parsedJson, jsonPath);
        setPreviewResult(result);
        if (!isArray(result) && !isObject(result)) {
            setPreviewDisplayMode('json');
        } else {
             setPreviewDisplayMode(prev => (isArray(result) || isObject(result)) ? ( prev === 'json' ? 'tree' : prev) : 'tree');
        }

    } catch (e: any) {
        setPreviewResult(`Error accessing path: ${e.message}`);
        setPreviewDisplayMode('json'); // Reset on error
    }
}, [jsonPath, parsedJson, error, isClient]);


  // Debounce search term
  useEffect(() => {
    if (!isClient) return;
    const handler = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(handler);
  }, [searchTerm, isClient]);


   // Scroll to the current match element
    const scrollToMatch = useCallback((matchIndex: number, pathsToUse: { path: string }[]) => {
        if (matchIndex < 0 || matchIndex >= pathsToUse.length || viewMode !== 'tree') {
            return;
        }

        if (isScrollingRef.current) {
            clearTimeout(isScrollingRef.current);
        }

        const currentMatchPath = pathsToUse[matchIndex]?.path;
        if (!currentMatchPath) return;

        setExpandedPaths(prevPaths => {
            const ancestors = getAncestorPaths(currentMatchPath);
            const newPaths = new Set(prevPaths);
            ancestors.forEach(path => newPaths.add(path));
            
            requestAnimationFrame(() => {
                const targetElementRef = nodeElementRefs.current.get(currentMatchPath);
                const element = targetElementRef?.current;
                if (element && scrollAreaRef.current?.contains(element)) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    isScrollingRef.current = window.setTimeout(() => { isScrollingRef.current = null; }, 400);
                } else {
                    requestAnimationFrame(() => {
                        const elementAgain = nodeElementRefs.current.get(currentMatchPath)?.current;
                        if (elementAgain && scrollAreaRef.current?.contains(elementAgain)) {
                             elementAgain.scrollIntoView({ behavior: 'smooth', block: 'center' });
                             isScrollingRef.current = window.setTimeout(() => { isScrollingRef.current = null; }, 400);
                        } else {
                           isScrollingRef.current = window.setTimeout(() => { isScrollingRef.current = null; }, 50); 
                        }
                    });
                }
            });
            return newPaths;
        });

    }, [viewMode, nodeElementRefs]);


    // Effect for performing search and setting initial state
    useEffect(() => {
        if (!isClient || parsedJson === null || error) {
            setMatchPaths([]);
            setCurrentMatchIndex(-1);
            return;
        }

        const results: { path: string }[] = [];
        if (!nodeElementRefs.current) {
            nodeElementRefs.current = new Map();
        }
        findMatches(parsedJson, debouncedSearchTerm, '$', results, nodeElementRefs);


        if (!debouncedSearchTerm) {
            setMatchPaths([]);
            setCurrentMatchIndex(-1);
            return; 
        }

        results.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
        
        setMatchPaths(results);
        const firstMatchIndex = results.length > 0 ? 0 : -1;
        setCurrentMatchIndex(firstMatchIndex);


        if (firstMatchIndex !== -1 && results[firstMatchIndex]) {
            const firstMatchPath = results[firstMatchIndex].path;
            if (jsonPath !== firstMatchPath) {
                 setJsonPath(firstMatchPath); 
            }
            
            if (!isScrollingRef.current) {
                 scrollToMatch(firstMatchIndex, results);
            }

        } else {
            if (searchTerm && debouncedSearchTerm === searchTerm) { 
                toast({
                    title: "Search",
                    description: "No matches found.",
                    variant: "default",
                    duration: 3000
                });
            }
        }
    }, [isClient, debouncedSearchTerm, parsedJson, error, toast, searchTerm, scrollToMatch, jsonPath]); 


  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonInput(event.target.value);
    setSearchTerm("");
    setMatchPaths([]);
    setCurrentMatchIndex(-1);
    setJsonPath("$"); 
  };

  const handlePathChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newPath = event.target.value;
    setJsonPath(newPath);
    try {
        if (parsedJson) { 
            const result = evaluateJsonPath(parsedJson, newPath);
            if (isArray(result) || isObject(result)) {
                setPreviewDisplayMode(prev => prev === 'json' && (isArray(result) || isObject(result)) ? 'tree' : prev);
            } else {
                setPreviewDisplayMode('json');
            }
        } else {
             setPreviewDisplayMode('json'); 
        }
    } catch {
        setPreviewDisplayMode('json'); 
    }
  };

  const handleNodeInteraction = useCallback((path: string, value: any, isToggle: boolean) => {
    if (isToggle) {
        setExpandedPaths(prevPaths => {
            const newPaths = new Set(prevPaths);
            if (newPaths.has(path)) {
                newPaths.delete(path);
            } else {
                 const canExpand = (isObject(value) && Object.keys(value).length > 0) || (isArray(value) && value.length > 0);
                 if (canExpand) {
                    newPaths.add(path);
                 }
            }
            return newPaths;
        });
    } else {
        setJsonPath(path);
         if (isArray(value) || isObject(value)) {
             setPreviewDisplayMode(prev => prev === 'json' ? 'tree' : prev);
         } else {
             setPreviewDisplayMode('json');
         }
    }
  }, []);


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
         } else if (previewDisplayMode === 'tree' && (isArray(previewResult) || isObject(previewResult))) {
             if (isArray(previewResult)) {
                 textToCopy = previewResult.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join('\n');
             } else { 
                 textToCopy = Object.entries(previewResult).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`).join('\n');
             }
         } else {
             textToCopy = JSON.stringify(previewResult, null, 2);
         }
         copyToClipboard(textToCopy, "Preview Result");
     } catch (e) {
         copyToClipboard(String(previewResult), "Preview Result (Raw)"); 
     }
  }, [previewResult, previewDisplayMode, copyToClipboard]);

  const navigateMatches = useCallback((direction: 'next' | 'prev') => {
      if (matchPaths.length <= 0 || isScrollingRef.current) return; 

      let nextIndex;
      if (direction === 'next') {
          nextIndex = (currentMatchIndex + 1) % matchPaths.length;
      } else {
          nextIndex = (currentMatchIndex - 1 + matchPaths.length) % matchPaths.length;
      }

      const nextPath = matchPaths[nextIndex]?.path;
      if (!nextPath) return;

      setCurrentMatchIndex(nextIndex);
      if (jsonPath !== nextPath) {
        setJsonPath(nextPath); 
      }
      

       try {
           if(parsedJson) {
            const result = evaluateJsonPath(parsedJson, nextPath);
                if (isArray(result) || isObject(result)) {
                    setPreviewDisplayMode(prev => prev === 'json' && (isArray(result) || isObject(result)) ? 'tree' : prev);
                } else {
                    setPreviewDisplayMode('json');
                }
           } else {
                setPreviewDisplayMode('json');
           }
       } catch {
           setPreviewDisplayMode('json');
       }
       scrollToMatch(nextIndex, matchPaths);
  }, [matchPaths, currentMatchIndex, scrollToMatch, parsedJson, jsonPath]);


  const handleNextMatch = useCallback(() => navigateMatches('next'), [navigateMatches]);
  const handlePrevMatch = useCallback(() => navigateMatches('prev'), [navigateMatches]);

   const handleSearchKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
       if (event.key === 'Enter') {
           event.preventDefault(); 
           if (debouncedSearchTerm && matchPaths.length > 0) { 
                navigateMatches('next');
           } else if (debouncedSearchTerm && matchPaths.length === 0) {
                toast({
                    title: "Search",
                    description: "No matches found.",
                    variant: "default",
                    duration: 3000
                });
           }
       }
   }, [debouncedSearchTerm, navigateMatches, matchPaths, toast]);


  const handleExpandAll = useCallback(() => {
      if (parsedJson) {
          const allPaths = getAllExpandablePaths(parsedJson);
          setExpandedPaths(allPaths);
      }
  }, [parsedJson]);

  const handleCollapseAll = useCallback(() => {
      const initialPaths = new Set(['$']);
      if (parsedJson && ((isArray(parsedJson) && parsedJson.length > 0) || (isObject(parsedJson) && Object.keys(parsedJson).length > 0))) {
        // No specific action needed here other than setting expandedPaths
      }
      setExpandedPaths(initialPaths);
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
  }, [parsedJson]);

  const togglePreviewDisplayMode = useCallback(() => {
      if (isArray(previewResult) || isObject(previewResult)) {
        setPreviewDisplayMode(prev => prev === 'json' ? 'tree' : 'json');
      }
  }, [previewResult]);

  const handlePreviewItemDoubleClick = useCallback((item: any) => {
      const textToCopy = typeof item === 'object' ? JSON.stringify(item, null, 2) : String(item);
      copyToClipboard(textToCopy, "Preview Item");
  }, [copyToClipboard]);


  const MemoizedJsonTreeNode = React.memo(JsonTreeNode);

   const renderTree = useCallback((value: any, level: number, currentPath: string) => {
       if (currentPath === '$' && !nodeElementRefs.current.has('$')) {
           nodeElementRefs.current.set('$', React.createRef<HTMLDivElement>());
       }
       const getElementRef = (path: string) => {
           if (!nodeElementRefs.current.has(path)) {
               nodeElementRefs.current.set(path, React.createRef<HTMLDivElement>());
           }
           return nodeElementRefs.current.get(path)!;
       };

       return (
           <MemoizedJsonTreeNode
               nodeKey={currentPath === '$' ? (isArray(value) ? '[]' : '{}') : currentPath.split('.').pop()?.split('[').shift() ?? ''}
               value={value}
               level={level}
               path={currentPath}
               onNodeInteraction={handleNodeInteraction}
               searchTerm={debouncedSearchTerm}
               highlightPath={currentMatchIndex >= 0 && matchPaths[currentMatchIndex] ? matchPaths[currentMatchIndex].path : undefined}
               expandedPaths={expandedPaths}
               getElementRef={getElementRef} 
           />
       );
   }, [handleNodeInteraction, debouncedSearchTerm, currentMatchIndex, matchPaths, expandedPaths]);

  if (!isClient) {
    return (
        <div className="flex flex-col md:flex-row h-screen p-4 gap-4 bg-background items-center justify-center">
            <p>Loading JSON Explorer...</p>
        </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col md:flex-row h-screen p-4 gap-4 bg-background">
        {/* Left Panel */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex justify-between items-center mb-2">
                <CardTitle className="text-lg">JSON Input / Tree View</CardTitle>
                <div className="flex items-center space-x-1">
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
                                        <ChevronsUpDown suppressHydrationWarning className="h-4 w-4" />
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
                                        <ChevronsDownUp suppressHydrationWarning className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Collapse All</TooltipContent>
                            </Tooltip>
                         </>
                     )}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={viewMode === 'tree' ? 'secondary': 'ghost'}
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setViewMode('tree')}
                                disabled={error !== null || parsedJson === null}
                                aria-label="Switch to Tree View"
                            >
                                <Rows suppressHydrationWarning className="h-4 w-4" />
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
                                <Pencil suppressHydrationWarning className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit JSON</TooltipContent>
                    </Tooltip>
                </div>
            </div>
             {viewMode === 'tree' && !error && parsedJson !== null && (
                <div className="flex items-center space-x-2">
                    <Search suppressHydrationWarning className="h-4 w-4 text-muted-foreground" />
                    <Input
                        ref={searchInputRef} 
                        type="text"
                        placeholder="Search key or value (Enter for next)..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={handleSearchKeyDown} 
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
                                disabled={matchPaths.length <= 1 || !!isScrollingRef.current}
                                aria-label="Previous match"
                            >
                               <ChevronLeft suppressHydrationWarning className="h-4 w-4" />
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
                                disabled={matchPaths.length <= 1 || !!isScrollingRef.current}
                                aria-label="Next match"
                            >
                               <ChevronRight suppressHydrationWarning className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Next Match</TooltipContent>
                    </Tooltip>
                </div>
             )}
          </CardHeader>
          <CardContent className="flex-1 flex flex-col overflow-hidden p-0 px-4 pb-4">
            {viewMode === 'edit' ? (
                 <Textarea
                    value={jsonInput}
                    onChange={handleInputChange}
                    placeholder="Paste your JSON here"
                    className="flex-1 resize-none font-mono text-sm bg-card border rounded-md p-2"
                    aria-label="JSON Input"
                />
            ) : (
                 <ScrollArea className="flex-1 border rounded-md p-2 bg-card" viewportRef={scrollAreaRef} suppressHydrationWarning>
                     {parsedJson !== null && error === null ? (
                        renderTree(parsedJson, 0, '$')
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
                placeholder="Enter JSON Path (e.g., $.users[*].name)"
                className="flex-1 font-mono text-sm h-10"
                aria-label="JSON Path Input"
                disabled={error !== null || parsedJson === null}
              />
                <Tooltip>
                    <TooltipTrigger asChild>
                         <Button
                            variant="outline"
                            size="icon"
                            onClick={handleCopy}
                            onContextMenu={handleContextMenuCopy}
                            aria-label="Copy Path or Result"
                            disabled={error !== null || parsedJson === null}
                         >
                           <ClipboardCopy suppressHydrationWarning className="h-4 w-4" />
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
                            disabled={error !== null || parsedJson === null || (!isArray(previewResult) && !isObject(previewResult))} 
                         >
                            {previewDisplayMode === 'json' ? <Rows suppressHydrationWarning className="h-4 w-4" /> : <Binary suppressHydrationWarning className="h-4 w-4" />}
                         </Button>
                    </TooltipTrigger>
                     <TooltipContent side="bottom">
                         {previewDisplayMode === 'tree' && (isArray(previewResult) || isObject(previewResult)) ? "Show as JSON" : "Show as Tree"}
                     </TooltipContent>
                </Tooltip>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0 px-4 pb-4">
            <ScrollArea className="h-full border rounded-md p-2 bg-card" suppressHydrationWarning>
              {error ? (
                <span className="text-destructive">Invalid JSON</span>
              ) : parsedJson === null ? (
                 <span className="text-muted-foreground">Enter valid JSON in the input panel</span>
              ) : previewResult === undefined && jsonPath ? (
                <span className="text-muted-foreground">No data found for path: {jsonPath}</span>
              ) : previewResult === undefined ? (
                <span className="text-muted-foreground">Preview will appear here</span>
              ) : previewDisplayMode === 'tree' && (isArray(previewResult) || isObject(previewResult)) ? (
                 <div className="flex flex-col space-y-1">
                    {(isArray(previewResult) ? previewResult : Object.entries(previewResult)).map((item, index) => {
                       const displayKey = isArray(previewResult) ? index : item[0];
                       const displayValue = isArray(previewResult) ? item : item[1];
                       const textValue = isArray(previewResult)
                            ? (typeof item === 'object' ? JSON.stringify(item) : String(item))
                            : `${item[0]}: ${typeof item[1] === 'object' ? JSON.stringify(item[1]) : String(item[1])}`;

                       const reactKey = `${jsonPath}-${displayKey}-${index}-${Date.now()}`; // Add timestamp for more unique key

                       return (
                           <div
                               key={reactKey}
                               className="text-sm font-mono p-1 rounded hover:bg-muted/50 cursor-pointer break-words"
                               onDoubleClick={() => handlePreviewItemDoubleClick(displayValue)}
                           >
                               {textValue}
                           </div>
                       );
                    })}
                 </div>
              ) : (
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

