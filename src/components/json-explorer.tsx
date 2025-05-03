"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Copy, ClipboardCopy, Search, Rows, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import JsonTreeNode from "./json-tree-node";
import { get } from 'lodash-es'; // Using lodash get for safe path access

type ViewMode = "tree" | "edit";

// Example JSON for initial state
const exampleJson = `{
  "name": "JSON Explorer",
  "version": "1.0.0",
  "description": "A tool to explore JSON data.",
  "author": "AI",
  "features": [
    "JSON Input",
    "Tree View",
    "Path Preview"
  ],
  "settings": {
    "theme": "light",
    "fontSize": 14,
    "isValid": true,
    "nested": {
      "level1": {
        "level2": {
          "value": null
        }
      }
    }
  }
}`;


const JsonExplorer: React.FC = () => {
  const [jsonInput, setJsonInput] = useState<string>(exampleJson);
  const [parsedJson, setParsedJson] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonPath, setJsonPath] = useState<string>("$"); // Default to root
  const [previewResult, setPreviewResult] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [internalSearchTerm, setInternalSearchTerm] = useState<string>(""); // For debounced search
  const { toast } = useToast();

  const parseJson = useCallback((input: string) => {
    try {
      const parsed = JSON.parse(input);
      setParsedJson(parsed);
      setError(null);
      // Update preview if path is already set
      updatePreview(jsonPath, parsed);
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
      setParsedJson(null);
      setPreviewResult(""); // Clear preview on error
    }
  }, [jsonPath]); // Added jsonPath dependency

  // Debounce mechanism for search
  useEffect(() => {
    const handler = setTimeout(() => {
      setInternalSearchTerm(searchTerm);
    }, 300); // 300ms debounce delay

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  // Initial parse and update preview
  useEffect(() => {
    parseJson(jsonInput);
    updatePreview(jsonPath, parsedJson); // Ensure preview updates if jsonPath changes initially
  }, [jsonInput, jsonPath, parseJson, parsedJson]); // Added parsedJson dependency

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newJsonInput = event.target.value;
    setJsonInput(newJsonInput);
    // No need to parse here, useEffect handles it
  };

  const handlePathChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newPath = event.target.value;
    setJsonPath(newPath);
    // No need to update preview here, useEffect handles it
  };

  const updatePreview = (path: string, data: any) => {
    if (!data) {
      setPreviewResult("");
      return;
    }
    try {
      // Use lodash get for safe access, adjust path for root '$' if needed
      const adjustedPath = path === '$' ? '' : path.startsWith('$.') ? path.substring(2) : path;
      const result = get(data, adjustedPath);

      if (result === undefined) {
         setPreviewResult("undefined");
      } else {
         setPreviewResult(JSON.stringify(result, null, 2)); // Pretty print the result
      }
    } catch (e: any) {
       setPreviewResult(`Error accessing path: ${e.message}`);
    }
  };


  const handleNodeClick = (path: string, value: any) => {
    // Convert lodash-style path (e.g., features[0]) to JSONPath-like (e.g., $.features[0])
    const jsonPathStyle = path.startsWith('$') ? path : `$.${path}`;
    setJsonPath(jsonPathStyle);
    // updatePreview is called by useEffect due to jsonPath change
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
                            >
                                <Pencil className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit JSON</TooltipContent>
                    </Tooltip>
                </div>
            </div>
             {viewMode === 'tree' && (
                <div className="flex items-center space-x-2">
                    <Input
                    type="text"
                    placeholder="Search in tree..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 text-sm font-mono"
                    />
                    <Button variant="outline" size="icon" className="h-8 w-8">
                       <Search className="h-4 w-4" />
                    </Button>
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
                <ScrollArea className="flex-1 border rounded-md p-2 bg-card">
                    {parsedJson !== null ? (
                         <JsonTreeNode
                            nodeKey="$" // Root node key
                            value={parsedJson}
                            level={0}
                            path="$"
                            onNodeClick={handleNodeClick}
                            searchTerm={internalSearchTerm} // Use debounced term
                            isInitiallyExpanded={true}
                        />
                    ) : (
                        <div className="text-muted-foreground p-4 text-center">
                            {error ? 'Invalid JSON' : 'Paste JSON in Edit mode to view the tree.'}
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
                placeholder="Enter JSON Path (e.g., $.users[0].name)"
                className="flex-1 font-mono text-sm h-10"
                aria-label="JSON Path Input"
              />
                <Tooltip>
                    <TooltipTrigger asChild>
                         <Button
                            variant="outline"
                            size="icon"
                            onClick={handleCopy}
                            onContextMenu={handleContextMenuCopy}
                            aria-label="Copy Path or Result"
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
                {previewResult || <span className="text-muted-foreground">Preview will appear here</span>}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};

export default JsonExplorer;
