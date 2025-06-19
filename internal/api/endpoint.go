package api

import (
	log "NodePassDash/internal/log"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"

	"NodePassDash/internal/endpoint"
	"NodePassDash/internal/sse"
)

// EndpointHandler 端点相关的处理器
type EndpointHandler struct {
	endpointService *endpoint.Service
	sseManager      *sse.Manager
}

// NewEndpointHandler 创建端点处理器实例
func NewEndpointHandler(endpointService *endpoint.Service, mgr *sse.Manager) *EndpointHandler {
	return &EndpointHandler{
		endpointService: endpointService,
		sseManager:      mgr,
	}
}

// HandleGetEndpoints 获取端点列表
func (h *EndpointHandler) HandleGetEndpoints(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	endpoints, err := h.endpointService.GetEndpoints()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "获取端点列表失败: " + err.Error(),
		})
		return
	}

	if endpoints == nil {
		endpoints = []endpoint.EndpointWithStats{}
	}
	json.NewEncoder(w).Encode(endpoints)
}

// HandleCreateEndpoint 创建新端点
func (h *EndpointHandler) HandleCreateEndpoint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req endpoint.CreateEndpointRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 验证请求数据
	if req.Name == "" || req.URL == "" || req.APIPath == "" || req.APIKey == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "缺少必填字段",
		})
		return
	}

	newEndpoint, err := h.endpointService.CreateEndpoint(req)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// 创建成功后，异步启动 SSE 监听
	if h.sseManager != nil && newEndpoint != nil {
		go func(ep *endpoint.Endpoint) {
			log.Infof("[API.%v] 创建成功，准备启动 SSE 监听", ep.ID)
			if err := h.sseManager.ConnectEndpoint(ep.ID, ep.URL, ep.APIPath, ep.APIKey); err != nil {
				log.Errorf("[API.%v] 启动 SSE 监听失败: %v", ep.ID, err)
			}
		}(newEndpoint)
	}

	json.NewEncoder(w).Encode(endpoint.EndpointResponse{
		Success:  true,
		Message:  "端点创建成功",
		Endpoint: newEndpoint,
	})
}

// HandleUpdateEndpoint 更新端点信息 (PUT /api/endpoints/{id})
func (h *EndpointHandler) HandleUpdateEndpoint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的端点ID",
		})
		return
	}

	var body struct {
		Name    string `json:"name"`
		URL     string `json:"url"`
		APIPath string `json:"apiPath"`
		APIKey  string `json:"apiKey"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	req := endpoint.UpdateEndpointRequest{
		ID:      id,
		Action:  "update",
		Name:    body.Name,
		URL:     body.URL,
		APIPath: body.APIPath,
		APIKey:  body.APIKey,
	}

	updatedEndpoint, err := h.endpointService.UpdateEndpoint(req)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(endpoint.EndpointResponse{
		Success:  true,
		Message:  "端点更新成功",
		Endpoint: updatedEndpoint,
	})
}

// HandleDeleteEndpoint 删除端点 (DELETE /api/endpoints/{id})
func (h *EndpointHandler) HandleDeleteEndpoint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的端点ID",
		})
		return
	}

	// 如果存在 SSE 监听，先断开
	if h.sseManager != nil {
		log.Infof("[API.%v] 删除端点前，先断开 SSE 监听", id)
		h.sseManager.DisconnectEndpoint(id)
		log.Infof("[API.%v] 已断开 SSE 监听", id)
	}

	if err := h.endpointService.DeleteEndpoint(id); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	log.Infof("[API.%v] 端点及其隧道已删除", id)

	json.NewEncoder(w).Encode(endpoint.EndpointResponse{
		Success: true,
		Message: "端点删除成功",
	})
}

// HandlePatchEndpoint PATCH /api/endpoints/{id}
func (h *EndpointHandler) HandlePatchEndpoint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	idStr := vars["id"]

	// 先解析 body，可能包含 id
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	var id int64
	if idStr != "" {
		parsed, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(endpoint.EndpointResponse{
				Success: false,
				Error:   "无效的端点ID",
			})
			return
		}
		id = parsed
	} else {
		// 从 body 提取 id 字段（JSON 编码后数字为 float64）
		if idVal, ok := body["id"].(float64); ok {
			id = int64(idVal)
		} else {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(endpoint.EndpointResponse{
				Success: false,
				Error:   "缺少端点ID",
			})
			return
		}
	}

	action, _ := body["action"].(string)
	switch action {
	case "rename":
		name, _ := body["name"].(string)
		req := endpoint.UpdateEndpointRequest{
			ID:     id,
			Action: "rename",
			Name:   name,
		}
		if _, err := h.endpointService.UpdateEndpoint(req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(endpoint.EndpointResponse{Success: false, Error: err.Error()})
			return
		}
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: true,
			Message: "端点名称已更新",
			Endpoint: map[string]interface{}{
				"id":   id,
				"name": name,
			},
		})
	case "reconnect":
		if h.sseManager != nil {
			go func(eid int64) {
				ep, err := h.endpointService.GetEndpointByID(eid)
				if err == nil {
					log.Infof("[API.%v] 手动重连端点，启动 SSE", eid)
					if err := h.sseManager.ConnectEndpoint(eid, ep.URL, ep.APIPath, ep.APIKey); err != nil {
						log.Errorf("[API.%v] 手动重连端点失败: %v", eid, err)
					}
				}
			}(id)
		}
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{Success: true, Message: "端点已重连"})
	case "disconnect":
		if h.sseManager != nil {
			go func(eid int64) {
				log.Infof("[API.%v] 手动断开端点 SSE", eid)
				h.sseManager.DisconnectEndpoint(eid)

				// 更新端点状态为 OFFLINE
				if err := h.endpointService.UpdateEndpointStatus(eid, endpoint.StatusOffline); err != nil {
					log.Errorf("[API.%v] 更新端点状态为 OFFLINE 失败: %v", eid, err)
				} else {
					log.Infof("[API.%v] 端点状态已更新为 OFFLINE", eid)
				}
			}(id)
		}
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{Success: true, Message: "端点已断开"})
	default:
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{Success: false, Error: "不支持的操作类型"})
	}
}

// HandleGetSimpleEndpoints GET /api/endpoints/simple
func (h *EndpointHandler) HandleGetSimpleEndpoints(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	excludeFailed := r.URL.Query().Get("excludeFailed") == "true"
	endpoints, err := h.endpointService.GetSimpleEndpoints(excludeFailed)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{Success: false, Error: err.Error()})
		return
	}

	if endpoints == nil {
		endpoints = []endpoint.SimpleEndpoint{}
	}
	json.NewEncoder(w).Encode(endpoints)
}

// TestConnectionRequest 测试端点连接请求
type TestConnectionRequest struct {
	URL     string `json:"url"`
	APIPath string `json:"apiPath"`
	APIKey  string `json:"apiKey"`
	Timeout int    `json:"timeout"`
}

// HandleTestEndpoint POST /api/endpoints/test
func (h *EndpointHandler) HandleTestEndpoint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req TestConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "无效请求体"})
		return
	}

	if req.Timeout <= 0 {
		req.Timeout = 10000
	}

	testURL := req.URL + req.APIPath + "/events"

	client := &http.Client{
		Timeout: time.Duration(req.Timeout) * time.Millisecond,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	httpReq, err := http.NewRequest("GET", testURL, nil)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	httpReq.Header.Set("X-API-Key", req.APIKey)
	httpReq.Header.Set("Cache-Control", "no-cache")

	resp, err := client.Do(httpReq)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "HTTP错误", "status": resp.StatusCode, "details": string(bodyBytes)})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "端点连接测试成功", "status": resp.StatusCode})
}

// HandleEndpointStatus GET /api/endpoints/status (SSE)
func (h *EndpointHandler) HandleEndpointStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	send := func() {
		endpoints, err := h.endpointService.GetEndpoints()
		if err != nil {
			return
		}
		data, _ := json.Marshal(endpoints)
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}

	send()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	notify := r.Context().Done()
	for {
		select {
		case <-notify:
			return
		case <-ticker.C:
			send()
		}
	}
}

// HandleEndpointLogs GET /api/endpoints/{id}/logs
// 根据 endpointId 查询最近 limit 条日志(eventType = 'log')
func (h *EndpointHandler) HandleEndpointLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	idStr := vars["id"]
	if idStr == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "缺少端点ID"})
		return
	}

	endpointID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "无效的端点ID"})
		return
	}

	// 解析 limit 参数，默认 1000
	limit := 1000
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}

	db := h.endpointService.DB()

	rows, err := db.Query(`SELECT id, logs, tcpRx, tcpTx, udpRx, udpTx, createdAt FROM "EndpointSSE" WHERE endpointId = ? AND eventType = 'log' ORDER BY createdAt DESC LIMIT ?`, endpointID, limit)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}
	defer rows.Close()

	logs := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id int64
		var logsStr sql.NullString
		var tcpRx, tcpTx, udpRx, udpTx sql.NullInt64
		var createdAt time.Time
		if err := rows.Scan(&id, &logsStr, &tcpRx, &tcpTx, &udpRx, &udpTx, &createdAt); err == nil {
			logs = append(logs, map[string]interface{}{
				"id":        id,
				"message":   logsStr.String,
				"isHtml":    true,
				"traffic":   map[string]int64{"tcpRx": tcpRx.Int64, "tcpTx": tcpTx.Int64, "udpRx": udpRx.Int64, "udpTx": udpTx.Int64},
				"timestamp": createdAt,
			})
		}
	}

	// 返回数据，兼容旧前端结构
	json.NewEncoder(w).Encode(map[string]interface{}{
		"logs":    logs,
		"success": true,
	})
}
