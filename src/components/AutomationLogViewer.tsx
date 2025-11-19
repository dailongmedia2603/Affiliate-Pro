import React, { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

type AutomationRunLog = {
  id: string;
  timestamp: string;
  message: string;
  level: string;
};

const AutomationLogViewer = ({ logs }: { logs: AutomationRunLog[] }) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('div');
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [logs]);

  const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR': return 'bg-red-500 hover:bg-red-600';
      case 'SUCCESS': return 'bg-green-500 hover:bg-green-600';
      case 'WARN': return 'bg-yellow-500 hover:bg-yellow-600 text-black';
      default: return 'bg-blue-500 hover:bg-blue-600';
    }
  };

  return (
    <ScrollArea className="h-72 w-full rounded-md border bg-gray-900 text-white font-mono text-xs" ref={scrollAreaRef}>
        <div className="p-4">
            {logs.map(log => (
            <div key={log.id} className="flex items-start gap-3 mb-1.5">
                <span className="text-gray-500 select-none">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <Badge className={`px-1.5 py-0 text-xs text-white ${getLevelColor(log.level)}`}>{log.level}</Badge>
                <p className="flex-1 whitespace-pre-wrap break-words text-gray-300">{log.message}</p>
            </div>
            ))}
        </div>
    </ScrollArea>
  );
};

export default AutomationLogViewer;