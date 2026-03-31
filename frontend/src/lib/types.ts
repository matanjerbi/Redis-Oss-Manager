export type NodeRole = "master" | "slave" | "unknown";
export type NodeStatus = "connected" | "disconnected" | "fail" | "pfail" | "handshake" | "unknown";
export type ClusterStatus = "ok" | "fail" | "degraded" | "unknown";

export interface SlotRange {
  start: number;
  end: number;
  count: number;
}

export interface NodeMemory {
  used_bytes: number;
  peak_bytes: number;
  rss_bytes: number;
  max_bytes: number;
  used_mb: number;
  utilization_pct: number | null;
}

export interface NodeMetrics {
  keys_count: number;
  connected_clients: number;
  commands_per_sec: number;
  used_cpu_sys: number;
  used_cpu_user: number;
  memory: NodeMemory;
  uptime_seconds: number;
  replication_offset: number;
  aof_enabled: boolean;
  rdb_last_save: string;
}

export interface ClusterNode {
  node_id: string;
  host: string;
  port: number;
  address: string;
  role: NodeRole;
  status: NodeStatus;
  flags: string[];
  slots: SlotRange[];
  slot_count: number;
  master_id: string | null;
  replication_offset: number;
  is_healthy: boolean;
  metrics: NodeMetrics | null;
}

export interface ClusterTopology {
  cluster_id: string;
  cluster_name: string;
  status: ClusterStatus;
  polled_at: string;
  cluster_enabled: boolean;
  total_slots_assigned: number;
  coverage_pct: number;
  total_keys: number;
  nodes: ClusterNode[];
  master_count: number;
  replica_count: number;
  healthy_node_count: number;
}

export interface ClusterConfig {
  id: number;
  name: string;
  description: string;
  tenant_id: string;
  seed_nodes: string[];
  tls_enabled: boolean;
  socket_timeout: number;
  socket_connect_timeout: number;
  created_at: string;
  updated_at: string;
}

export interface AclUser {
  username: string;
  enabled: boolean;
  commands: string[];
  key_patterns: string[];
  channel_patterns: string[];
  nopass: boolean;
  num_passwords: number;
}

export interface MetricPoint {
  time: string;
  value: number;
}
