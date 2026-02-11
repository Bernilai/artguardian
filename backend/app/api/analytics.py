from typing import Dict, List
from datetime import datetime, timedelta, timezone
import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, case, extract
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Artifact, Ticket, Detection, User
from app.dependencies import get_current_active_user, require_curator_or_admin

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/overview")
async def get_analytics_overview(
    current_user: User = Depends(require_curator_or_admin),
    db: AsyncSession = Depends(get_db)
) -> Dict:
    """Get comprehensive analytics overview (curator/admin only)"""
    
    # Artifact statistics by status
    status_counts_result = await db.execute(
        select(
            Artifact.status,
            func.count(Artifact.id).label('count')
        ).group_by(Artifact.status)
    )
    status_counts = {row.status: row.count for row in status_counts_result.all()}
    
    # Total artifacts
    total_artifacts = sum(status_counts.values())
    
    # Artifacts by collection
    collection_counts_result = await db.execute(
        select(
            Artifact.collection,
            func.count(Artifact.id).label('count')
        ).group_by(Artifact.collection).order_by(func.count(Artifact.id).desc())
    )
    collection_counts = [
        {"name": row.collection, "count": row.count}
        for row in collection_counts_result.all()
    ]
    
    # Ticket statistics
    ticket_status_counts_result = await db.execute(
        select(
            Ticket.status,
            func.count(Ticket.id).label('count')
        ).group_by(Ticket.status)
    )
    ticket_status_counts = {row.status: row.count for row in ticket_status_counts_result.all()}
    
    # Ticket priority distribution
    ticket_priority_counts_result = await db.execute(
        select(
            Ticket.priority,
            func.count(Ticket.id).label('count')
        ).group_by(Ticket.priority)
    )
    ticket_priority_counts = {row.priority: row.count for row in ticket_priority_counts_result.all()}
    
    # Completed tickets count
    completed_tickets_result = await db.execute(
        select(func.count(Ticket.id)).where(Ticket.status == "completed")
    )
    completed_tickets = completed_tickets_result.scalar_one() or 0
    
    # Open tickets count
    open_tickets_result = await db.execute(
        select(func.count(Ticket.id)).where(
            Ticket.status.in_(["open", "in_progress"])
        )
    )
    open_tickets = open_tickets_result.scalar_one() or 0
    
    # Detection statistics
    detection_counts_result = await db.execute(
        select(
            Detection.detection_type,
            func.count(Detection.id).label('count')
        ).group_by(Detection.detection_type).order_by(func.count(Detection.id).desc())
    )
    detection_counts = [
        {"type": row.detection_type, "count": row.count}
        for row in detection_counts_result.all()
    ]
    
    # Critical detections
    critical_detections_result = await db.execute(
        select(func.count(Detection.id)).where(Detection.is_critical == True)
    )
    critical_detections = critical_detections_result.scalar_one() or 0
    
    return {
        "artifacts": {
            "total": total_artifacts,
            "by_status": {
                "no_defects": status_counts.get("no_defects", 0),
                "has_defects": status_counts.get("has_defects", 0),
                "requires_attention": status_counts.get("requires_attention", 0),
                "under_restoration": status_counts.get("under_restoration", 0),
                "exhibited": status_counts.get("exhibited", 0)
            },
            "by_collection": collection_counts
        },
        "tickets": {
            "total": sum(ticket_status_counts.values()),
            "open": open_tickets,
            "completed": completed_tickets,
            "by_status": {
                "open": ticket_status_counts.get("open", 0),
                "in_progress": ticket_status_counts.get("in_progress", 0),
                "completed": ticket_status_counts.get("completed", 0)
            },
            "by_priority": ticket_priority_counts
        },
        "detections": {
            "total": sum(d["count"] for d in detection_counts),
            "critical": critical_detections,
            "by_type": detection_counts
        }
    }


@router.get("/trends")
async def get_analytics_trends(
    days: int = 30,
    current_user: User = Depends(require_curator_or_admin),
    db: AsyncSession = Depends(get_db)
) -> Dict:
    """Get trends over time (curator/admin only)"""
    
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days)
    
    # Artifacts created over time (using DATE() function for PostgreSQL)
    artifacts_created_result = await db.execute(
        select(
            func.date(Artifact.created_at).label('date'),
            func.count(Artifact.id).label('count')
        ).where(
            Artifact.created_at >= start_date
        ).group_by(func.date(Artifact.created_at)).order_by(func.date(Artifact.created_at))
    )
    artifacts_created = [
        {"date": str(row.date), "count": row.count}
        for row in artifacts_created_result.all()
    ]
    
    # Tickets created over time
    tickets_created_result = await db.execute(
        select(
            func.date(Ticket.created_at).label('date'),
            func.count(Ticket.id).label('count')
        ).where(
            Ticket.created_at >= start_date
        ).group_by(func.date(Ticket.created_at)).order_by(func.date(Ticket.created_at))
    )
    tickets_created = [
        {"date": str(row.date), "count": row.count}
        for row in tickets_created_result.all()
    ]
    
    # Tickets completed over time
    tickets_completed_result = await db.execute(
        select(
            func.date(Ticket.completed_at).label('date'),
            func.count(Ticket.id).label('count')
        ).where(
            and_(
                Ticket.completed_at >= start_date,
                Ticket.completed_at.isnot(None)
            )
        ).group_by(func.date(Ticket.completed_at)).order_by(func.date(Ticket.completed_at))
    )
    tickets_completed = [
        {"date": str(row.date), "count": row.count}
        for row in tickets_completed_result.all()
    ]
    
    # Detections over time
    detections_created_result = await db.execute(
        select(
            func.date(Detection.created_at).label('date'),
            func.count(Detection.id).label('count')
        ).where(
            Detection.created_at >= start_date
        ).group_by(func.date(Detection.created_at)).order_by(func.date(Detection.created_at))
    )
    detections_created = [
        {"date": str(row.date), "count": row.count}
        for row in detections_created_result.all()
    ]
    
    return {
        "period_days": days,
        "artifacts_created": artifacts_created,
        "tickets_created": tickets_created,
        "tickets_completed": tickets_completed,
        "detections_created": detections_created
    }


@router.get("/restoration")
async def get_restoration_analytics(
    current_user: User = Depends(require_curator_or_admin),
    db: AsyncSession = Depends(get_db)
) -> Dict:
    """Get restoration-specific analytics (curator/admin only)"""
    
    # Tickets by restorer
    tickets_by_restorer_result = await db.execute(
        select(
            User.name,
            func.count(Ticket.id).label('count')
        ).join(
            Ticket, Ticket.assigned_to_id == User.id
        ).where(
            Ticket.status == "completed"
        ).group_by(User.name).order_by(func.count(Ticket.id).desc())
    )
    tickets_by_restorer = [
        {"restorer": row.name, "count": row.count}
        for row in tickets_by_restorer_result.all()
    ]
    
    # Average completion time
    avg_completion_result = await db.execute(
        select(
            func.avg(
                func.extract('epoch', Ticket.completed_at - Ticket.created_at) / 86400
            ).label('avg_days')
        ).where(
            and_(
                Ticket.completed_at.isnot(None),
                Ticket.status == "completed"
            )
        )
    )
    avg_completion_days = avg_completion_result.scalar_one()
    avg_completion_days = round(avg_completion_days, 1) if avg_completion_days else None
    
    # Tickets by priority completion
    priority_completion_result = await db.execute(
        select(
            Ticket.priority,
            func.count(Ticket.id).label('total'),
            func.sum(
                case((Ticket.status == "completed", 1), else_=0)
            ).label('completed')
        ).group_by(Ticket.priority)
    )
    priority_completion = [
        {
            "priority": row.priority,
            "total": row.total,
            "completed": row.completed or 0,
            "completion_rate": round((row.completed or 0) / row.total * 100, 1) if row.total > 0 else 0
        }
        for row in priority_completion_result.all()
    ]
    
    # Recent completions (last 30 days)
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    recent_completions_result = await db.execute(
        select(func.count(Ticket.id)).where(
            and_(
                Ticket.completed_at >= thirty_days_ago,
                Ticket.status == "completed"
            )
        )
    )
    recent_completions = recent_completions_result.scalar_one() or 0
    
    return {
        "tickets_by_restorer": tickets_by_restorer,
        "average_completion_days": avg_completion_days,
        "priority_completion": priority_completion,
        "recent_completions_30d": recent_completions
    }

