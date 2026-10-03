export {
  agentSurface,
  resourceUri,
  type AgentConfirmation,
  type AgentResource,
  type AgentSurface,
  type AgentSurfaceLike,
  type AgentSurfaceOptions,
  type AgentTool,
  type AgentToolResult
} from './AgentSurface';
export {
  handleMcpMessage,
  mcpHandler,
  MCP_PROTOCOL_VERSIONS,
  type JsonRpcResponse,
  type McpHandlerOptions,
  type McpServerInfo
} from './mcp';
export { validate } from './validate';
export {
  AGENT_PORT,
  combineSurfaces,
  remoteSurface,
  serveAgentPort,
  type AgentPortRequest,
  type AgentPortResponse
} from './remote';
export {
  connectDevAgent,
  DEV_AGENT_EVENTS,
  type DevAgentApp,
  type DevAgentHot,
  type DevAgentRequest,
  type DevAgentResponse
} from './dev';
export {
  confirmInWindow,
  connectWebMcp,
  pageModelContext,
  registerWebMcpTools,
  type ModelContextLike,
  type WebMcpOptions
} from './webmcp';
export { outline, resolveTarget, UiRefs, uiSurface, type UiHost, type UiSurfaceOptions } from './ui';
export { serveApplicationAgent, type ApplicationAgentParts } from './app';
