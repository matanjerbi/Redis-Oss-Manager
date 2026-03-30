"""Domain exceptions — framework-agnostic."""


class RedisManagerError(Exception):
    """Base exception for the Redis manager."""


class ClusterNotFoundError(RedisManagerError):
    def __init__(self, cluster_id: int | str):
        super().__init__(f"Cluster '{cluster_id}' not found")
        self.cluster_id = cluster_id


class ClusterConnectionError(RedisManagerError):
    def __init__(self, cluster_id: int | str, cause: Exception):
        super().__init__(
            f"Cannot connect to cluster '{cluster_id}': {cause}"
        )
        self.cluster_id = cluster_id
        self.cause = cause


class NodeUnreachableError(RedisManagerError):
    def __init__(self, address: str, cause: Exception):
        super().__init__(f"Node '{address}' is unreachable: {cause}")
        self.address = address
        self.cause = cause


class AclOperationError(RedisManagerError):
    def __init__(self, username: str, node: str, cause: Exception):
        super().__init__(
            f"ACL operation for user '{username}' failed on node '{node}': {cause}"
        )
        self.username = username
        self.node = node
        self.cause = cause


class ConfigOperationError(RedisManagerError):
    def __init__(self, parameter: str, node: str, cause: Exception):
        super().__init__(
            f"CONFIG SET '{parameter}' failed on node '{node}': {cause}"
        )
        self.parameter = parameter
        self.node = node
        self.cause = cause


class InvalidSeedNodeError(RedisManagerError):
    def __init__(self, seed: str):
        super().__init__(f"Invalid seed node format '{seed}'. Expected 'host:port'")
        self.seed = seed
