import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { showError } from '@/utils/toast';

type LogData = {
  date: string;
  count: number;
  limit: number;
};

const AutoRunLogDialog = ({ isOpen, onClose, channelId, channelName }) => {
  const [logData, setLogData] = useState<LogData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogData = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);

    try {
      const [configRes, runsRes] = await Promise.all([
        supabase.from('automation_configs').select('config_data').eq('channel_id', channelId).single(),
        supabase.from('automation_runs').select('started_at').eq('channel_id', channelId).eq('trigger_type', 'auto')
      ]);

      if (configRes.error && configRes.error.code !== 'PGRST116') throw configRes.error;
      if (runsRes.error) throw runsRes.error;

      const limit = configRes.data?.config_data?.autoRunCount || 0;
      const runs = runsRes.data || [];

      const runsByDate = runs.reduce((acc, run) => {
        const date = new Date(run.started_at).toLocaleDateString('en-CA'); // YYYY-MM-DD format
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});

      const formattedData = Object.entries(runsByDate)
        .map(([date, count]) => ({
          date,
          count: count as number,
          limit,
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setLogData(formattedData);

    } catch (error) {
      showError(`Không thể tải log chạy tự động: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (isOpen) {
      fetchLogData();
    }
  }, [isOpen, fetchLogData]);

  const getStatusBadge = (count: number, limit: number) => {
    if (limit === 0) {
      return <Badge variant="secondary">Đã tắt</Badge>;
    }
    if (count >= limit) {
      return <Badge className="bg-green-500 hover:bg-green-600 text-white">Hoàn thành</Badge>;
    }
    return <Badge variant="destructive">Chưa đủ</Badge>;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Báo cáo Chạy Tự Động: {channelName}</DialogTitle>
          <DialogDescription>
            Thống kê số lần automation được kích hoạt tự động mỗi ngày.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead className="text-center">Số Lần Đã Chạy</TableHead>
                  <TableHead className="text-right">Trạng Thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logData.length > 0 ? (
                  logData.map((log) => (
                    <TableRow key={log.date}>
                      <TableCell className="font-medium">{new Date(log.date).toLocaleDateString('vi-VN')}</TableCell>
                      <TableCell className="text-center">{log.count} / {log.limit > 0 ? log.limit : 'N/A'}</TableCell>
                      <TableCell className="text-right">{getStatusBadge(log.count, log.limit)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center">
                      Không có dữ liệu chạy tự động cho kênh này.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AutoRunLogDialog;