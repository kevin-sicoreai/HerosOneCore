"""Domain enumerations (framework-agnostic)."""

from enum import StrEnum


class StepKind(StrEnum):
    SOURCE = "source"        # references an existing (raw) dataset
    TRANSFORM = "transform"  # single-input SQL / structured operation
    JOIN = "join"            # two-input join
    OUTPUT = "output"        # materializes result as a mart dataset


class PipelineStatus(StrEnum):
    DRAFT = "draft"          # graph not yet validated
    READY = "ready"          # graph valid, runnable
    RUNNING = "running"
    FAILED = "failed"
    SUCCEEDED = "succeeded"


class RunStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
