package api

import (
	"encoding/json"
	"net/http"

	"NodePassDash/internal/auth"
)

// AuthHandler 认证相关的处理器
type AuthHandler struct {
	authService *auth.Service
}

// NewAuthHandler 创建认证处理器实例
func NewAuthHandler(authService *auth.Service) *AuthHandler {
	return &AuthHandler{
		authService: authService,
	}
}

// HandleLogin 处理登录请求
func (h *AuthHandler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req auth.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// 验证用户名和密码不为空
	if req.Username == "" || req.Password == "" {
		json.NewEncoder(w).Encode(auth.LoginResponse{
			Success: false,
			Error:   "用户名和密码不能为空",
		})
		return
	}

	// 验证用户身份
	if !h.authService.AuthenticateUser(req.Username, req.Password) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(auth.LoginResponse{
			Success: false,
			Error:   "用户名或密码错误",
		})
		return
	}

	// 创建用户会话
	sessionID, err := h.authService.CreateUserSession(req.Username)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(auth.LoginResponse{
			Success: false,
			Error:   "创建会话失败",
		})
		return
	}

	// 设置会话 cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		MaxAge:   24 * 60 * 60, // 24小时
		SameSite: http.SameSiteLaxMode,
	})

	// 返回成功响应
	json.NewEncoder(w).Encode(auth.LoginResponse{
		Success: true,
		Message: "登录成功",
	})
}

// HandleLogout 处理登出请求
func (h *AuthHandler) HandleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取会话 cookie
	cookie, err := r.Cookie("session")
	if err == nil {
		// 销毁会话
		h.authService.DestroySession(cookie.Value)
	}

	// 清除 cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "登出成功",
	})
}

// HandleValidateSession 处理会话验证请求
func (h *AuthHandler) HandleValidateSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取会话 cookie
	cookie, err := r.Cookie("session")
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"valid": false,
		})
		return
	}

	// 验证会话
	isValid := h.authService.ValidateSession(cookie.Value)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"valid": isValid,
	})
}

// HandleInitSystem 处理系统初始化请求
func (h *AuthHandler) HandleInitSystem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 检查系统是否已初始化
	if h.authService.IsSystemInitialized() {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "系统已初始化",
		})
		return
	}

	// 初始化系统
	username, password, err := h.authService.InitializeSystem()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "系统初始化失败",
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"username": username,
		"password": password,
	})
}

// HandleGetMe 获取当前登录用户信息
func (h *AuthHandler) HandleGetMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session")
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "未登录",
		})
		return
	}

	session, ok := h.authService.GetSession(cookie.Value)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "会话失效",
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"username":  session.Username,
		"expiresAt": session.ExpiresAt,
	})
}

// PasswordChangeRequest 请求体
type PasswordChangeRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

// UsernameChangeRequest 请求体
type UsernameChangeRequest struct {
	NewUsername string `json:"newUsername"`
}

// HandleChangePassword 修改密码
func (h *AuthHandler) HandleChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取 session cookie
	cookie, err := r.Cookie("session")
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "未登录"})
		return
	}

	if !h.authService.ValidateSession(cookie.Value) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "会话无效"})
		return
	}

	sess, ok := h.authService.GetSession(cookie.Value)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "会话无效"})
		return
	}

	var req PasswordChangeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "无效请求体"})
		return
	}

	if req.CurrentPassword == "" || req.NewPassword == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "缺少字段"})
		return
	}

	ok2, msg := h.authService.ChangePassword(sess.Username, req.CurrentPassword, req.NewPassword)
	if !ok2 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": msg})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": msg})
}

// HandleChangeUsername 修改用户名
func (h *AuthHandler) HandleChangeUsername(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session")
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "未登录"})
		return
	}

	if !h.authService.ValidateSession(cookie.Value) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "会话无效"})
		return
	}

	sess, ok := h.authService.GetSession(cookie.Value)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "会话无效"})
		return
	}

	var req UsernameChangeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "无效请求体"})
		return
	}

	if req.NewUsername == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "新用户名不能为空"})
		return
	}

	ok2, msg := h.authService.ChangeUsername(sess.Username, req.NewUsername)
	if !ok2 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": msg})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": msg})
}
