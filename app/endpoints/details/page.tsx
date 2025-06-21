"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  Badge
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faRotateRight, faTrash, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { useRouter, useSearchParams } from "next/navigation";
import { addToast } from "@heroui/toast";
import { buildApiUrl } from "@/lib/utils";
import { LogViewer, LogEntry } from "@/components/ui/log-viewer";

export default function EndpointDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const endpointId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [recycleCount, setRecycleCount] = useState<number>(0);

  const logCounterRef = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, []);

  // 获取日志数据
  const fetchLogs = useCallback(async () => {
    if (!endpointId) return;

    try {
      setLoading(true);
      const res = await fetch(buildApiUrl(`/api/endpoints/${endpointId}/logs?limit=1000`));
      if (!res.ok) throw new Error("获取日志失败");
      const data = await res.json();

      const list: LogEntry[] = (data.logs || data.data?.logs || []).map((item: any, idx: number) => ({
        id: idx + 1,
        message: item.message ?? "",
        isHtml: true,
        timestamp: item.timestamp ? new Date(item.timestamp) : null,
      }));

      logCounterRef.current = list.length;
      setLogs(list);

      // 页面更新后滚动底部
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error(err);
      addToast({ title: "加载失败", description: err instanceof Error ? err.message : "未知错误", color: "danger" });
    } finally {
      setLoading(false);
    }
  }, [endpointId, scrollToBottom]);

  // 获取回收站数量
  const fetchRecycleCount = useCallback(async()=>{
    if(!endpointId) return;
    try{
      const res = await fetch(buildApiUrl(`/api/endpoints/${endpointId}/recycle/count`));
      if(!res.ok) throw new Error("获取回收站数量失败");
      const data = await res.json();
      setRecycleCount(data.count || 0);
    }catch(e){ console.error(e); }
  },[endpointId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchRecycleCount();
  }, [fetchRecycleCount]);

  // 滚动效果
  useEffect(() => {
    if (logs.length > 0) {
      setTimeout(scrollToBottom, 50);
    }
  }, [logs, scrollToBottom]);

  // 手动刷新
  const handleRefresh = useCallback(async () => {
    if (refreshLoading) return;
    setRefreshLoading(true);
    await fetchLogs();
    setRefreshLoading(false);
  }, [refreshLoading, fetchLogs]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 顶部返回按钮 */}
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Button isIconOnly variant="flat" size="sm" onClick={() => router.back()} className="bg-default-100 hover:bg-default-200 dark:bg-default-100/10 dark:hover:bg-default-100/20">
            <FontAwesomeIcon icon={faArrowLeft} />
          </Button>
          <h1 className="text-lg md:text-2xl font-bold truncate">主控日志</h1>
        </div>
        <div className="flex items-center gap-2">
        <Button 
            variant="light"
            isDisabled={refreshLoading}
            className="bg-default-100 hover:bg-default-200 dark:bg-default-100/10 dark:hover:bg-default-100/20"
            startContent={
              <FontAwesomeIcon 
                icon={faRotateRight} 
                className={refreshLoading ? "animate-spin" : ""}
              />
            }
            onPress={handleRefresh}
              >
              {refreshLoading ? "刷新中..." : "刷新"}
          </Button>
        {/* 回收站按钮 */}
        <Button
          isIconOnly
          color="danger"
          variant="light"
          className="relative bg-default-100 hover:bg-default-200 dark:bg-default-100/10 dark:hover:bg-default-100/20"
          onPress={()=>router.push(`/endpoints/recycle?id=${endpointId}`)}
        >
          <Badge color="danger" size="sm"  content={recycleCount?recycleCount:0} className="absolute -top-1 -right-1 pointer-events-none">
            <FontAwesomeIcon icon={faTrash} />
          </Badge>
        </Button>

        {/* 日志查询按钮 */}
        <Button
          isIconOnly
          color="primary"
          onPress={()=>router.push(`/endpoints/log?id=${endpointId}`)}
        >
          <FontAwesomeIcon icon={faMagnifyingGlass} />
        </Button>
        </div>
      </div>

      {/* 日志区域 */}
      <Card>
        <CardBody>
          <LogViewer logs={logs} loading={loading} heightClass="h-[550px] md:h-[900px]" containerRef={logContainerRef} />
        </CardBody>
      </Card>
    </div>
  );
} 