import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, FileClock, CheckCircle, XCircle } from 'lucide-react';
import { showError } from '@/utils/toast';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';

const SettingsLogViewer = ({ logType, buttonTitle }) => {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const logTableMap = {
    dream_act: 'dream_act_logs',
    veo3: 'veo3_logs',
  };

  const tableName = logTableMap[logType];

  const fetchLogs = useCallback(async () => {
    if (!tableName) return;
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showError("Bạn cần đăng nhập để xem logs.");
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('user_id', user.id)
      .is('task_id', null) // Only fetch logs without a task_id, like connection tests
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) {
      showError(`Không thể tải logs: ${error.message}`);
    } else {
      setLogs(data);
    }
    setIsLoading(false);
  }, [tableName]);

  const handleOpen = () => {
    setIsOpen(true);
    fetchLogs();
  };

  return (
    <>
      <Button variant="outline" onClick={handleOpen}>
        <FileClock className="w-4 h-4 mr-2" />
        {buttonTitle || 'Xem Logs'}
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Logs API: {logType.toUpperCase()}</DialogTitle>
            <DialogDescription>
              Hiển thị 20 logs gần nhất cho các cuộc gọi API không liên quan đến tác vụ cụ thể (ví dụ: kiểm tra kết nối).
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-[70vh] overflow-y-auto p-1">
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
            ) : logs.length > 0 ? (
              <Accordion type="multiple" className="w-full space-y-2">
                {logs.map(log => (
                  <AccordionItem key={log.id} value={log.id} className="border rounded-md bg-gray-50/50">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex justify-between w-full items-center pr-4">
                        <div className="flex items-center gap-3">
                          {log.is_error ? <XCircle className="w-5 h-5 text-red-500" /> : <CheckCircle className="w-5 h-5 text-green-500" />}
                          <span className="font-semibold text-md text-gray-800">{log.step_name}</span>
                        </div>
                        <span className="text-xs font-normal text-gray-500">{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pt-0 pb-4">
                      {log.request_payload?._dyad_target_url && (
                        <div className="mb-2 text-xs text-gray-500 font-mono">
                          <span className="font-semibold text-gray-600">Endpoint Called:</span> {log.request_payload._dyad_target_url}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4 border-t pt-4">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Request Payload:</p>
                          <pre className="text-xs bg-gray-800 text-gray-200 p-2 rounded-md overflow-auto mt-1 h-48">
                            {JSON.stringify(
                              Object.fromEntries(Object.entries(log.request_payload || {}).filter(([key]) => key !== '_dyad_target_url')),
                              null,
                              2
                            )}
                          </pre>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">API Response:</p>
                          <pre className={`text-xs p-2 rounded-md overflow-auto mt-1 h-48 ${log.is_error ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>{JSON.stringify(log.response_data, null, 2)}</pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <p className="text-center text-gray-500 py-8">Không có logs nào.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SettingsLogViewer;