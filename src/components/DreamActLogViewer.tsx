import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Code } from 'lucide-react';
import { showError } from '@/utils/toast';

const DreamActLogViewer = ({ taskId }) => {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('dream_act_logs')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    
    if (error) {
      showError("Không thể tải logs.");
    } else {
      setLogs(data);
    }
    setIsLoading(false);
  };

  const handleOpen = () => {
    setIsOpen(true);
    fetchLogs();
  };

  return (
    <>
      <Button variant="ghost" size="icon" className="w-7 h-7" onClick={handleOpen} title="Xem Logs API">
        <Code className="w-4 h-4" />
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Logs Gọi API</DialogTitle>
            <DialogDescription>Task ID: {taskId}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-[70vh] overflow-y-auto p-1 space-y-4">
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
            ) : logs.length > 0 ? (
              logs.map(log => (
                <div key={log.id} className="border-b pb-4 last:border-b-0">
                  <h4 className="font-semibold text-md text-gray-800 mb-2">{log.step_name} <span className="text-xs font-normal text-gray-500">- {new Date(log.created_at).toLocaleString()}</span></h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Request Payload:</p>
                      <pre className="text-xs bg-gray-800 text-gray-200 p-2 rounded-md overflow-auto mt-1 h-48">{JSON.stringify(log.request_payload, null, 2)}</pre>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">API Response:</p>
                      <pre className={`text-xs p-2 rounded-md overflow-auto mt-1 h-48 ${log.is_error ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>{JSON.stringify(log.response_data, null, 2)}</pre>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">Không có logs cho tác vụ này.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DreamActLogViewer;