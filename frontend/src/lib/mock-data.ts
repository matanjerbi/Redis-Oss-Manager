import type { ClusterTopology, ClusterConfig, AclUser, MetricPoint } from "./types";

const makeNode = (
  id: string,
  host: string,
  port: number,
  role: "master" | "slave",
  slotStart: number,
  slotEnd: number,
  keys: number,
  usedMb: number,
  maxMb: number,
  masterId?: string
) => ({
  node_id: id,
  host,
  port,
  address: `${host}:${port}`,
  role,
  status: "connected" as const,
  flags: [role, "connected"],
  slots:
    role === "master" ? [{ start: slotStart, end: slotEnd, count: slotEnd - slotStart + 1 }] : [],
  slot_count: role === "master" ? slotEnd - slotStart + 1 : 0,
  master_id: masterId ?? null,
  replication_offset: 1_234_567,
  is_healthy: true,
  metrics: {
    keys_count: keys,
    connected_clients: 12,
    commands_per_sec: 1350,
    used_cpu_sys: 0.12,
    used_cpu_user: 0.08,
    memory: {
      used_bytes: usedMb * 1024 * 1024,
      peak_bytes: usedMb * 1.2 * 1024 * 1024,
      rss_bytes: usedMb * 1.1 * 1024 * 1024,
      max_bytes: maxMb * 1024 * 1024,
      used_mb: usedMb,
      utilization_pct: maxMb > 0 ? Math.round((usedMb / maxMb) * 100 * 10) / 10 : null,
    },
    uptime_seconds: 86400 * 12 + 3600 * 5,
    replication_offset: 1_234_567,
    aof_enabled: false,
    rdb_last_save: "2026-03-31T00:00:00.000Z",
  },
});

export const mockClusters: ClusterTopology[] = [
  {
    cluster_id: "1",
    cluster_name: "production-cluster",
    status: "ok",
    polled_at: "2026-03-31T00:00:00.000Z",
    cluster_enabled: true,
    total_slots_assigned: 16384,
    coverage_pct: 100,
    total_keys: 128_450,
    master_count: 3,
    replica_count: 3,
    healthy_node_count: 6,
    nodes: [
      makeNode("a1b2c3", "127.0.0.1", 7001, "master", 0, 5460, 42150, 312, 512),
      makeNode("d4e5f6", "127.0.0.1", 7002, "master", 5461, 10922, 43200, 287, 512),
      makeNode("g7h8i9", "127.0.0.1", 7003, "master", 10923, 16383, 43100, 298, 512),
      makeNode("j1k2l3", "127.0.0.1", 7004, "slave", 0, 0, 0, 318, 512, "a1b2c3"),
      makeNode("m4n5o6", "127.0.0.1", 7005, "slave", 0, 0, 0, 292, 512, "d4e5f6"),
      makeNode("p7q8r9", "127.0.0.1", 7006, "slave", 0, 0, 0, 301, 512, "g7h8i9"),
    ],
  },
  {
    cluster_id: "2",
    cluster_name: "staging-cluster",
    status: "degraded",
    polled_at: "2026-03-31T00:00:00.000Z",
    cluster_enabled: true,
    total_slots_assigned: 16384,
    coverage_pct: 100,
    total_keys: 23_880,
    master_count: 3,
    replica_count: 3,
    healthy_node_count: 5,
    nodes: [
      makeNode("s1t2u3", "10.0.0.1", 7001, "master", 0, 5460, 7950, 128, 256),
      makeNode("v4w5x6", "10.0.0.2", 7001, "master", 5461, 10922, 8120, 134, 256),
      makeNode("y7z8a9", "10.0.0.3", 7001, "master", 10923, 16383, 7810, 140, 256),
      makeNode("b1c2d3", "10.0.0.4", 7001, "slave", 0, 0, 0, 130, 256, "s1t2u3"),
      {
        ...makeNode("e4f5g6", "10.0.0.5", 7001, "slave", 0, 0, 0, 0, 256, "v4w5x6"),
        status: "disconnected" as const,
        is_healthy: false,
        metrics: null,
      },
      makeNode("h7i8j9", "10.0.0.6", 7001, "slave", 0, 0, 0, 138, 256, "y7z8a9"),
    ],
  },
  {
    cluster_id: "3",
    cluster_name: "analytics-cluster",
    status: "ok",
    polled_at: "2026-03-31T00:00:00.000Z",
    cluster_enabled: true,
    total_slots_assigned: 16384,
    coverage_pct: 100,
    total_keys: 4_201_300,
    master_count: 6,
    replica_count: 6,
    healthy_node_count: 12,
    nodes: [
      makeNode("k1l2m3", "192.168.1.10", 7001, "master", 0, 2730, 700000, 1024, 2048),
      makeNode("n4o5p6", "192.168.1.11", 7001, "master", 2731, 5460, 698000, 989, 2048),
      makeNode("q7r8s9", "192.168.1.12", 7001, "master", 5461, 8191, 703500, 1010, 2048),
      makeNode("t1u2v3", "192.168.1.13", 7001, "master", 8192, 10922, 699800, 998, 2048),
      makeNode("w4x5y6", "192.168.1.14", 7001, "master", 10923, 13652, 700200, 1005, 2048),
      makeNode("z7a8b9", "192.168.1.15", 7001, "master", 13653, 16383, 699800, 1012, 2048),
      makeNode("c1d2e3", "192.168.1.20", 7001, "slave", 0, 0, 0, 1018, 2048, "k1l2m3"),
      makeNode("f4g5h6", "192.168.1.21", 7001, "slave", 0, 0, 0, 992, 2048, "n4o5p6"),
      makeNode("i7j8k9", "192.168.1.22", 7001, "slave", 0, 0, 0, 1008, 2048, "q7r8s9"),
      makeNode("l1m2n3", "192.168.1.23", 7001, "slave", 0, 0, 0, 1001, 2048, "t1u2v3"),
      makeNode("o4p5q6", "192.168.1.24", 7001, "slave", 0, 0, 0, 997, 2048, "w4x5y6"),
      makeNode("r7s8t9", "192.168.1.25", 7001, "slave", 0, 0, 0, 1015, 2048, "z7a8b9"),
    ],
  },
];

export const mockClusterConfigs: ClusterConfig[] = mockClusters.map((c, i) => ({
  id: parseInt(c.cluster_id),
  name: c.cluster_name,
  description: ["Production workload — session store & cache", "Staging environment", "Analytics read-heavy workload"][i],
  tenant_id: ["tenant-prod", "tenant-staging", "tenant-analytics"][i],
  seed_nodes: c.nodes.slice(0, 3).map((n) => n.address),
  tls_enabled: i === 0,
  socket_timeout: 5.0,
  socket_connect_timeout: 5.0,
  created_at: new Date(Date.now() - 86400000 * 90).toISOString(),
  updated_at: new Date().toISOString(),
}));

export const mockAclUsers: AclUser[] = [
  {
    username: "default",
    enabled: true,
    commands: ["+@all"],
    key_patterns: ["*"],
    channel_patterns: ["*"],
    nopass: true,
    num_passwords: 0,
  },
  {
    username: "app_readonly",
    enabled: true,
    commands: ["+@read", "-@dangerous"],
    key_patterns: ["app:*"],
    channel_patterns: [],
    nopass: false,
    num_passwords: 1,
  },
  {
    username: "tenant_a",
    enabled: true,
    commands: ["+@read", "+@write", "-@admin", "-@dangerous"],
    key_patterns: ["tenant_a:*"],
    channel_patterns: ["tenant_a:*"],
    nopass: false,
    num_passwords: 1,
  },
  {
    username: "tenant_b",
    enabled: true,
    commands: ["+@read", "+@write", "-@admin", "-@dangerous"],
    key_patterns: ["tenant_b:*"],
    channel_patterns: ["tenant_b:*"],
    nopass: false,
    num_passwords: 1,
  },
  {
    username: "analytics_user",
    enabled: false,
    commands: ["+@read"],
    key_patterns: ["analytics:*", "metrics:*"],
    channel_patterns: [],
    nopass: false,
    num_passwords: 1,
  },
];

// Called only client-side (inside useEffect/useState) to avoid hydration mismatch
export function generateMetricHistory(baseValue: number, points = 20): MetricPoint[] {
  // Deterministic pseudo-random using sine wave so server/client match if called at module level
  return Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * Math.PI * 4;
    const jitter = Math.sin(angle * 7.3) * 0.15 + Math.sin(angle * 3.1) * 0.1;
    const minutes = points - i;
    const hh = String(Math.floor((60 - minutes) / 60) % 24).padStart(2, "0");
    const mm = String((60 - minutes) % 60).padStart(2, "0");
    return {
      time: `${hh}:${mm}`,
      value: Math.max(0, Math.round(baseValue * (1 + jitter))),
    };
  });
}

export function getOverviewStats(clusters: ClusterTopology[]) {
  const totalClusters = clusters.length;
  const totalNodes = clusters.reduce((s, c) => s + c.nodes.length, 0);
  const healthyNodes = clusters.reduce((s, c) => s + c.healthy_node_count, 0);
  const totalKeys = clusters.reduce((s, c) => s + c.total_keys, 0);
  const totalMemoryMb = clusters.reduce(
    (s, c) =>
      s +
      c.nodes.reduce(
        (ns, n) => ns + (n.metrics?.memory.used_mb ?? 0),
        0
      ),
    0
  );
  const healthyClusters = clusters.filter((c) => c.status === "ok").length;

  return { totalClusters, totalNodes, healthyNodes, totalKeys, totalMemoryMb, healthyClusters };
}
