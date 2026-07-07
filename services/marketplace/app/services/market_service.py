"""Catalog use cases: listing, deploying, publishing, and initial seed."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.repositories.models import MarketApp, utcnow_iso
from app.schemas.market_app import PublishRequest


def list_apps(db: Session, tag: str | None = None) -> list[MarketApp]:
    stmt = select(MarketApp).order_by(MarketApp.created_at)
    if tag:
        stmt = stmt.where(MarketApp.tag == tag)
    return list(db.scalars(stmt))


def get_or_404(db: Session, app_id: str) -> MarketApp:
    app = db.get(MarketApp, app_id)
    if app is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "App not found")
    return app


def deploy(db: Session, app_id: str) -> MarketApp:
    app = get_or_404(db, app_id)
    app.installs += 1
    app.deployed = True
    app.updated_at = utcnow_iso()
    db.commit()
    db.refresh(app)
    return app


def undeploy(db: Session, app_id: str) -> MarketApp:
    app = get_or_404(db, app_id)
    if app.deployed:
        app.installs = max(0, app.installs - 1)
        app.deployed = False
        app.updated_at = utcnow_iso()
        db.commit()
        db.refresh(app)
    return app


def publish(db: Session, payload: PublishRequest) -> MarketApp:
    """Create or update the catalog entry for a builder app (upsert on source)."""
    app = db.scalar(select(MarketApp).where(MarketApp.source_app_id == payload.source_app_id))
    if app is None:
        app = MarketApp(tag="custom", source_app_id=payload.source_app_id)
        db.add(app)
    app.name = payload.name
    app.desc = payload.desc or app.desc or "本组织自建应用"
    app.category = payload.category
    app.definition = payload.definition
    app.updated_at = utcnow_iso()
    db.commit()
    db.refresh(app)
    return app


def _demo_definition(title: str) -> dict:
    """A small builder-schema definition so seeded custom apps can run."""
    return {
        "name": title,
        "sections": [
            {"id": "sec-heading", "widgets": [
                {"id": "w-h", "type": "heading",
                 "config": {"title": title, "bindObject": "设备 Device", "dataSource": "pipeline_maintenance", "refresh": "实时"}},
            ]},
            {"id": "sec-metrics", "widgets": [
                {"id": "w-m1", "type": "metric",
                 "config": {"title": "订单履约率", "bindObject": "订单 Order", "dataSource": "erp_orders", "refresh": "实时"}},
                {"id": "w-m2", "type": "metric",
                 "config": {"title": "设备可用率", "bindObject": "设备 Device", "dataSource": "pipeline_maintenance", "refresh": "实时"}},
                {"id": "w-m3", "type": "metric",
                 "config": {"title": "在途订单", "bindObject": "订单 Order", "dataSource": "erp_orders", "refresh": "实时"}},
            ]},
            {"id": "sec-detail", "widgets": [
                {"id": "w-c", "type": "chart",
                 "config": {"title": "近 7 天故障趋势", "bindObject": "设备 Device", "dataSource": "iot_sensor_stream", "refresh": "实时"}},
                {"id": "w-t", "type": "table",
                 "config": {"title": "告警设备", "bindObject": "设备 Device", "dataSource": "pipeline_maintenance", "refresh": "实时"}},
            ]},
        ],
    }


# Matches the frontend prototype's catalog so the page looks familiar on day
# one. Every entry carries a demo definition so "open" works for all of them.
SEED_APPS: list[dict] = [
    {"name": "预测性维护", "desc": "基于传感器数据预测设备故障", "tag": "prebuilt", "category": "运营", "installs": 1200,
     "definition": _demo_definition("预测性维护")},
    {"name": "供应链风险雷达", "desc": "多级供应商风险实时监控", "tag": "prebuilt", "category": "供应链", "installs": 860,
     "definition": _demo_definition("供应链风险雷达")},
    {"name": "反欺诈调查台", "desc": "实体关联 + 资金流图谱", "tag": "prebuilt", "category": "调查", "installs": 540,
     "definition": _demo_definition("反欺诈调查台")},
    {"name": "运营指挥台", "desc": "本组织自建的实时运营看板", "tag": "custom", "category": "自建", "installs": 0,
     "definition": _demo_definition("运营指挥台")},
    {"name": "客户 360", "desc": "跨系统客户全景视图", "tag": "prebuilt", "category": "营销", "installs": 2100,
     "definition": _demo_definition("客户 360")},
    {"name": "调查看板", "desc": "案件专用关系与时间线视图", "tag": "custom", "category": "自建", "installs": 0,
     "definition": _demo_definition("调查看板")},
]


def seed_if_empty(db: Session) -> None:
    if db.scalar(select(MarketApp).limit(1)) is not None:
        return
    for fields in SEED_APPS:
        db.add(MarketApp(**fields))
    db.commit()
