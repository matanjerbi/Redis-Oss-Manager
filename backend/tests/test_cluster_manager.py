"""
Unit tests for ClusterManager parsing logic.
No live Redis required — all tests work against raw text fixtures.
"""
import pytest
from datetime import timezone

from app.infrastructure.redis.cluster_manager import ClusterManager
from app.domain.models import NodeRole, NodeStatus, SlotRange


CLUSTER_NODES_FIXTURE = """\
07c37dfeb235213a872192d90877d0cd55635b91 127.0.0.1:7001@17001 master - 0 1426238317239 2 connected 0-5460
e7d1eecce10fd6bb5eb35b9f99a514335d9ba9ca 127.0.0.1:7002@17002 master - 0 1426238316232 3 connected 5461-10922
b8ad8574a5b1b85c5fe3a7c42b3b7c4e56e01b82 127.0.0.1:7003@17003 master - 0 1426238317243 4 connected 10923-16383
1f4e7b2d8c3a5f6d9e0b1c2a3d4e5f6a7b8c9d0e 127.0.0.1:7004@17004 slave 07c37dfeb235213a872192d90877d0cd55635b91 0 1426238317243 2 connected
2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e1d 127.0.0.1:7005@17005 slave e7d1eecce10fd6bb5eb35b9f99a514335d9ba9ca 0 1426238317243 3 connected
3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c9b0a1f2e 127.0.0.1:7006@17006 slave b8ad8574a5b1b85c5fe3a7c42b3b7c4e56e01b82 0 1426238317243 4 connected
"""

INFO_FIXTURE = {
    "used_memory": "1024000",
    "used_memory_peak": "2048000",
    "used_memory_rss": "1536000",
    "maxmemory": "0",
    "connected_clients": "5",
    "instantaneous_ops_per_sec": "150.5",
    "used_cpu_sys": "0.12",
    "used_cpu_user": "0.08",
    "uptime_in_seconds": "86400",
    "master_repl_offset": "1234567",
    "aof_enabled": "0",
    "rdb_last_bgsave_time_sec": "0",
    "db0": {"keys": "1500", "expires": "100", "avg_ttl": "3600"},
}


@pytest.fixture
def manager():
    return ClusterManager(
        cluster_id=1,
        seed_nodes=["127.0.0.1:7001"],
    )


class TestParseClusterNodes:
    def test_parses_all_six_nodes(self, manager):
        nodes = manager._parse_cluster_nodes(CLUSTER_NODES_FIXTURE)
        assert len(nodes) == 6

    def test_master_roles(self, manager):
        nodes = manager._parse_cluster_nodes(CLUSTER_NODES_FIXTURE)
        masters = [n for n in nodes if n.role == NodeRole.MASTER]
        assert len(masters) == 3

    def test_replica_roles(self, manager):
        nodes = manager._parse_cluster_nodes(CLUSTER_NODES_FIXTURE)
        replicas = [n for n in nodes if n.role == NodeRole.SLAVE]
        assert len(replicas) == 3

    def test_slot_ranges_cover_all_16384(self, manager):
        nodes = manager._parse_cluster_nodes(CLUSTER_NODES_FIXTURE)
        masters = [n for n in nodes if n.role == NodeRole.MASTER]
        total = sum(n.slot_count for n in masters)
        assert total == 16384

    def test_replica_has_master_id(self, manager):
        nodes = manager._parse_cluster_nodes(CLUSTER_NODES_FIXTURE)
        replica = next(n for n in nodes if n.role == NodeRole.SLAVE)
        assert replica.master_id is not None
        assert len(replica.master_id) == 40  # SHA1 hex

    def test_node_addresses(self, manager):
        nodes = manager._parse_cluster_nodes(CLUSTER_NODES_FIXTURE)
        addresses = {n.address for n in nodes}
        assert "127.0.0.1:7001" in addresses
        assert "127.0.0.1:7006" in addresses

    def test_status_connected(self, manager):
        nodes = manager._parse_cluster_nodes(CLUSTER_NODES_FIXTURE)
        assert all(n.status == NodeStatus.CONNECTED for n in nodes)


class TestParseNodeMetrics:
    def test_keys_aggregated_from_dbs(self, manager):
        metrics = manager._parse_node_metrics(INFO_FIXTURE)
        assert metrics.keys_count == 1500

    def test_memory_parsed(self, manager):
        metrics = manager._parse_node_metrics(INFO_FIXTURE)
        assert metrics.memory.used_bytes == 1024000
        assert metrics.memory.used_mb == pytest.approx(0.977, abs=0.01)

    def test_no_maxmemory_returns_none_utilization(self, manager):
        metrics = manager._parse_node_metrics(INFO_FIXTURE)
        assert metrics.memory.utilization_pct is None

    def test_rdb_last_save_timezone_aware(self, manager):
        metrics = manager._parse_node_metrics(INFO_FIXTURE)
        assert metrics.rdb_last_save.tzinfo is not None


class TestDeriveClusterStatus:
    def test_all_connected_is_ok(self, manager):
        nodes = manager._parse_cluster_nodes(CLUSTER_NODES_FIXTURE)
        from app.domain.models import ClusterStatus
        status = manager._derive_cluster_status(nodes)
        assert status == ClusterStatus.OK

    def test_fail_flag_is_fail(self, manager):
        nodes = manager._parse_cluster_nodes(CLUSTER_NODES_FIXTURE)
        nodes[0].status = NodeStatus.FAIL
        from app.domain.models import ClusterStatus
        status = manager._derive_cluster_status(nodes)
        assert status == ClusterStatus.FAIL


class TestHashPassword:
    def test_produces_64_char_hex(self):
        h = ClusterManager.hash_password("secret")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_deterministic(self):
        assert ClusterManager.hash_password("x") == ClusterManager.hash_password("x")
