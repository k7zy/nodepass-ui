package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	log "NodePassDash/internal/log"
	"NodePassDash/internal/sse"
)

// DataHandler 负责导入/导出数据
type DataHandler struct {
	db         *sql.DB
	sseManager *sse.Manager
}

func NewDataHandler(db *sql.DB, mgr *sse.Manager) *DataHandler {
	return &DataHandler{db: db, sseManager: mgr}
}

// EndpointExport 导出端点结构
type EndpointExport struct {
	Name    string         `json:"name"`
	URL     string         `json:"url"`
	APIPath string         `json:"apiPath"`
	APIKey  string         `json:"apiKey"`
	Status  string         `json:"status"`
	Color   string         `json:"color,omitempty"`
	Tunnels []TunnelExport `json:"tunnels,omitempty"`
}

// TunnelExport 导出隧道结构
type TunnelExport struct {
	Name          string `json:"name"`
	Mode          string `json:"mode"`
	Status        string `json:"status"`
	TunnelAddress string `json:"tunnelAddress"`
	TunnelPort    string `json:"tunnelPort"`
	TargetAddress string `json:"targetAddress"`
	TargetPort    string `json:"targetPort"`
	TLSMode       string `json:"tlsMode"`
	CertPath      string `json:"certPath,omitempty"`
	KeyPath       string `json:"keyPath,omitempty"`
	LogLevel      string `json:"logLevel"`
	CommandLine   string `json:"commandLine"`
	InstanceID    string `json:"instanceId,omitempty"`
	TCPRx         string `json:"tcpRx,omitempty"`
	TCPTx         string `json:"tcpTx,omitempty"`
	UDPRx         string `json:"udpRx,omitempty"`
	UDPTx         string `json:"udpTx,omitempty"`
}

// ---------- 导出 ----------
func (h *DataHandler) HandleExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 查询端点
	rows, err := h.db.Query(`SELECT id, name, url, apiPath, apiKey, status, color FROM "Endpoint" ORDER BY id`)
	if err != nil {
		log.Errorf("export query endpoints: %v", err)
		http.Error(w, "export failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var endpoints []EndpointExport
	for rows.Next() {
		var epID int64
		var ep EndpointExport
		if err := rows.Scan(&epID, &ep.Name, &ep.URL, &ep.APIPath, &ep.APIKey, &ep.Status, &ep.Color); err != nil {
			continue
		}
		// 查询该端点隧道
		tRows, err := h.db.Query(`SELECT name, mode, status, tunnelAddress, tunnelPort, targetAddress, targetPort, tlsMode, certPath, keyPath, logLevel, commandLine, instanceId, tcpRx, tcpTx, udpRx, udpTx FROM "Tunnel" WHERE endpointId = ?`, epID)
		if err == nil {
			for tRows.Next() {
				var t TunnelExport
				var tcpRx, tcpTx, udpRx, udpTx sql.NullInt64
				var instanceNS sql.NullString
				var certNS, keyNS sql.NullString
				if err := tRows.Scan(&t.Name, &t.Mode, &t.Status, &t.TunnelAddress, &t.TunnelPort, &t.TargetAddress, &t.TargetPort, &t.TLSMode, &certNS, &keyNS, &t.LogLevel, &t.CommandLine, &instanceNS, &tcpRx, &tcpTx, &udpRx, &udpTx); err == nil {
					if certNS.Valid {
						t.CertPath = certNS.String
					}
					if keyNS.Valid {
						t.KeyPath = keyNS.String
					}
					if instanceNS.Valid {
						t.InstanceID = instanceNS.String
					}
					if tcpRx.Valid {
						t.TCPRx = fmt.Sprintf("%d", tcpRx.Int64)
					}
					if tcpTx.Valid {
						t.TCPTx = fmt.Sprintf("%d", tcpTx.Int64)
					}
					if udpRx.Valid {
						t.UDPRx = fmt.Sprintf("%d", udpRx.Int64)
					}
					if udpTx.Valid {
						t.UDPTx = fmt.Sprintf("%d", udpTx.Int64)
					}
					ep.Tunnels = append(ep.Tunnels, t)
				}
			}
			tRows.Close()
		}
		endpoints = append(endpoints, ep)
	}

	payload := map[string]interface{}{
		"version":   "1.0",
		"timestamp": time.Now().Format(time.RFC3339),
		"data": map[string]interface{}{
			"endpoints": endpoints,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=nodepass-data.json")
	json.NewEncoder(w).Encode(payload)
}

// ---------- 导入 ----------
func (h *DataHandler) HandleImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var importData struct {
		Version   string `json:"version"`
		Timestamp string `json:"timestamp"`
		Data      struct {
			Endpoints []EndpointExport `json:"endpoints"`
		} `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&importData); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	var skippedEndpoints int
	var importedTunnels int

	tx, err := h.db.Begin()
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	for _, ep := range importData.Data.Endpoints {
		var exists bool
		if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM "Endpoint" WHERE url = ? AND apiPath = ?)`, ep.URL, ep.APIPath).Scan(&exists); err != nil {
			continue
		}
		if exists {
			skippedEndpoints++
			continue
		}
		res, err := tx.Exec(`INSERT INTO "Endpoint" (name, url, apiPath, apiKey, status, color, tunnelCount, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, ep.Name, ep.URL, ep.APIPath, ep.APIKey, ep.Status, ep.Color)
		if err != nil {
			continue
		}
		epID, _ := res.LastInsertId()
		for _, t := range ep.Tunnels {
			_, _ = tx.Exec(`INSERT INTO "Tunnel" (name, mode, status, tunnelAddress, tunnelPort, targetAddress, targetPort, tlsMode, certPath, keyPath, logLevel, commandLine, instanceId, tcpRx, tcpTx, udpRx, udpTx, endpointId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
				t.Name, t.Mode, t.Status, t.TunnelAddress, t.TunnelPort, t.TargetAddress, t.TargetPort, t.TLSMode, t.CertPath, t.KeyPath, t.LogLevel, t.CommandLine, t.InstanceID, t.TCPRx, t.TCPTx, t.UDPRx, t.UDPTx, epID)
			importedTunnels++
		}
	}
	tx.Commit()

	// 重置 SSE
	if h.sseManager != nil {
		h.sseManager.Close()
		h.sseManager.InitializeSystem()
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":          true,
		"message":          "数据导入成功",
		"skippedEndpoints": skippedEndpoints,
		"tunnels":          importedTunnels,
	})
}
