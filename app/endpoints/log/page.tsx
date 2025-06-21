"use client";
import { Button, Input, Select, SelectItem, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Spinner, DateRangePicker, Pagination, Badge } from "@heroui/react";
import { useSearchParams, useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faSearch, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useState, useEffect, useCallback } from "react";
import { buildApiUrl } from "@/lib/utils";

interface LogItem {
  id:number;
  createAt:string;
  level:string;
  instanceId:string;
  message:string;
}

export default function LogQueryPage(){
  const router=useRouter();
  const searchParams=useSearchParams();
  const endpointId=searchParams.get("id");

  const [level,setLevel]=useState<string>("all");
  const [instanceId,setInstanceId]=useState<string>("");
  const [range,setRange]=useState<{start:any,end:any}>({start:undefined,end:undefined});
  const [items,setItems]=useState<LogItem[]>([]);
  const [total,setTotal]=useState(0);
  const [totalPages,setTotalPages]=useState(0);
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize] = useState(20);
  const [loading,setLoading]=useState(false);
  const [recycleCount,setRecycleCount] = useState(0);

  const formatDate=(d:any)=>{
    if(!d) return "";
    const pad=(n:number)=>n.toString().padStart(2,"0");
    // 处理 CalendarDate / DateValue 对象
    if(typeof d === "object" && "year" in d && "month" in d && "day" in d){
      return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
    }
    const date = d instanceof Date ? d : new Date(d);
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  };

  const fetchData=useCallback(async(p:number = page)=>{
    if(!endpointId) return;
    try{
      setLoading(true);
      const params=new URLSearchParams();
      if(level!=="all") params.append("level",level);
      if(instanceId) params.append("instanceId",instanceId);
      if(range.start) params.append("start",formatDate(range.start));
      if(range.end) params.append("end",formatDate(range.end));
      params.append("page",String(p));
      params.append("size",String(pageSize));
      const res=await fetch(buildApiUrl(`/api/endpoints/${endpointId}/logs/search?`+params.toString()));
      const data=await res.json();
      const processed=(data.logs||[]).map((item:any)=>{
        const rawMsg=item.message||"";
        const idx=rawMsg.indexOf("[0m");
        const cleanMsg=idx!==-1?rawMsg.slice(idx+3):rawMsg;
        return { ...item, message: cleanMsg };
      });
      setItems(processed);
      setTotal(data.total||0);
      if(data.totalPages){ setTotalPages(data.totalPages); }
      if(data.size){ setPageSize(data.size); }
    }catch(e){console.error(e);}finally{setLoading(false);}  
  },[endpointId,level,instanceId,range,pageSize,page]);

  // 首次加载
  useEffect(()=>{ fetchData(1); setPage(1); },[fetchData]);

  // 获取回收站数量
  useEffect(()=>{
    const fetchRecycle = async()=>{
      if(!endpointId) return;
      try{
        const res = await fetch(buildApiUrl(`/api/endpoints/${endpointId}/recycle/count`));
        const data = await res.json();
        setRecycleCount(data.count||0);
      }catch(e){console.error(e);}  
    };
    fetchRecycle();
  },[endpointId]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 justify-between">
      <div className="flex items-center gap-3">
          <Button isIconOnly variant="flat" size="sm" onClick={() => router.back()} className="bg-default-100 hover:bg-default-200 dark:bg-default-100/10 dark:hover:bg-default-100/20">
            <FontAwesomeIcon icon={faArrowLeft} />
          </Button>
          <h1 className="text-lg md:text-2xl font-bold truncate">日志查询</h1>
        </div>
      </div>
      {/* 查询表单 */}
      <div className="flex flex-wrap md:flex-nowrap items-end gap-2">
        {/* 日期范围选择 */}
        {/* @ts-ignore hero-ui DateRangePicker 类型未完善 */}
        <DateRangePicker locale="zh-CN" value={range} onChange={(v:any)=>setRange(v)} />
        <Select selectedKeys={[level]} onSelectionChange={(keys)=>setLevel(Array.from(keys)[0] as string)} >
          <SelectItem key="all">全部级别</SelectItem>
          <SelectItem key="debug">Debug</SelectItem>
          <SelectItem key="info">Info</SelectItem>
          <SelectItem key="warn">Warn</SelectItem>
          <SelectItem key="error">Error</SelectItem>
        </Select>
        <Input  value={instanceId} onValueChange={setInstanceId}  placeholder="实例ID" />
        <Button color="primary" startContent={<FontAwesomeIcon icon={faSearch}/>} onPress={()=>{setPage(1); fetchData(1);}}>查询</Button>
        <Button variant="flat" onPress={()=>{
          setLevel("all");
          setInstanceId("");
          setRange({start:undefined,end:undefined});
          setPage(1);
          fetchData(1);
        }}>重置</Button>
      </div>
      {/* 结果表格 */}
      <Table aria-label="日志列表" >
        <TableHeader>
          <TableColumn>时间</TableColumn>
          <TableColumn>级别</TableColumn>
          <TableColumn>实例ID</TableColumn>
          <TableColumn>日志</TableColumn>
        </TableHeader>
        <TableBody items={items} loadingContent={<Spinner />} isLoading={loading} emptyContent="暂无数据">
          {item=> (
            <TableRow key={item.id}>
              <TableCell className="w-80">{item.createAt}</TableCell>
              <TableCell className="w-24">{item.level}</TableCell>
              <TableCell className="w-40">{item.instanceId}</TableCell>
              <TableCell className="max-w-[600px] truncate" title={item.message}>{item.message}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {/* 分页 */}
      <div className="flex flex-col md:flex-row md:justify-between items-center pt-4 gap-2">
        <span className="text-sm text-default-500">共 {total} 条</span>
        <Pagination
          page={page}
          total={totalPages || Math.ceil(total/pageSize)}
          onChange={(p)=>{setPage(p); fetchData(p);}}
          showControls
        />
      </div>
    </div>
  );
} 