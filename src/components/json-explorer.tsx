
"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ClipboardCopy, Search, Rows, Pencil } from "lucide-react";
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
    }
  }, [jsonInput]); // Only depends on jsonInput

  // Effect for updating preview when path or parsed data changes
  useEffect(() => {
    // If there's a parse error, the error message is already shown or preview cleared by the first effect.
    if (error) {
        // Optionally, explicitly set preview based on error state if needed, but usually clearing is fine.
        // setPreviewResult(`Error in JSON input: ${error}`);
        return;
    }

    if (parsedJson === null) {
        // Handles the initial state or cases where parsing results in null without an error.
        setPreviewResult("");
        return;
    }

    try {
      // Use lodash get for safe access, adjust path for root '$' if needed
      const adjustedPath = jsonPath === '$' ? '' : jsonPath.startsWith('$.') ? jsonPath.substring(2) : jsonPath;
      const result = get(parsedJson, adjustedPath);

      if (result === undefined) {
         setPreviewResult("undefined"); // Indicate that the path is valid but leads to undefined
      } else {
         setPreviewResult(JSON.stringify(result, null, 2)); // Pretty print the result
      }
    } catch (e: any) {
       // This catch might be redundant if lodash 'get' handles most path errors gracefully,
       // but kept for safety against unexpected issues.
       setPreviewResult(`Error accessing path: ${e.message}`);
    }
  }, [jsonPath, parsedJson, error]); // Depends on path, parsed data, and error state


  // Debounce mechanism for search
  useEffect(() => {
    const handler = setTimeout(() => {
      setInternalSearchTerm(searchTerm);
    }, 300); // 300ms debounce delay

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);


  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newJsonInput = event.target.value;
    setJsonInput(newJsonInput);
  };

  const handlePathChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newPath = event.target.value;
    setJsonPath(newPath);
  };


  const handleNodeClick = (path: string, value: any) => {
    // Convert lodash-style path (e.g., features[0]) to JSONPath-like (e.g., $.features[0])
    const jsonPathStyle = path.startsWith('$') ? path : `$.${path}`;
    setJsonPath(jsonPathStyle);
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
