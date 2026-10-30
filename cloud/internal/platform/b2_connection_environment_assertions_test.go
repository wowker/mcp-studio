//go:build !local

package platform

import (
	"testing"
)

// B2 A50：平台接口 / 事件与实际 MCP 路径。
// 正式预期：
//   平台权限 / 配置 / 上传走平台 API，Tool HTTP 由浏览器或 Agent、stdio 由 Agent；
//   平台默认不代调，租户身份不可混用。
// 设计承诺（06 清单 D02）：「平台后端负责用户、项目、权限、配置、脱敏历史与保存记录，
// 显式开启的个人凭据备份，默认不代发 MCP Tool 请求。」
// 本文件只补一条缺口：Go handler 层不存在 Tool 代调入口；
// 其余 A50 子句（浏览器直连、Agent 走 MCP、stdio 强制 Agent、凭据按 scope 隔离）均由
// 前端 runtime 层（browser-session.test.ts / agent-client.test.ts / vault.test.ts）和
// backend 既有测试（TestAgentExchangeRejectsBrowserFetchWithoutCookie 等）覆盖。

func TestB2A50PlatformDoesNotExposeToolProxyEndpoint(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)

	for _, path := range []string{
		"/api/v1/tools",          // 直接代调入口
		"/api/v1/proxy",          // 通用代理入口
		"/api/v1/mcp",            // MCP 通道入口
		"/api/v1/execute",        // 执行入口
		"/api/v1/projects/any/tools",
		"/api/v1/projects/any/proxy",
	} {
		w := configurationRequest(t, a, "GET", path, nil, s, c, "")
		if w.Code != 404 {
			t.Fatalf("platform exposed tool proxy at %s: %d", path, w.Code)
		}
	}
	// 即使带 body 的 POST 也不能凭空出现代调能力。
	for _, path := range []string{
		"/api/v1/tools/call",
		"/api/v1/proxy/mcp",
		"/api/v1/mcp/initialize",
	} {
		w := configurationRequest(t, a, "POST", path, map[string]any{"jsonrpc": "2.0", "method": "tools/call"}, s, c, "")
		if w.Code != 404 {
			t.Fatalf("platform accepted tool proxy POST at %s: %d %s", path, w.Code, w.Body.String())
		}
	}
}
